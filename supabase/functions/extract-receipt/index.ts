import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';
import { CATEGORIES, normalizeMoney, normalizeTanzaniaReceipt } from '../_shared/tanzaniaReceiptKnowledge.ts';
import { resolveAnthropicModel } from '../_shared/anthropicModel.ts';
import { applyCompanyMerchantMemory } from '../_shared/merchantMemory.ts';

// Use the higher-accuracy model for the first pass too. Re-analysis used to be
// better simply because it was the only path using Sonnet, which made the same
// receipt produce inconsistent totals.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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
  "total_amount_evidence": string | null,
  "tax_amount": number | null,
  "category": one of ${JSON.stringify(CATEGORIES)} | null,
  "low_confidence_fields": string[],
  "merchant_hint": string | null,
  "raw_text_excerpt": string | null
}

TANZANIA TRA FIELD RULES — follow exactly:
- vendor_tin: labelled "TIN". It is EXACTLY 9 digits (e.g. 101327036). It very often starts with a leading 1 — do NOT drop the first digit. Return digits only, no spaces.
- vendor_vrn: labelled "VRN". Format is digits ending in a letter, e.g. "10015084M" or "40-XXXXXX-X". Keep the trailing letter. Do not confuse with the TIN.
- verification_code: near the bottom, labelled "RECEIPT VERIFICATION CODE", usually just above a QR code (e.g. 8F9CDB204130). It is alphanumeric — read each character carefully and DISTINGUISH letters from digits: B vs 8, I vs 1, O vs 0, S vs 5, Z vs 2. Do not add or repeat characters.
- total_amount: the grand total INCLUDING VAT — the line "TOTAL INCL OF TAX" or "TOTAL". For fuel "Client Ticket" statements the total is the "TOTAL … TZS" line (ignore BALANCE, GLOBAL, REMAINDER, tank capacity — those are not the purchase amount). Return a JSON number in TZS with no separators: 176,018, 176.018, and 176 018 all mean 176018; a decimal is allowed only when the receipt clearly shows one or two fractional digits.
- total_amount_evidence: copy the exact printed TOTAL line used for total_amount, including its amount (for example "TOTAL INCLUSIVE OF TAX 65,200"). This must be a transcription, not a calculation. If the total line cannot be read clearly, set both total_amount and total_amount_evidence to null and include "total_amount" in low_confidence_fields.
- tax_amount: the VAT portion only — the "TAX A – 18%" / "TOTAL TAX" line. If the receipt shows no VAT, set null and add "tax_amount" to low_confidence_fields. Apply the same TZS separator rule.
- receipt_number: the receipt/ticket number (e.g. "RECEIPT NO", "TICKET NO").
- receipt_date: when the printed date uses a two-digit year such as 06-08-26, interpret it as 2026 (20YY), not 2006, unless the receipt clearly prints a four-digit year.
- Read all amounts digit-by-digit; never invent, drop, or duplicate a digit. Before returning, read the grand-total line a second time. Never calculate a total from line items and never add a digit because an amount "looks more likely".

Tanzania merchant context:
- "START OF LEGAL RECEIPT", "START OF UCON RECEIPT", "START OF LEON RECEIPT" and similar headers are NOT merchant names. Read the merchant printed below/near the logo/TIN.
- Copy the merchant/vendor name from the printed merchant line exactly when it is readable (for example, "GP NANENANE PETROL STATION"). Do not replace it with a famous fuel brand, a guessed company, the TRA logo, or a name from these instructions.
- The word "TOTAL" in "TOTAL EXCLUSIVE OF TAX", "TOTAL TAX", or "TOTAL INCLUSIVE OF TAX" is an amount label, never the vendor. Do not infer TotalEnergies from that word or from the fact that the receipt is for fuel.
- TotalEnergies, Total Energy, Total, TokiEnergy/TokiEnergies/TokroEnergies OCR variants, Oilcom, Puma Energy, Oryx Energies, Engen, Lake Oil, GBP, Camel Oil, MOIL, GAPCO, Vivo Energy/Shell, Hass Petroleum, Star Oil, Mogas, Acer Petroleum, Mount Meru, Petro Africa, Petrofuel, Sahara Energy, Dalbit, Olympic Petroleum, Natoil, Afroil, General Petroleum, World Oil, TIPER, and petrol/service/filling stations are fuel merchants. Categorize them as Fuel, not Utilities.
- If a receipt sells petrol, diesel, kerosene, lubricant, or station fuel, category must be Fuel.
- If OCR is noisy but the logo/brand clearly says TotalEnergies, return vendor "TotalEnergies" exactly.
- If the first line is only a legal receipt header, look below it. For supermarket receipts, the merchant may be "SHOPPERS SUPERMARKET LTD." even when the header says "START OF LEGAL RECEIPT".

General rules:
- If a field cannot be read confidently, set it to null AND add its name to low_confidence_fields.
- Never invent a value. When in doubt, null it and flag it.
- category must be one from the enum. Choose the best fit based on vendor and line items; if unclear, use "Other".`;

function bad(msg, status = 400) { return json({ error: msg }, { status }); }
function extractBalancedObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function safeParseJson(text) {
  const stripped = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^<json>\s*/i, '')
    .replace(/\s*<\/json>$/i, '')
    .trim();
  const candidates = [stripped, extractBalancedObject(stripped)].filter(Boolean);

  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {}

    // Be tolerant of a trailing comma if the model returned an otherwise
    // complete object. Do not attempt broad text rewriting that could change
    // receipt amounts or identifiers.
    try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')); } catch {}
  }
  return null;
}

function imageMediaType(type) {
  const normalized = (type || '').toLowerCase().split(';')[0].trim();
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(normalized)
    ? normalized
    : 'image/jpeg';
}

function amountFromEvidence(value: unknown): number | null {
  const candidates = String(value ?? '').match(/\d[\d,\.\s]*/g);
  return candidates?.length ? normalizeMoney(candidates[candidates.length - 1]) : null;
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
  const model = await resolveAnthropicModel(anthropicKey, body.model);
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
  const mediaType = imageMediaType(fileBlob.type);
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
    if (claudeRes.status === 401 || claudeRes.status === 403) {
      return json({
        error: 'Receipt AI is not configured. An administrator must update the Anthropic API key in Supabase secrets.',
        code: 'AI_AUTH_CONFIG_ERROR',
      }, { status: 503 });
    }
    if (claudeRes.status === 429 || claudeRes.status === 529 || claudeRes.status >= 500) {
      return json({
        error: 'Receipt AI is temporarily unavailable. Please try again shortly.',
        code: claudeRes.status === 429 ? 'AI_RATE_LIMITED' : 'AI_TEMPORARILY_UNAVAILABLE',
      }, { status: 503 });
    }
    const providerMessage = claudeJson?.error?.message || claudeJson?.message || 'The AI provider rejected the request.';
    return json({
      error: 'Receipt extraction could not be completed.',
      code: 'AI_PROVIDER_REJECTED',
      detail: providerMessage,
    }, { status: 502 });
  }

  const text = Array.isArray(claudeJson?.content)
    ? claudeJson.content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
    : '';
  const parsed = safeParseJson(text);
  if (!parsed) {
    console.error('unable to parse model output', text.slice(0, 300));
    await markError(admin, receiptId, 'model output was not valid JSON', text.slice(0, 500));
    return bad('unable to parse model output as JSON', 502);
  }

  const normalizedBase = normalizeTanzaniaReceipt(parsed);
  const { data: receiptContext } = await admin
    .from('receipts')
    .select('company_id')
    .eq('id', receiptId)
    .maybeSingle();
  const normalized = await applyCompanyMerchantMemory(admin, receiptContext?.company_id, normalizedBase);
  const category = normalized.category && CATEGORIES.includes(normalized.category) ? normalized.category : null;
  const lowConfidence = Array.isArray(parsed.low_confidence_fields)
    ? [...new Set(parsed.low_confidence_fields.filter((field) => typeof field === 'string'))]
    : [];
  const evidenceAmount = amountFromEvidence(parsed.total_amount_evidence);
  if (normalized.total_amount == null || evidenceAmount == null || evidenceAmount !== normalized.total_amount) {
    lowConfidence.push('total_amount');
  }
  const needsReview = lowConfidence.length > 0;

  const updates = {
    vendor_name: normalized.vendor_name,
    vendor_tin: normalized.vendor_tin,
    vendor_vrn: normalized.vendor_vrn,
    receipt_number: normalized.receipt_number,
    verification_code: normalized.verification_code,
    receipt_date: normalized.receipt_date,
    receipt_time: normalized.receipt_time,
    total_amount: normalized.total_amount,
    tax_amount: normalized.tax_amount,
    category,
    low_confidence_fields: [...new Set(lowConfidence)],
    raw_ai_response: claudeJson,
    status: needsReview ? 'pending_review' : 'confirmed',
  };

  const { error: updErr } = await admin.from('receipts').update(updates).eq('id', receiptId);
  if (updErr) {
    if (updErr.code === '23505') {
      const { data: original } = normalized.verification_code
        ? await admin
          .from('receipts')
          .select('id')
          .eq('verification_code', normalized.verification_code)
          .neq('id', receiptId)
          .neq('status', 'duplicate')
          .maybeSingle()
        : { data: null };
      await admin.from('receipts').update({
        ...updates,
        status: 'duplicate',
        duplicate_of: original?.id ?? null,
      }).eq('id', receiptId);
      return json({ status: 'duplicate', receipt_id: receiptId }, { status: 200 });
    }
    await markError(admin, receiptId, 'db update failed', updErr.message);
    return bad(`update failed: ${updErr.message}`, 500);
  }

  return json({ status: needsReview ? 'pending_review' : 'confirmed', receipt_id: receiptId, category }, { status: 200 });
});
