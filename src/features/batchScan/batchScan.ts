import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompression';
import { uuidv4 } from '@/lib/uuid';

// One receipt as extracted from the A3 scan (before review/import). Amounts are strings
// during editing so the review table's number inputs stay controlled.
export type ExtractedReceipt = {
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
  if (error) throw error;

  return { scannedDocId: doc.id as string, storagePath: path, receipts: data?.receipts ?? [] };
}

// 2. Bulk-insert the approved rows. All receipts share the A3 image + scanned_doc_id.
export async function importBatch(
  rows: ExtractedReceipt[],
  ctx: { project_id: string; user_id: string; scanned_doc_id: string; image_url: string },
): Promise<number> {
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
      image_url: sharedImage,
      scanned_doc_id: ctx.scanned_doc_id,
      vendor_name: r.vendor,
      vendor_tin: r.vendor_tin,
      vendor_vrn: r.vendor_vrn,
      receipt_date: r.receipt_date,
      category: r.category,
      verification_code: r.verification_code,
      total_amount: r.total_amount,
      tax_amount: r.tax_amount,
      payment_method: 'cash_personal' as const,
      low_confidence_fields: [] as string[],
      raw_ai_response: { source: 'batch_scan' },
    };
    let { error } = await supabase.from('receipts').insert({ ...base, status: 'confirmed' });
    // 23505 = unique_violation on (company_id, verification_code): re-insert as duplicate.
    if (error && error.code === '23505') {
      ({ error } = await supabase.from('receipts').insert({ ...base, status: 'duplicate' }));
    }
    if (error) throw error;
    imported++;
  }
  return imported;
}
