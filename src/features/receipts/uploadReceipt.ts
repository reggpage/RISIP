import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompression';
import { uuidv4 } from '@/lib/uuid';
import type { PaymentMethod, Receipt } from '@/types/db';

// Full worker upload flow:
//   1. Compress the phone photo down to ~300KB JPEG (keeps text readable, saves 10–20×
//      storage + bandwidth vs the raw HEIC/JPEG that iPhones/Androids ship).
//   2. Upload to the private `receipts` bucket at <project_id>/<receipt_id>.jpg.
//   3. Insert a receipts row (status='processing'); DB trigger fills company_id.
//   4. Fire-and-forget invoke extract-receipt — updates arrive via realtime.
export async function uploadReceipt(
  file: File,
  ctx: { project_id: string; user_id: string; payment_method?: PaymentMethod },
): Promise<Receipt> {
  const receiptId = uuidv4();

  // Compress before upload, but keep it high-fidelity: receipt OCR needs the small
  // print to survive, so we allow a larger file + higher resolution + a quality floor.
  const compressed = await compressImage(file, { maxKB: 1500, maxDim: 3200, minQuality: 0.7 }).catch(() => file);
  const ext = 'jpg'; // Compressor always emits jpeg; safe to fix the extension.
  const path = `${ctx.project_id}/${receiptId}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('receipts')
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
  if (uploadErr) throw uploadErr;

  const { data, error: insertErr } = await supabase
    .from('receipts')
    .insert({
      id: receiptId,
      project_id: ctx.project_id,
      // company_id is filled by the receipts_set_company_id trigger.
      company_id: '00000000-0000-0000-0000-000000000000',
      uploaded_by: ctx.user_id,
      image_url: path,
      status: 'processing',
      payment_method: ctx.payment_method ?? 'cash_personal',
    })
    .select('*')
    .single();
  if (insertErr) throw insertErr;

  // Fire and forget — updates arrive via realtime; failures land in receipts.status='error'.
  void supabase.functions.invoke('extract-receipt', {
    body: { receipt_id: receiptId, storage_path: path },
  });

  return data as Receipt;
}

// Storage bucket is private — generate a signed URL for display.
export async function receiptImageUrl(path: string, expiresIn = 60 * 10): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
