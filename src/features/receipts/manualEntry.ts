import { supabase } from '@/lib/supabase';
import type { Receipt } from '@/types/db';

export type ManualReceiptInput = {
  project_id: string;
  vendor_name: string;
  receipt_date: string; // YYYY-MM-DD
  total_amount: number;
  tax_amount?: number;
  category: string;
  receipt_number?: string;
  verification_code?: string;
};

// Direct insert as 'confirmed' — no image, no AI. Duplicate guard (unique index on
// company_id + verification_code) still applies if verification_code is provided.
export async function createManualReceipt(
  input: ManualReceiptInput,
  ctx: { user_id: string },
): Promise<Receipt> {
  const { data, error } = await supabase
    .from('receipts')
    .insert({
      project_id: input.project_id,
      // company_id is auto-filled by the receipts_set_company_id trigger.
      company_id: '00000000-0000-0000-0000-000000000000',
      uploaded_by: ctx.user_id,
      image_url: null,
      vendor_name: input.vendor_name.trim(),
      receipt_number: input.receipt_number?.trim() || null,
      verification_code: input.verification_code?.trim() || null,
      receipt_date: input.receipt_date,
      total_amount: input.total_amount,
      tax_amount: input.tax_amount ?? null,
      category: input.category,
      status: 'confirmed',
      low_confidence_fields: [],
      raw_ai_response: { source: 'manual_entry' },
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Receipt;
}
