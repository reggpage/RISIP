// batch-extract-receipts · POST { storage_path, model? }
// Sends one A4/A3 page (image OR PDF) containing many receipts to Claude and returns a
// JSON ARRAY — one object per receipt detected. Does NOT insert anything; the client
// shows a Batch Review Panel first, then bulk-inserts on approval.
//
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { normalizeTanzaniaReceipt } from '../_shared/tanzaniaReceiptKnowledge.ts';
import { resolveAnthropicModel } from '../_shared/anthropicModel.ts';
import { applyCompanyMerchantMemory } from '../_shared/merchantMemory.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
type AnthropicResponse = {
  error?: { message?: string };
  content?: Array<{ text?: string }>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...corsHeaders } });
}

const PROMPT = `This image or PDF is a single A4 or A3 page (portrait OR landscape) containing one or more TANZANIAN TRA fiscal receipts laid out or printed together. Individual receipts may be rotated (90°, 180°, or sideways) relative to the page — mentally rotate each one and read it in its correct orientation. Scan the entire page carefully and identify every distinct receipt present, however it is oriented.

For EACH distinct receipt found, extract:
1. vendor (Merchant name)
2. vendor_tin (TIN — EXACTLY 9 digits, e.g. 101327036; keep the leading 1, digits only)
3. vendor_vrn (VRN — digits ending in a letter, e.g. 10015084M)
4. receipt_date (YYYY-MM-DD)
5. category (one of: Materials, Fuel, Food, Transport, Equipment, Office, Utilities, Rent, Communication, Consulting, Labor, Other)
6. verification_code (alphanumeric TRA code near a QR; distinguish B/8, I/1, O/0, S/5, Z/2 — do not add or repeat characters)
7. net_amount (number)
8. tax_amount (VAT only; null if none)
9. total_amount (grand total INCL of VAT — the "TOTAL INCL OF TAX" / "TOTAL … TZS" line)
10. crop_box (for image inputs only: normalized page coordinates { "x": 0..1, "y": 0..1, "width": 0..1, "height": 0..1 } around the ENTIRE physical receipt, including all four edges, the QR code, and the footer; include a small margin and never crop at the merchant header or total line; use null if uncertain)
11. merchant_hint (short text/brand/logo evidence you used for the vendor; e.g. "SHOPPERS SUPERMARKET LTD" or "TotalEnergies logo")
12. raw_text_excerpt (one or two key lines around the merchant/TIN/date/total; do not include the full receipt)

Tanzania merchant context:
- The words "START OF LEGAL RECEIPT", "START OF UCON RECEIPT", "START OF LEON RECEIPT" and similar headers are NOT merchant names. Read the merchant printed below/near the logo/TIN. Preserve the full printed station name (for example, "PUMA HAZINA SERVICE STATION"); do not shorten it to only a fuel brand.
- TotalEnergies, Total Energy, Total, TokiEnergy/TokiEnergies/TokroEnergies OCR variants, Oilcom, Puma Energy, Oryx Energies, Engen, Lake Oil, GBP, Camel Oil, MOIL, GAPCO, Vivo Energy/Shell, Hass Petroleum, Star Oil, Mogas, Acer Petroleum, Mount Meru, Petro Africa, Petrofuel, Sahara Energy, Dalbit, Olympic Petroleum, Natoil, Afroil, General Petroleum, World Oil, TIPER, and petrol/service/filling stations are fuel merchants. Categorize them as Fuel, not Utilities.
- If a receipt sells petrol, diesel, kerosene, lubricant, or station fuel, category must be Fuel.
- If OCR is noisy but the logo/brand clearly says TotalEnergies, return vendor "TotalEnergies" exactly.
- If the first line is only a legal receipt header, look below it. For the left receipts in this example shape, the merchant line can be "SHOPPERS SUPERMARKET LTD." even when the header says "START OF LEGAL RECEIPT".

Read every digit carefully; never invent, drop, or duplicate a digit. Before returning, verify that every crop_box is a complete receipt crop and that no two crop boxes describe the same receipt. Return the response STRICTLY as a raw JSON array of objects, one per receipt. Do not wrap it in markdown codeblocks. If a field cannot be read, use null. Example: [{"vendor":"RealBlocks Limited","vendor_tin":null,"vendor_vrn":null,"receipt_date":"2026-08-01","category":"Materials","verification_code":null,"net_amount":100000,"tax_amount":18000,"total_amount":118000,"crop_box":{"x":0.1,"y":0.1,"width":0.35,"height":0.4},"merchant_hint":"RealBlocks Limited","raw_text_excerpt":"TIN ... TOTAL ..."}]`;

function parseArray(text: string): unknown[] | null {
  const stripped = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { receipts?: unknown[] }).receipts)) {
      return (parsed as { receipts: unknown[] }).receipts;
    }
    return null;
  } catch {
    const m = stripped.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'server misconfigured' }, 500);
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'missing bearer token' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.slice(7));
  if (userErr || !userData.user) return json({ error: 'invalid session' }, 401);
  const uid = userData.user.id;

  // Any company member (incl. staff) may extract — it only reads the page and returns JSON;
  // the actual receipts are inserted client-side under the caller's own RLS.
  const { data: profile } = await admin.from('profiles').select('role, company_id').eq('id', uid).maybeSingle();
  if (!profile) return json({ error: 'forbidden' }, 403);

  let body: { storage_path?: string; model?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const storagePath = (body.storage_path || '').trim();
  const model = await resolveAnthropicModel(anthropicKey, body.model);
  if (!storagePath) return json({ error: 'storage_path required' }, 400);

  const { data: fileBlob, error: dlErr } = await admin.storage.from('receipts').download(storagePath);
  if (dlErr || !fileBlob) return json({ error: 'download failed: ' + (dlErr?.message ?? 'no data') }, 500);
  const rawType = (fileBlob.type || '').toLowerCase();
  const isPdf = rawType.includes('pdf') || storagePath.toLowerCase().endsWith('.pdf');
  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const b64 = btoa(binary);

  // PDFs go in as a `document` block (Claude reads every page); images as an `image` block.
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: rawType || 'image/jpeg', data: b64 } };

  let claudeRes: Response;
  let claudeJson: AnthropicResponse;
  try {
    claudeRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }],
      }),
    });
    const responseText = await claudeRes.text();
    try { claudeJson = JSON.parse(responseText) as AnthropicResponse; }
    catch { return json({ error: 'The AI service returned an invalid response.', detail: responseText.slice(0, 300) }, 502); }
  } catch (error) {
    return json({ error: 'The AI service could not be reached. Please try again shortly.', detail: error instanceof Error ? error.message : String(error) }, 503);
  }
  if (!claudeRes.ok) {
    if (claudeRes.status === 429 || claudeRes.status === 529 || claudeRes.status >= 500) {
      return json({ error: 'Receipt splitting is temporarily unavailable. Please try again shortly.', code: 'AI_TEMPORARILY_UNAVAILABLE' }, 503);
    }
    return json({ error: 'Receipt splitting could not be completed.', detail: claudeJson?.error?.message ?? claudeJson }, 502);
  }

  const text = claudeJson?.content?.[0]?.text ?? '';
  const arr = parseArray(text);
  if (!arr) return json({ error: 'could not parse model output as a JSON array', raw: text.slice(0, 500) }, 502);

  const receipts = await Promise.all(arr.map(async (row) => row && typeof row === 'object'
    ? applyCompanyMerchantMemory(admin, profile.company_id, normalizeTanzaniaReceipt(row as Record<string, unknown>))
    : row));

  return json({ receipts, count: receipts.length });
});
