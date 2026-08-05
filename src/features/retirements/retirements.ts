import { supabase } from '@/lib/supabase';
import { uuidv4 } from '@/lib/uuid';
import { createNotifications } from '@/features/notifications/notifications';
import type { Profile, Receipt } from '@/types/db';

export type RetirementProfile = Pick<Profile, 'id' | 'company_id' | 'full_name' | 'phone' | 'role'>;

export type StaffRetirementStatus =
  | 'submitted'
  | 'viewed'
  | 'approved'
  | 'changes_requested'
  | 'paid'
  | 'received_confirmed'
  | 'cancelled';

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
  const { error: insertErr } = await (supabase as any).from('staff_retirements').insert({
    id: retirementId,
    company_id: input.profile.company_id,
    project_id: input.project_id,
    staff_id: input.profile.id,
    title: input.title.trim() || 'Receipt retirement',
    notes: input.notes?.trim() || null,
    total_amount: input.total_amount,
    status: 'submitted',
  });
  if (insertErr) throw insertErr;

  if (input.receipt_ids.length > 0) {
    const { error: linkErr } = await (supabase as any).from('staff_retirement_receipts').insert(
      input.receipt_ids.map((receipt_id) => ({ retirement_id: retirementId, receipt_id })),
    );
    if (linkErr) throw linkErr;
  }

  for (const file of input.documents) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const storagePath = `${input.project_id}/retirements/${retirementId}/${uuidv4()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('receipts')
      .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadErr) throw uploadErr;

    const { error: docErr } = await (supabase as any).from('staff_retirement_documents').insert({
      retirement_id: retirementId,
      company_id: input.profile.company_id,
      project_id: input.project_id,
      storage_path: storagePath,
      file_name: file.name,
      file_type: file.type || null,
      created_by: input.profile.id,
      ai_status: 'not_scanned',
    });
    if (docErr) throw docErr;
  }

  await notifyFinance(input.profile.company_id, input.profile.id, {
    type: 'retirement_submitted',
    title: 'New staff retirement submitted',
    body: `${input.profile.full_name} submitted ${input.receipt_ids.length} receipt(s).`,
    metadata: { retirement_id: retirementId },
  });

  return retirementId;
}

export async function updateRetirementStatus(
  bundle: StaffRetirement,
  actor: RetirementProfile,
  status: StaffRetirementStatus,
  options?: { note?: string; receiptIds?: string[] },
) {
  const now = new Date().toISOString();
  const patch: Partial<StaffRetirement> = { status, updated_at: now };
  if (status === 'viewed' && !bundle.viewed_at) patch.viewed_at = now;
  if (status === 'approved') patch.approved_at = now;
  if (status === 'paid') patch.paid_at = now;
  if (status === 'received_confirmed') patch.received_confirmed_at = now;
  if (status === 'changes_requested') {
    patch.change_request_note = options?.note?.trim() || null;
    patch.change_request_receipt_ids = options?.receiptIds ?? [];
  }
  if (status === 'submitted') {
    patch.change_request_note = null;
    patch.change_request_receipt_ids = [];
  }

  const { error } = await (supabase as any).from('staff_retirements').update(patch).eq('id', bundle.id);
  if (error) throw error;

  if (actor.id !== bundle.staff_id) {
    await createNotifications([{
      company_id: bundle.company_id,
      recipient_id: bundle.staff_id,
      actor_id: actor.id,
      type: `retirement_${status}`,
      title: retirementStatusTitle(status),
      body: status === 'changes_requested' && options?.note
        ? options.note
        : `Your retirement "${bundle.title}" is now ${status.replace(/_/g, ' ')}.`,
      metadata: { retirement_id: bundle.id, receipt_ids: options?.receiptIds ?? [] },
    }]);
  } else if (status === 'received_confirmed' || status === 'submitted') {
    await notifyFinance(bundle.company_id, actor.id, {
      type: status === 'submitted' ? 'retirement_resubmitted' : 'retirement_received_confirmed',
      title: status === 'submitted' ? 'Staff resubmitted retirement' : 'Staff confirmed payment received',
      body: status === 'submitted'
        ? `${actor.full_name} resubmitted "${bundle.title}" after changes.`
        : `${actor.full_name} confirmed receiving payment for "${bundle.title}".`,
      metadata: { retirement_id: bundle.id },
    });
  }
}

export async function retirementDocumentUrl(path: string, expiresIn = 60 * 10): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

async function notifyFinance(
  companyId: string,
  actorId: string,
  notification: { type: string; title: string; body: string; metadata?: unknown },
) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .in('role', ['owner', 'accountant']);
  if (error) throw error;
  await createNotifications(
    (data ?? [])
      .filter((p) => p.id !== actorId)
      .map((p) => ({
        company_id: companyId,
        recipient_id: p.id,
        actor_id: actorId,
        ...notification,
      })),
  );
}

function retirementStatusTitle(status: StaffRetirementStatus) {
  if (status === 'viewed') return 'Accountant viewed your retirement';
  if (status === 'approved') return 'Retirement approved';
  if (status === 'changes_requested') return 'Changes requested';
  if (status === 'paid') return 'Retirement marked as paid';
  if (status === 'received_confirmed') return 'Payment receipt confirmed';
  return 'Retirement updated';
}
