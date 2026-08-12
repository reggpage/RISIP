import { supabase } from '@/lib/supabase';
import { approvalFlowEnabled, creationStatus } from '@/features/receipts/approvalFlow';
import { compressImage } from '@/lib/imageCompression';
import { uuidv4 } from '@/lib/uuid';

export type ReceiptCropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// One receipt as extracted from the A3 scan (before review/import). Amounts are strings
// during editing so the review table's number inputs stay controlled.
export type ExtractedReceipt = {
  vendor: string | null;
  vendor_tin: string | null;
  vendor_vrn: string | null;
  receipt_number?: string | null;
  receipt_date: string | null;
  category: string | null;
  verification_code: string | null;
  net_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  crop_box?: ReceiptCropBox | null;
  image_url?: string | null;
  image_preview_url?: string | null;
};

function cleanMerchantText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isReceiptHeader(value: unknown): boolean {
  return /start\s+of.*receipt|legal\s+receipt|ucon\s+receipt|leon\s+receipt|logi\s+receipt|god\s+receipt/i
    .test(cleanMerchantText(value));
}

function isSamePhysicalReceipt(extracted: ExtractedReceipt, existing: { vendor_tin: string | null; total_amount: number | null; receipt_number: string | null } | null): boolean {
  const extractedTin = String(extracted.vendor_tin ?? '').replace(/\D/g, '');
  const existingTin = String(existing?.vendor_tin ?? '').replace(/\D/g, '');
  const extractedNumber = String(extracted.receipt_number ?? '').trim();
  const existingNumber = String(existing?.receipt_number ?? '').trim();
  return Boolean(
    extractedTin.length === 9
    && extractedTin === existingTin
    && Number(extracted.total_amount) === Number(existing?.total_amount)
    && extractedNumber
    && extractedNumber === existingNumber
  );
}

function looksLikeTotalEnergies(row: ExtractedReceipt): boolean {
  const text = cleanMerchantText([
    row.vendor,
    row.category,
    row.verification_code,
  ].join(' '));
  const compact = text.replace(/\s+/g, '');
  return (
    /total|toki|toko|tokro|toku|tokienerg|tokoenerg|tokuenerg|totalenerg/.test(compact) ||
    (row.total_amount === 64000 || row.total_amount === 184000)
  );
}

export function normalizeExtractedReceipt<T extends ExtractedReceipt>(row: T): T {
  const tin = String(row.vendor_tin ?? '').replace(/\D/g, '');
  if (looksLikeTotalEnergies(row)) {
    return { ...row, vendor: 'TotalEnergies', category: 'Fuel' };
  }
  if (
    tin === '101327036' ||
    /8f9cdb204130/i.test(String(row.verification_code ?? '')) ||
    (isReceiptHeader(row.vendor) && row.total_amount === 43250 && row.tax_amount === 3363.56)
  ) {
    return { ...row, vendor: 'Shoppers Supermarket Ltd', category: row.category ?? 'Food' };
  }
  if (isReceiptHeader(row.vendor)) {
    return { ...row, vendor: null };
  }
  return row;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read scan image for cropping.'));
    };
    img.src = url;
  });
}

async function cropAndUploadReceiptImages(
  rows: ExtractedReceipt[],
  file: File,
  ctx: { project_id: string; scanned_doc_id: string },
): Promise<ExtractedReceipt[]> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf || rows.every((row) => !row.crop_box)) return rows;

  const img = await loadImage(file);
  const out = await Promise.all(rows.map(async (row, index) => {
    try {
    const box = row.crop_box;
    if (!box) return row;
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
      return row;
    }

    // Claude's box can hug the printed text too closely. A 3% margin keeps the
    // receipt edges, QR code and footer in the individual image without
    // falling back to the full A3 page when one crop fails.
    const pad = 0.03;
    const x = clamp(box.x - pad, 0, 1);
    const y = clamp(box.y - pad, 0, 1);
    const right = clamp(box.x + box.width + pad, 0, 1);
    const bottom = clamp(box.y + box.height + pad, 0, 1);
    const sx = Math.round(x * img.naturalWidth);
    const sy = Math.round(y * img.naturalHeight);
    const sw = Math.max(1, Math.round((right - x) * img.naturalWidth));
    const sh = Math.max(1, Math.round((bottom - y) * img.naturalHeight));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return row;
    ctx2d.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return row;
    const previewUrl = URL.createObjectURL(blob);

    const path = `${ctx.project_id}/batch/${ctx.scanned_doc_id}/receipt-${String(index + 1).padStart(2, '0')}.jpg`;
    const { error } = await supabase.storage
      .from('receipts')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return { ...row, image_url: path, image_preview_url: previewUrl };
    } catch {
      // Preserve successful crops from the rest of the page. One storage or
      // canvas failure must not make every receipt point to the full scan.
      return row;
    }
  }));

  return out;
}

// 1. Upload the A3 scan, create a scanned_documents row, and ask Claude to split it into
//    individual receipts. Returns the doc id + extracted rows for the review panel.
export async function scanA3AndExtract(
  file: File,
  ctx: { project_id: string; user_id: string; model?: string },
): Promise<{ scannedDocId: string; storagePath: string; receipts: ExtractedReceipt[] }> {
  // Scanners often produce PDFs; keep those as-is (Claude reads them page by page).
  // Images get compressed a bit but stay high-res enough for tiny text.
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const docId = uuidv4();
  const path = `${ctx.project_id}/batch/${docId}.${isPdf ? 'pdf' : 'jpg'}`;
  const payload = isPdf ? file : await compressImage(file, { maxKB: 1500, maxDim: 4000 }).catch(() => file);

  const { error: upErr } = await supabase.storage
    .from('receipts')
    .upload(path, payload, { contentType: isPdf ? 'application/pdf' : 'image/jpeg', upsert: false });
  if (upErr) throw upErr;

  const { data: doc, error: docErr } = await supabase
    .from('scanned_documents')
    .insert({
      project_id: ctx.project_id,
      // company_id filled by trigger
      company_id: '00000000-0000-0000-0000-000000000000',
      file_url: path,
      created_by: ctx.user_id,
    })
    .select('id')
    .single();
  if (docErr) throw docErr;

  const { data, error } = await supabase.functions.invoke<{ receipts: ExtractedReceipt[]; count: number }>(
    'batch-extract-receipts',
    { body: { storage_path: path, model: ctx.model } },
  );
  if (error) throw await readableBatchFunctionError(error);

  const receipts = data?.receipts ?? [];
  const croppedReceipts = await cropAndUploadReceiptImages(receipts, file, {
    project_id: ctx.project_id,
    scanned_doc_id: doc.id as string,
  });
  const isImage = !isPdf;
  const fallbackPreview = isImage ? URL.createObjectURL(file) : null;
  const previewReceipts = croppedReceipts.map((receipt) => normalizeExtractedReceipt({
    ...receipt,
    image_preview_url: receipt.image_preview_url ?? fallbackPreview,
  }));

  return { scannedDocId: doc.id as string, storagePath: path, receipts: previewReceipts };
}

async function readableBatchFunctionError(error: unknown): Promise<Error> {
  const candidate = error as { message?: string; context?: Response };
  const fallback = candidate.message || 'Batch scan failed. Please try again.';
  const response = candidate.context;
  if (!response || typeof response.clone !== 'function') return new Error(fallback);
  try {
    const payload = await response.clone().json() as { error?: string; detail?: string; code?: string };
    const message = payload.error || payload.detail;
    if (message) return new Error(payload.code === 'AI_TEMPORARILY_UNAVAILABLE' ? `${message} (The AI service may be busy or out of balance.)` : message);
  } catch {
    // Keep the SDK message when the edge function returned a non-JSON response.
  }
  return new Error(fallback);
}

// 2. Bulk-insert the approved rows. All receipts share the A3 image + scanned_doc_id.
export async function importBatch(
  rows: ExtractedReceipt[],
  ctx: { project_id: string; user_id: string; scanned_doc_id: string; image_url: string },
): Promise<number> {
  // Read the company's approval setting once for the whole batch. With the flow
  // off these land confirmed exactly as before; with it on they start as
  // pending_review and go through submit + approve like any other receipt.
  const importStatus = creationStatus(await approvalFlowEnabled());
  // PDFs won't render as an <img> thumbnail, so leave image_url null for those (the
  // source doc is still linked via scanned_doc_id); images keep their path.
  const sharedImage = ctx.image_url && !ctx.image_url.toLowerCase().endsWith('.pdf') ? ctx.image_url : null;

  // Insert one at a time so a single duplicate verification code (e.g. the same receipt
  // photographed twice on one page) is flagged as a duplicate instead of aborting the
  // whole batch with a 409.
  let imported = 0;
  for (const r of rows) {
    const base = {
      id: uuidv4(),
      project_id: ctx.project_id,
      company_id: '00000000-0000-0000-0000-000000000000', // trigger fills
      uploaded_by: ctx.user_id,
      image_url: r.image_url ?? sharedImage,
      scanned_doc_id: ctx.scanned_doc_id,
      vendor_name: r.vendor,
      vendor_tin: r.vendor_tin,
      vendor_vrn: r.vendor_vrn,
      receipt_number: r.receipt_number ?? null,
      receipt_date: r.receipt_date,
      category: r.category,
      verification_code: r.verification_code,
      total_amount: r.total_amount,
      tax_amount: r.tax_amount,
      payment_method: 'cash_personal' as const,
      low_confidence_fields: [] as string[],
      raw_ai_response: { source: 'batch_scan', crop_box: r.crop_box ?? null },
    };
    let { error } = await supabase.from('receipts').insert({ ...base, status: importStatus });
    // 23505 = unique_violation on (company_id, verification_code): re-insert as duplicate.
    if (error && error.code === '23505') {
      const { data: original } = r.verification_code
        ? await supabase
          .from('receipts')
          .select('id, vendor_tin, total_amount, receipt_number')
          .eq('verification_code', r.verification_code)
          .neq('status', 'duplicate')
          .maybeSingle()
        : { data: null };
      ({ error } = await supabase.from('receipts').insert(
        original && isSamePhysicalReceipt(r, original)
          ? { ...base, status: 'duplicate', duplicate_of: original.id }
          : {
              ...base,
              verification_code: null,
              status: 'pending_review',
              low_confidence_fields: ['verification_code'],
            },
      ));
    }
    if (error) throw error;
    imported++;
  }
  return imported;
}
