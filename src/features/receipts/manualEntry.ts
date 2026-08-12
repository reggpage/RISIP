import { supabase } from '@/lib/supabase';
import { approvalFlowEnabled, creationStatus } from '@/features/receipts/approvalFlow';
import type { PaymentMethod, Receipt } from '@/types/db';

export type ManualReceiptInput = {
  project_id: string;
  vendor_name: string;
  receipt_date: string; // YYYY-MM-DD
  total_amount: number;
  tax_amount?: number;
  category: string;
  receipt_number?: string;
  verification_code?: string;
  payment_method?: PaymentMethod;
};

// Direct insert, no image and no AI. The duplicate guard (unique index on
// verification_code) still applies when one is given.
//
// Where it lands depends on the company: with the approval flow off it is created
// confirmed exactly as before, and with it on it starts as pending_review so it
// goes through submit + approve like everything else.
export async function createManualReceipt(
  input: ManualReceiptInput,
  ctx: { user_id: string },
): Promise<Receipt> {
  const status = creationStatus(await approvalFlowEnabled());
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
      status,
      low_confidence_fields: [],
      raw_ai_response: { source: 'manual_entry' },
      payment_method: input.payment_method ?? 'cash_personal',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Receipt;
}
