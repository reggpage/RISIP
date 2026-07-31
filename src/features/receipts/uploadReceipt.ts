import { supabase } from '@/lib/supabase';
import type { Receipt } from '@/types/db';

// Full worker upload flow:
//   1. Upload the image to the private `receipts` bucket at <project_id>/<receipt_id>.<ext>.
//   2. Insert a receipts row (status='processing'); the DB trigger populates company_id.
//   3. Fire-and-forget invoke extract-receipt — the client subscribes to realtime updates
//      to see the row flip to confirmed/duplicate/error.
export async function uploadReceipt(
  file: File,
  ctx: { project_id: string; user_id: string },
): Promise<Receipt> {
  const receiptId = crypto.randomUUID();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  const path = `${ctx.project_id}/${receiptId}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('receipts')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
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
