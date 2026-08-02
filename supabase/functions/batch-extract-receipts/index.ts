// batch-extract-receipts · POST { storage_path, model? }
// Sends one A4/A3 page (image OR PDF) containing many receipts to Claude and returns a
// JSON ARRAY — one object per receipt detected. Does NOT insert anything; the client
// shows a Batch Review Panel first, then bulk-inserts on approval.
//
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ALLOWED = new Set([DEFAULT_MODEL, 'claude-sonnet-5']);
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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

Read every digit carefully; never invent, drop, or duplicate a digit. Return the response STRICTLY as a raw JSON array of objects, one per receipt. Do not wrap it in markdown codeblocks. If a field cannot be read, use null. Example: [{"vendor":"RealBlocks Limited","vendor_tin":null,"vendor_vrn":null,"receipt_date":"2026-08-01","category":"Materials","verification_code":null,"net_amount":100000,"tax_amount":18000,"total_amount":118000}]`;

function parseArray(text: string): unknown[] | null {
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
  const { data: profile } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle();
  if (!profile) return json({ error: 'forbidden' }, 403);

  let body: { storage_path?: string; model?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const storagePath = (body.storage_path || '').trim();
  const model = body.model && ALLOWED.has(body.model) ? body.model : DEFAULT_MODEL;
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

  const claudeRes = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }],
    }),
  });
  const claudeJson = await claudeRes.json();
  if (!claudeRes.ok) return json({ error: 'claude rejected: ' + claudeRes.status, detail: claudeJson }, 502);

  const text = claudeJson?.content?.[0]?.text ?? '';
  const arr = parseArray(text);
  if (!arr) return json({ error: 'could not parse model output as a JSON array', raw: text.slice(0, 500) }, 502);

  return json({ receipts: arr, count: arr.length });
});
