import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ALLOWED_MODELS = new Set([DEFAULT_MODEL, 'claude-sonnet-5']);
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent',
  'Communication', 'Consulting', 'Other',
];

// Domain-aware prompt. These are Tanzanian TRA fiscal receipts, so we tell the model the
// exact field formats and the common OCR confusions (B/8, I/1, O/0, dropped leading 1) so
// it reads TIN/VRN/verification codes far more accurately.
const EXTRACT_PROMPT = `You are extracting structured data from a TANZANIAN TRA fiscal receipt image. Text may mix Swahili and English; amounts are TZS. Photos are often wrinkled, shadowed, or angled, so read every digit and letter with great care.

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
  "category": one of ${JSON.stringify(CATEGORIES)} | null,
  "low_confidence_fields": string[]
}

TANZANIA TRA FIELD RULES — follow exactly:
- vendor_tin: labelled "TIN". It is EXACTLY 9 digits (e.g. 101327036). It very often starts with a leading 1 — do NOT drop the first digit. Return digits only, no spaces.
- vendor_vrn: labelled "VRN". Format is digits ending in a letter, e.g. "10015084M" or "40-XXXXXX-X". Keep the trailing letter. Do not confuse with the TIN.
- verification_code: near the bottom, labelled "RECEIPT VERIFICATION CODE", usually just above a QR code (e.g. 8F9CDB204130). It is alphanumeric — read each character carefully and DISTINGUISH letters from digits: B vs 8, I vs 1, O vs 0, S vs 5, Z vs 2. Do not add or repeat characters.
- total_amount: the grand total INCLUDING VAT — the line "TOTAL INCL OF TAX" or "TOTAL". For fuel "Client Ticket" statements the total is the "TOTAL … TZS" line (ignore BALANCE, GLOBAL, REMAINDER, tank capacity — those are not the purchase amount).
- tax_amount: the VAT portion only — the "TAX A – 18%" / "TOTAL TAX" line. If the receipt shows no VAT, set null and add "tax_amount" to low_confidence_fields.
- receipt_number: the receipt/ticket number (e.g. "RECEIPT NO", "TICKET NO").
- Read all amounts digit-by-digit; never invent, drop, or duplicate a digit.

General rules:
- If a field cannot be read confidently, set it to null AND add its name to low_confidence_fields.
- Never invent a value. When in doubt, null it and flag it.
- category must be one from the enum. Choose the best fit based on vendor and line items; if unclear, use "Other".`;

function bad(msg, status = 400) { return json({ error: msg }, { status }); }
function safeParseJson(text) {
  const stripped = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(stripped); } catch { return null; }
}

// Attempts to mark the receipt as errored so the UI can surface a real message
// instead of leaving the row stuck in 'processing' forever.
async function markError(admin, receiptId, reason, detail) {
  if (!receiptId || !admin) return;
  await admin.from('receipts').update({
    status: 'error',
    raw_ai_response: { error: reason, detail: detail ?? null },
  }).eq('id', receiptId);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return bad('method not allowed', 405);

  // Parse body first so we always know which receipt to blame on error.
  let body = {};
  try { body = await req.json(); } catch {}
  const receiptId = (body.receipt_id || '').trim();
  const storagePath = (body.storage_path || '').trim();
  const model = body.model && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  const admin = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  if (!supabaseUrl || !serviceKey) return bad('server misconfigured (missing SUPABASE_URL/SERVICE_ROLE)', 500);
  if (!anthropicKey) {
    await markError(admin, receiptId, 'ANTHROPIC_API_KEY not set in Supabase edge function secrets');
    return bad('ANTHROPIC_API_KEY not set', 500);
  }
  if (!receiptId) return bad('receipt_id required');
  if (!storagePath) return bad('storage_path required');

  // 1. Download the image.
  const { data: fileBlob, error: dlErr } = await admin.storage.from('receipts').download(storagePath);
  if (dlErr || !fileBlob) {
    const detail = dlErr?.message ?? 'no data';
    console.error('storage download failed', storagePath, detail);
    await markError(admin, receiptId, 'storage download failed', detail);
    return bad(`download failed: ${detail}`, 500);
  }
  const mediaType = fileBlob.type || 'image/jpeg';
  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);

  // 2. Call Claude.
  let claudeRes, claudeJson;
  try {
    claudeRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        }],
      }),
    });
    claudeJson = await claudeRes.json();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('claude fetch failed', detail);
    await markError(admin, receiptId, 'claude fetch failed', detail);
    return bad(`claude fetch failed: ${detail}`, 502);
  }

  if (!claudeRes.ok) {
    const detail = JSON.stringify(claudeJson);
    console.error('claude rejected', claudeRes.status, detail);
    await markError(admin, receiptId, `claude ${claudeRes.status}`, detail);
    return bad(`claude rejected: ${claudeRes.status}`, 502);
  }

  const text = claudeJson?.content?.[0]?.text ?? '';
  const parsed = safeParseJson(text);
  if (!parsed) {
    console.error('unable to parse model output', text.slice(0, 300));
    await markError(admin, receiptId, 'model output was not valid JSON', text.slice(0, 500));
    return bad('unable to parse model output as JSON', 502);
  }

  const category = parsed.category && CATEGORIES.includes(parsed.category) ? parsed.category : null;

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
    status: 'confirmed',
  };

  const { error: updErr } = await admin.from('receipts').update(updates).eq('id', receiptId);
  if (updErr) {
    if (updErr.code === '23505') {
      await admin.from('receipts').update({ ...updates, status: 'duplicate' }).eq('id', receiptId);
      return json({ status: 'duplicate', receipt_id: receiptId }, { status: 200 });
    }
    await markError(admin, receiptId, 'db update failed', updErr.message);
    return bad(`update failed: ${updErr.message}`, 500);
  }

  return json({ status: 'confirmed', receipt_id: receiptId, category }, { status: 200 });
});
