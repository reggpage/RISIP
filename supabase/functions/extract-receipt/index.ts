// extract-receipt · POST { receipt_id, storage_path, model? }
//
// 1. Downloads the image from the private `receipts` bucket via service_role.
// 2. Sends it to Claude vision with a strict JSON-only prompt.
// 3. Parses the response and UPDATEs the receipts row:
//    - success  → status='confirmed', all fields populated, low_confidence_fields[] filled
//    - duplicate (verification_code collides in same company) → status='duplicate'
//    - anything else → status='error', raw_ai_response kept for debugging
//
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Model default: claude-haiku-4-5-20251001 (per Risip design). Caller can override with
// `claude-sonnet-5` for hard-to-read receipts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ALLOWED_MODELS = new Set([DEFAULT_MODEL, 'claude-sonnet-5']);
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent',
  'Communication', 'Consulting', 'Other',
] as const;

const EXTRACT_PROMPT = `You are extracting structured data from a receipt image (often from Tanzania, so amounts may be TZS and text may mix Swahili and English).

Return ONLY a single JSON object matching this exact schema. No prose, no markdown fences, no explanation.

{
  "vendor_name": string | null,
  "vendor_tin": string | null,
  "vendor_vrn": string | null,
  "receipt_number": string | null,
  "verification_code": string | null,
  "receipt_date": "YYYY-MM-DD" | null,
  "receipt_time": "HH:MM:SS" | null,
  "total_amount": number | null,
  "tax_amount": number | null,
  "category": ${JSON.stringify(CATEGORIES)}[number] | null,
  "low_confidence_fields": string[]
}

Rules:
- If a field cannot be read confidently from the image, set it to null AND add its name to low_confidence_fields.
- Never invent a value. When in doubt, null it and flag it.
- verification_code is the receipt's fiscal verification code (often a short alphanumeric string near the bottom).
- total_amount is the grand total (including VAT). tax_amount is the VAT portion only.
- category must be one from the enum. Choose the best fit based on vendor and line items; if unclear, use "Other".`;

interface ExtractBody {
  receipt_id?: string;
  storage_path?: string;
  model?: string;
}

interface ExtractedFields {
  vendor_name: string | null;
  vendor_tin: string | null;
  vendor_vrn: string | null;
  receipt_number: string | null;
  verification_code: string | null;
  receipt_date: string | null;
  receipt_time: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  category: string | null;
  low_confidence_fields: string[];
}

function bad(msg: string, status = 400) {
  return json({ error: msg }, { status });
}

function safeParseJson(text: string): ExtractedFields | null {
  // The model was told "no markdown fences", but be defensive anyway.
  const stripped = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  try {
    const obj = JSON.parse(stripped);
    return obj as ExtractedFields;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return bad('method not allowed', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!supabaseUrl || !serviceKey) return bad('server misconfigured', 500);
  if (!anthropicKey) return bad('ANTHROPIC_API_KEY not set', 500);

  let body: ExtractBody;
  try {
    body = (await req.json()) as ExtractBody;
  } catch {
    return bad('invalid json');
  }

  const receiptId = body.receipt_id?.trim();
  const storagePath = body.storage_path?.trim();
  const model = body.model && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
  if (!receiptId) return bad('receipt_id required');
  if (!storagePath) return bad('storage_path required');

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Download the image from Storage.
  const { data: fileBlob, error: dlErr } = await admin.storage.from('receipts').download(storagePath);
  if (dlErr || !fileBlob) {
    await admin.from('receipts').update({ status: 'error' }).eq('id', receiptId);
    return bad(`download failed: ${dlErr?.message ?? 'no data'}`, 500);
  }
  const mediaType = fileBlob.type || 'image/jpeg';
  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  // Base64 encode. Chunk to avoid stack overflow on large buffers.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);

  // 2. Call Claude.
  const claudeRes = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        },
      ],
    }),
  });

  const claudeJson = await claudeRes.json();
  if (!claudeRes.ok) {
    await admin.from('receipts').update({
      status: 'error',
      raw_ai_response: claudeJson,
    }).eq('id', receiptId);
    return bad(`claude rejected: ${claudeRes.status}`, 502);
  }

  const text = claudeJson?.content?.[0]?.text ?? '';
  const parsed = safeParseJson(text);
  if (!parsed) {
    await admin.from('receipts').update({
      status: 'error',
      raw_ai_response: claudeJson,
    }).eq('id', receiptId);
    return bad('unable to parse model output as JSON', 502);
  }

  // 3. Update the row. Try confirmed first; if the unique index blocks it, mark duplicate.
  const category = parsed.category && (CATEGORIES as readonly string[]).includes(parsed.category)
    ? parsed.category
    : null;

  const updates = {
    vendor_name: parsed.vendor_name,
    vendor_tin: parsed.vendor_tin,
    vendor_vrn: parsed.vendor_vrn,
    receipt_number: parsed.receipt_number,
    verification_code: parsed.verification_code,
    receipt_date: parsed.receipt_date,
    receipt_time: parsed.receipt_time,
    total_amount: parsed.total_amount,
    tax_amount: parsed.tax_amount,
    category,
    low_confidence_fields: parsed.low_confidence_fields ?? [],
    raw_ai_response: claudeJson,
    status: 'confirmed' as const,
  };

  const { error: updErr } = await admin.from('receipts').update(updates).eq('id', receiptId);
  if (updErr) {
    // 23505 = unique_violation → the verification_code already exists in this company.
    if (updErr.code === '23505') {
      await admin.from('receipts').update({ ...updates, status: 'duplicate' }).eq('id', receiptId);
      return json({ status: 'duplicate', receipt_id: receiptId }, { status: 200 });
    }
    return bad(`update failed: ${updErr.message}`, 500);
  }

  return json({ status: 'confirmed', receipt_id: receiptId, category }, { status: 200 });
});
