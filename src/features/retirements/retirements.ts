import { supabase } from '@/lib/supabase';
import { uuidv4 } from '@/lib/uuid';
import type { Profile, Receipt } from '@/types/db';

export type RetirementProfile = Pick<Profile, 'id' | 'company_id' | 'full_name' | 'phone' | 'role'>;

export type StaffRetirementStatus =
  | 'submitted'
  | 'viewed'
  | 'approved'
  | 'changes_requested'
  | 'paid'
  | 'received_confirmed'
  | 'cancelled'
  | 'rejected';

export type StaffRetirement = {
  id: string;
  company_id: string;
  project_id: string;
  staff_id: string;
  title: string;
  notes: string | null;
  total_amount: number;
  status: StaffRetirementStatus;
  viewed_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  received_confirmed_at: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  viewed_by: string | null;
  approved_by: string | null;
  paid_by: string | null;
  received_confirmed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  decision_reason: string | null;
  payment_method: 'cash' | 'mobile_money' | 'bank' | 'other' | null;
  payment_reference: string | null;
  paid_amount_snapshot: number | null;
  change_request_note: string | null;
  change_request_receipt_ids: string[];
  created_at: string;
  updated_at: string;
};

export type RetirementDocument = {
  id: string;
  retirement_id: string;
  company_id: string;
  project_id: string;
  storage_path: string;
  file_name: string;
  file_type: string | null;
  ai_status: 'not_scanned' | 'queued' | 'scanned' | 'failed';
  ai_summary: Record<string, unknown>;
  created_by: string;
  created_at: string;
};

export type RetirementBundle = StaffRetirement & {
  staff?: RetirementProfile;
  receipts: Receipt[];
  documents: RetirementDocument[];
};

export type RetirementPaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'other';

export type RetirementPaymentInput = {
  method: RetirementPaymentMethod;
  reference?: string;
  note?: string;
};

export async function fetchRetirementBundles(profile: RetirementProfile): Promise<RetirementBundle[]> {
  let query = (supabase as any)
    .from('staff_retirements')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false });

  if (profile.role === 'worker') query = query.eq('staff_id', profile.id);

  const { data: retirements, error } = await query;
  if (error) throw error;
  const rows = (retirements ?? []) as StaffRetirement[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const staffIds = Array.from(new Set(rows.map((r) => r.staff_id)));

  const [{ data: receiptLinks, error: linkErr }, { data: documents, error: docErr }, { data: staff, error: staffErr }] =
    await Promise.all([
      (supabase as any)
        .from('staff_retirement_receipts')
        .select('retirement_id, receipts(*)')
        .in('retirement_id', ids),
      (supabase as any)
        .from('staff_retirement_documents')
        .select('*')
        .in('retirement_id', ids)
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, company_id, full_name, phone, role, deactivated_at, created_at')
        .in('id', staffIds),
    ]);
  if (linkErr) throw linkErr;
  if (docErr) throw docErr;
  if (staffErr) throw staffErr;

  const receiptMap = new Map<string, Receipt[]>();
  for (const link of receiptLinks ?? []) {
    const retirementId = link.retirement_id as string;
    const receipt = link.receipts as Receipt | null;
    if (!receipt) continue;
    receiptMap.set(retirementId, [...(receiptMap.get(retirementId) ?? []), receipt]);
  }

  const docMap = new Map<string, RetirementDocument[]>();
  for (const doc of (documents ?? []) as RetirementDocument[]) {
    docMap.set(doc.retirement_id, [...(docMap.get(doc.retirement_id) ?? []), doc]);
  }

  const staffMap = new Map((staff ?? []).map((p) => [p.id, p as Profile]));
  return rows.map((row) => ({
    ...row,
    staff: staffMap.get(row.staff_id) as RetirementProfile | undefined,
    receipts: receiptMap.get(row.id) ?? [],
    documents: docMap.get(row.id) ?? [],
  }));
}

export async function fetchRetirableReceipts(profile: RetirementProfile, projectId: string): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('project_id', projectId)
    .eq('uploaded_by', profile.id)
    .eq('status', 'confirmed')
    .is('reimbursed_at', null)
    .neq('payment_method', 'petty_cash')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Receipt[];
}

export async function createStaffRetirement(input: {
  profile: RetirementProfile;
  project_id: string;
  title: string;
  notes?: string;
  receipt_ids: string[];
  total_amount: number;
  documents: File[];
}) {
  const retirementId = uuidv4();
  const uploadedPaths: string[] = [];
  const documents: Array<{ storage_path: string; file_name: string; file_type: string | null }> = [];
  for (const file of input.documents) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const storagePath = `${input.project_id}/retirements/${retirementId}/${uuidv4()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('receipts')
      .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadErr) throw uploadErr;
    uploadedPaths.push(storagePath);
    documents.push({ storage_path: storagePath, file_name: file.name, file_type: file.type || null });
  }

  const { data, error } = await (supabase as any).rpc('create_retirement', {
    p_project_id: input.project_id,
    p_title: input.title.trim() || 'Receipt retirement',
    p_notes: input.notes?.trim() || null,
    p_receipt_ids: input.receipt_ids,
    p_documents: documents,
    p_retirement_id: retirementId,
  });
  if (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from('receipts').remove(uploadedPaths);
    }
    throw error;
  }

  return (data as string | null) ?? retirementId;
}

export async function updateRetirementStatus(
  bundle: StaffRetirement,
  _actor: RetirementProfile,
  status: StaffRetirementStatus,
  options?: { note?: string; receiptIds?: string[]; payment?: RetirementPaymentInput },
) {
  if (status === 'submitted') {
    const { error } = await (supabase as any).rpc('submit_retirement', { p_retirement: bundle.id });
    if (error) throw error;
    return;
  }
  if (status === 'paid') {
    if (!options?.payment) {
      throw new Error('Choose a payment method before marking this retirement paid.');
    }
    const { error } = await (supabase as any).rpc('mark_retirement_paid', {
      p_retirement: bundle.id,
      p_method: options?.payment?.method,
      p_reference: options?.payment?.reference?.trim() || null,
      p_reason: options?.payment?.note?.trim() || null,
    });
    if (error) throw error;
    return;
  }
  if (status === 'received_confirmed') {
    const { error } = await (supabase as any).rpc('confirm_retirement_received', {
      p_retirement: bundle.id,
      p_reason: null,
    });
    if (error) throw error;
    return;
  }
  if (status === 'cancelled') {
    const { error } = await (supabase as any).rpc('cancel_retirement', {
      p_retirement: bundle.id,
      p_reason: options?.note ?? '',
    });
    if (error) throw error;
    return;
  }
  const decision =
    status === 'approved' ? 'approve'
      : status === 'changes_requested' ? 'request_changes'
        : status === 'rejected' ? 'reject'
          : status;
  const { error } = await (supabase as any).rpc('decide_retirement', {
    p_retirement: bundle.id,
    p_decision: decision,
    p_reason: options?.note ?? null,
    p_change_receipt_ids: options?.receiptIds ?? null,
  });
  if (error) throw error;
}

export async function retirementDocumentUrl(path: string, expiresIn = 60 * 10): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
