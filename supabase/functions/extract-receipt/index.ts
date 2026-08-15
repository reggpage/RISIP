import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { compareWithTra, fetchTraReceipt } from '../_shared/traVerify.ts';
import { readReceiptQr } from '../_shared/receiptQr.ts';
import { json, preflight } from '../_shared/cors.ts';
import { CATEGORIES, normalizeMoney, normalizeTanzaniaReceipt } from '../_shared/tanzaniaReceiptKnowledge.ts';
import { extractedStatusReason, resolveExtractedStatus } from '../_shared/receiptStatus.ts';
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
- Copy the merchant/vendor name from the printed merchant line exactly when it is readable (for example, "PUMA HAZINA SERVICE STATION" or "GP NANENANE PETROL STATION"). A station name is the merchant name; do not shorten it to a brand such as "Puma Energy". Do not replace it with a famous fuel brand, a guessed company, the TRA logo, or a name from these instructions.
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

function isSamePhysicalReceipt(extracted: any, existing: any): boolean {
  const extractedTin = String(extracted.vendor_tin ?? '').replace(/\D/g, '');
  const existingTin = String(existing?.vendor_tin ?? '').replace(/\D/g, '');
  const extractedNumber = String(extracted.receipt_number ?? '').trim();
  const existingNumber = String(existing?.receipt_number ?? '').trim();
  const sameTotal = Number(extracted.total_amount) === Number(existing?.total_amount);
  // A verification-code collision alone is not proof: the model can mistake
  // O/0, I/1 etc. TIN, total and receipt number must agree before excluding it.
  return Boolean(
    extractedTin.length === 9
    && extractedTin === existingTin
    && sameTotal
    && extractedNumber
    && extractedNumber === existingNumber
  );
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

  // A company running the approval flow never lets extraction confirm a receipt,
  // however confident the model is: confirming is a human decision that must be
  // submitted and approved. Companies with the flow off keep today's behaviour
  // exactly, including auto-confirming a clean high-confidence read.
  const { data: companyRow } = await admin
    .from('receipts')
    .select('companies!inner(approval_flow_enabled)')
    .eq('id', receiptId)
    .maybeSingle();
  const approvalFlow = Boolean(
    (companyRow as { companies?: { approval_flow_enabled?: boolean } } | null)
      ?.companies?.approval_flow_enabled,
  );
  const finalStatus = resolveExtractedStatus(needsReview, approvalFlow);

  // ── The QR square beats reading the print ───────────────────────────────
  // A QR is decoded, not read: error-correcting and checksummed, so it is either
  // right or absent — there is no "nearly". The verification code is the one
  // field that must be exact, being the global duplicate key and the second
  // factor for the TRA lookup, and it is the field the model most often fumbles
  // (1097A5E214A5 for 18935E214576 on a real receipt).
  const qrDifference: { field: string; extracted: unknown; official: unknown }[] = [];
  const qrCode = readReceiptQr(bytes, mediaType);
  if (qrCode) {
    if (normalized.verification_code && normalized.verification_code.toUpperCase() !== qrCode) {
      qrDifference.push({ field: 'verificationCode (QR)', extracted: normalized.verification_code, official: qrCode });
    }
    normalized.verification_code = qrCode;
    // Decoded, so the model's doubt about this field no longer applies.
    const at = lowConfidence.indexOf('verification_code');
    if (at >= 0) lowConfidence.splice(at, 1);
  }

  // ── Ask TRA what the receipt actually says ──────────────────────────────
  // On a real receipt the model got five of seven fields wrong, including the
  // total (8,000 short on 58,000) and the verification code, which is the global
  // duplicate key. Where TRA answers, its figures are the ones stored; where it
  // does not, the model's reading is kept and the receipt is flagged rather than
  // silently trusted. A portal that is down must never stop a receipt being
  // recorded, so every failure here is soft.
  let tra: { status: string; at: string | null; differences: unknown | null } = {
    status: 'not_applicable', at: null, differences: null,
  };
  if (normalized.verification_code && normalized.receipt_time) {
    const lookup = await fetchTraReceipt(normalized.verification_code, normalized.receipt_time);
    if (lookup.ok) {
      const differences = compareWithTra({
        vendorName: normalized.vendor_name,
        vendorTin: normalized.vendor_tin,
        receiptNumber: normalized.receipt_number,
        totalInclTax: normalized.total_amount,
        verificationCode: normalized.verification_code,
        receiptDate: normalized.receipt_date,
      }, lookup.receipt);

      // TRA is the issuer of record. Only overwrite what it actually stated.
      const official = lookup.receipt;
      if (official.vendorName) normalized.vendor_name = official.vendorName;
      if (official.vendorTin) normalized.vendor_tin = official.vendorTin;
      if (official.vendorVrn) normalized.vendor_vrn = official.vendorVrn;
      if (official.receiptNumber) normalized.receipt_number = official.receiptNumber;
      if (official.receiptDate) normalized.receipt_date = official.receiptDate;
      if (official.receiptTime) normalized.receipt_time = official.receiptTime;
      if (official.totalInclTax !== null) normalized.total_amount = official.totalInclTax;
      if (official.totalTax !== null) normalized.tax_amount = official.totalTax;
      if (official.verificationCode) normalized.verification_code = official.verificationCode;

      // Verified figures are TRA's own, so the model's uncertainty about them no
      // longer needs a human to look.
      for (const field of ['total_amount', 'verification_code', 'vendor_name', 'vendor_tin', 'receipt_number']) {
        const at = lowConfidence.indexOf(field);
        if (at >= 0) lowConfidence.splice(at, 1);
      }
      const all = [...qrDifference, ...differences];
      tra = { status: 'verified', at: new Date().toISOString(), differences: all.length ? all : null };
    } else {
      tra = {
        status: lookup.reason === 'unreachable' ? 'unreachable' : 'not_found',
        at: null,
        differences: qrDifference.length ? qrDifference : null,
      };
      // A code TRA does not recognise is almost always a misread one, and it is
      // the field the duplicate guard depends on. Say so instead of assuming.
      if (lookup.reason === 'not_found') lowConfidence.push('verification_code');
    }
  }

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
    status: finalStatus,
    tra_status: tra.status,
    tra_verified_at: tra.at,
    tra_differences: tra.differences,
  };

  const { error: updErr } = await admin.from('receipts').update(updates).eq('id', receiptId);
  if (updErr) {
    if (updErr.code === '23505') {
      const { data: original } = normalized.verification_code
        ? await admin
          .from('receipts')
          .select('id, vendor_tin, total_amount, receipt_number')
          .eq('verification_code', normalized.verification_code)
          .neq('id', receiptId)
          .neq('status', 'duplicate')
          .maybeSingle()
        : { data: null };
      // A code the model guessed at can collide by accident. A code decoded from
      // the QR, or confirmed by TRA, cannot: it is one transaction, and a
      // collision means this really is the same physical receipt. Treat those as
      // certain rather than putting them through the OCR-doubt path, which is
      // what filed a third copy of one fuel receipt as a fresh expense.
      const codeIsCertain = Boolean(qrCode) || tra.status === 'verified';
      if (original && (codeIsCertain || isSamePhysicalReceipt(normalized, original))) {
        await admin.from('receipts').update({
          ...updates,
          status: 'duplicate',
          duplicate_of: original.id,
        }).eq('id', receiptId);
        return json({ status: 'duplicate', receipt_id: receiptId }, { status: 200 });
      }
      // Do not exclude a real expense just because an uncertain OCR code happens
      // to collide. The original AI value remains in raw_ai_response for review.
      await admin.from('receipts').update({
        ...updates,
        verification_code: null,
        status: 'pending_review',
        duplicate_of: null,
        low_confidence_fields: [...new Set([...lowConfidence, 'verification_code'])],
      }).eq('id', receiptId);
      return json({ status: 'pending_review', receipt_id: receiptId, reason: 'verification code needs review' }, { status: 200 });
    }
    await markError(admin, receiptId, 'db update failed', updErr.message);
    return bad(`update failed: ${updErr.message}`, 500);
  }

  return json({
    status: finalStatus,
    receipt_id: receiptId,
    category,
    // Say which of the two reasons applies, so the caller can word the message
    // correctly instead of implying the extraction was poor.
    reason: extractedStatusReason(needsReview, approvalFlow),
  }, { status: 200 });
});
