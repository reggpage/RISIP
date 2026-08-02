// inbound-email · Webhook for scan-to-email (Canon "Scan to Email" → Risip).
//
// A company's office printer scans an A3 sheet of receipts and emails it to that
// company's unique inbox address, e.g. <scanner_inbox_token>@scan.risip.co. The email
// provider (Resend Inbound / SendGrid / Mailgun) POSTs the parsed message here. We:
//   1. Read the recipient address → find the company by scanner_inbox_token.
//   2. (Optional hardening) verify the sender matches company.scanner_sender_email.
//   3. Upload the image attachment to the `receipts` storage bucket.
//   4. Ask Claude to split the A3 page into individual receipts.
//   5. Insert those receipts as status='pending_review' so the accountant reviews them
//      in the app before they count.
//
// verify_jwt = false — this is a public webhook. Security comes from the unguessable
// inbox token in the recipient address plus the optional authorized-sender check.
//
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INBOUND_WEBHOOK_SECRET?

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// The subdomain we accept scanner mail on. Local part of the address = inbox token.
const INBOX_DOMAIN = 'scan.risip.co';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...corsHeaders } });
}

const PROMPT = `This image is a large flatbed scanner page (A3 size) containing a high density of multiple physical receipts laid out together. Scan the entire A3 surface area carefully and identify every distinct receipt present in this document.

For EACH distinct receipt found, extract the following information:
1. vendor (Merchant name)
2. vendor_tin (Taxpayer Identification Number)
3. vendor_vrn (VAT Registration Number)
4. receipt_date (YYYY-MM-DD format)
5. category (one of: Materials, Fuel, Food, Transport, Equipment, Office, Utilities, Rent, Communication, Consulting, Labor, Other)
6. verification_code (TRA Verification signature/code)
7. net_amount (number)
8. tax_amount (VAT, number)
9. total_amount (number)

Return the response STRICTLY as a raw JSON array of objects, where each object represents one receipt. Do not wrap it in markdown codeblocks. If a field cannot be read, use null. Example: [{"vendor":"RealBlocks Limited","vendor_tin":null,"vendor_vrn":null,"receipt_date":"2026-08-01","category":"Materials","verification_code":null,"net_amount":100000,"tax_amount":18000,"total_amount":118000}]`;

type ExtractedReceipt = {
  vendor: string | null;
  vendor_tin: string | null;
  vendor_vrn: string | null;
  receipt_date: string | null;
  category: string | null;
  verification_code: string | null;
  net_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
};

function parseArray(text: string): ExtractedReceipt[] | null {
  const stripped = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const m = stripped.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

// Pull a bare email address out of "Display Name <user@host>" or a plain address.
function extractEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/<([^>]+)>/);
  const addr = (m ? m[1] : raw).trim().toLowerCase();
  return addr.includes('@') ? addr : null;
}

// The recipient field varies by provider: a string, an array of strings, or an array of
// { address } / { email } objects. Normalize to a list of bare addresses.
function collectRecipients(payload: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
  for (const key of ['to', 'To', 'recipient', 'recipients', 'envelope']) {
    const v = (data as Record<string, unknown>)[key] ?? (payload as Record<string, unknown>)[key];
    if (v == null) continue;
    if (Array.isArray(v)) candidates.push(...v);
    else candidates.push(v);
  }
  const out: string[] = [];
  for (const c of candidates) {
    if (typeof c === 'string') {
      // Mailgun envelope / comma-joined header → split.
      for (const part of c.split(',')) { const e = extractEmail(part); if (e) out.push(e); }
    } else if (c && typeof c === 'object') {
      const obj = c as Record<string, unknown>;
      const e = extractEmail(obj.address ?? obj.email ?? obj.to);
      if (e) out.push(e);
    }
  }
  return out;
}

// Normalize attachments across providers to { contentType, filename, bytes }.
function collectAttachments(payload: Record<string, unknown>): Array<{ contentType: string; filename: string; bytes: Uint8Array }> {
  const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
  const raw = (data.attachments ?? (payload as Record<string, unknown>).attachments) as unknown;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ contentType: string; filename: string; bytes: Uint8Array }> = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const obj = a as Record<string, unknown>;
    const contentType = String(obj.content_type ?? obj.contentType ?? obj.type ?? '').toLowerCase();
    const filename = String(obj.filename ?? obj.name ?? 'scan');
    // Content is usually base64 (Resend/SendGrid); Mailgun sends a URL we skip.
    const content = obj.content ?? obj.data ?? obj.Content;
    if (typeof content !== 'string') continue;
    let b64 = content;
    // Strip a data: URI prefix if present.
    const comma = b64.indexOf('base64,');
    if (comma >= 0) b64 = b64.slice(comma + 7);
    try {
      const bin = atob(b64.replace(/\s/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      out.push({ contentType, filename, bytes });
    } catch { /* not base64 → skip */ }
  }
  return out;
}

function isImageAttachment(a: { contentType: string; filename: string }): boolean {
  if (a.contentType.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|heic|tiff?)$/i.test(a.filename);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'server misconfigured' }, 500);

  // Optional shared-secret gate: if INBOUND_WEBHOOK_SECRET is set, require it as a query
  // param (?secret=) or x-webhook-secret header so random POSTs can't drive extraction.
  const expectedSecret = Deno.env.get('INBOUND_WEBHOOK_SECRET');
  if (expectedSecret) {
    const url = new URL(req.url);
    const got = url.searchParams.get('secret') ?? req.headers.get('x-webhook-secret');
    if (got !== expectedSecret) return json({ error: 'unauthorized' }, 401);
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Resolve the company from the inbox token in the recipient address.
  const recipients = collectRecipients(payload);
  let inboxToken: string | null = null;
  for (const addr of recipients) {
    const [local, domain] = addr.split('@');
    if (!local) continue;
    // Short token shape: <name-slug>.<4 hex>, e.g. mhandisi.41b6. Accept it on our inbox
    // subdomain, or on any domain when the local part matches the token shape (keeps us
    // working if the customer routes a different domain to this function).
    const looksLikeToken = /^[a-z0-9]{2,15}\.[0-9a-f]{4}$/i.test(local);
    if (domain === INBOX_DOMAIN || looksLikeToken) { inboxToken = local.toLowerCase(); break; }
  }
  if (!inboxToken) {
    // 202: acknowledge so the provider doesn't retry, but nothing to do.
    return json({ ok: false, reason: 'no recognizable inbox address', recipients }, 202);
  }

  const { data: company } = await admin
    .from('companies')
    .select('id, scanner_sender_email')
    .eq('scanner_inbox_token', inboxToken)
    .maybeSingle();
  if (!company) return json({ ok: false, reason: 'unknown company inbox' }, 202);

  // 2. Optional sender hardening.
  if (company.scanner_sender_email) {
    const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
    const from = extractEmail(data.from ?? (payload as Record<string, unknown>).from ?? data.sender);
    if (!from || from !== String(company.scanner_sender_email).trim().toLowerCase()) {
      return json({ ok: false, reason: 'sender not authorized', from }, 202);
    }
  }

  // 3. Pick the target project (most recently created active project) and the owner as
  //    the on-behalf uploader — inbound email carries no project or user context.
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', company.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!project) return json({ ok: false, reason: 'company has no active project to file into' }, 202);

  const { data: owner } = await admin
    .from('profiles')
    .select('id')
    .eq('company_id', company.id)
    .eq('role', 'owner')
    .maybeSingle();
  if (!owner) return json({ ok: false, reason: 'company owner not found' }, 202);

  const attachments = collectAttachments(payload).filter(isImageAttachment);
  if (attachments.length === 0) return json({ ok: false, reason: 'no image attachment' }, 202);
  const image = attachments[0];

  // 4. Upload to the receipts bucket (same bucket the audit-trail image viewer reads).
  const docId = crypto.randomUUID();
  const path = `${project.id}/inbound/${docId}.jpg`;
  const mediaType = image.contentType.startsWith('image/') ? image.contentType : 'image/jpeg';
  const { error: upErr } = await admin.storage.from('receipts')
    .upload(path, image.bytes, { contentType: mediaType, upsert: false });
  if (upErr) return json({ error: 'upload failed: ' + upErr.message }, 500);

  const { data: doc, error: docErr } = await admin
    .from('scanned_documents')
    .insert({ company_id: company.id, project_id: project.id, file_url: path, created_by: owner.id })
    .select('id')
    .single();
  if (docErr) return json({ error: 'scanned_documents insert failed: ' + docErr.message }, 500);

  // 5. Extract with Claude.
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < image.bytes.length; i += chunk) binary += String.fromCharCode(...image.bytes.subarray(i, i + chunk));
  const b64 = btoa(binary);

  const claudeRes = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });
  const claudeJson = await claudeRes.json();
  if (!claudeRes.ok) return json({ error: 'claude rejected: ' + claudeRes.status, detail: claudeJson }, 502);

  const rows = parseArray(claudeJson?.content?.[0]?.text ?? '');
  if (!rows || rows.length === 0) {
    return json({ ok: true, company_id: company.id, scanned_doc_id: doc.id, imported: 0, reason: 'no receipts detected' });
  }

  // 6. Insert as pending_review. Clamp VAT so the receipt_vat_guard trigger never rejects
  //    the batch — flag any clamped/absent field for the accountant instead.
  const payloadRows = rows.map((r) => {
    const total = typeof r.total_amount === 'number' ? r.total_amount : null;
    let tax = typeof r.tax_amount === 'number' ? r.tax_amount : null;
    const low: string[] = [];
    if (tax !== null && total !== null && tax > total) { tax = null; low.push('tax_amount'); }
    if (total === null) low.push('total_amount');
    if (!r.vendor) low.push('vendor_name');
    return {
      project_id: project.id,
      company_id: company.id,
      uploaded_by: owner.id,
      image_url: path,
      scanned_doc_id: doc.id,
      vendor_name: r.vendor,
      vendor_tin: r.vendor_tin,
      vendor_vrn: r.vendor_vrn,
      receipt_date: r.receipt_date,
      category: r.category,
      verification_code: r.verification_code,
      total_amount: total,
      tax_amount: tax,
      status: 'pending_review',
      payment_method: 'cash_personal',
      low_confidence_fields: low,
      raw_ai_response: { source: 'inbound_email', inbox_token: inboxToken },
    };
  });

  const { error: insErr } = await admin.from('receipts').insert(payloadRows);
  if (insErr) return json({ error: 'receipts insert failed: ' + insErr.message }, 500);

  return json({ ok: true, company_id: company.id, scanned_doc_id: doc.id, imported: payloadRows.length });
});
