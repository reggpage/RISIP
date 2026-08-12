import { supabase } from '@/lib/supabase';
import type { Receipt, UserRole } from '@/types/db';

// Phase 1b: employee submission is separate from finance approval.
//
// Every rule below is also enforced server-side in submit_receipt / decide_receipt.
// These helpers only decide what to *show* — a worker who forged a request still
// cannot approve anything.

export const MIN_REASON_LENGTH = 10;

/** The three things that must be chosen before a receipt can be submitted. */
export function missingBeforeSubmit(receipt: Receipt): string[] {
  return [
    !receipt.project_id && 'project',
    !receipt.category && 'category',
    !receipt.payment_method && 'payment source',
  ].filter(Boolean) as string[];
}

export function canSubmit(receipt: Receipt, profileId: string | undefined, role: UserRole | undefined): boolean {
  if (receipt.status !== 'pending_review' && receipt.status !== 'changes_requested') return false;
  const isUploader = receipt.uploaded_by === profileId;
  const isFinance = role === 'owner' || role === 'accountant';
  return (isUploader || isFinance) && missingBeforeSubmit(receipt).length === 0;
}

/**
 * Finance may decide on a submitted receipt. Maker-checker: you may not approve
 * what you submitted unless the company is explicitly configured for it (a
 * one-person business), and that exception is audited.
 */
export function canDecide(
  receipt: Receipt,
  profileId: string | undefined,
  role: UserRole | undefined,
  allowSelfApproval: boolean,
): { approve: boolean; requestChanges: boolean; reject: boolean; selfBlocked: boolean } {
  const isFinance = role === 'owner' || role === 'accountant';
  const open = receipt.status === 'submitted';
  const isOwnSubmission = receipt.submitted_by === profileId;
  const selfBlocked = open && isFinance && isOwnSubmission && !allowSelfApproval;
  return {
    approve: open && isFinance && !selfBlocked,
    requestChanges: open && isFinance,
    reject: open && isFinance,
    selfBlocked,
  };
}

export async function submitReceipt(receiptId: string): Promise<string> {
  const { data, error } = await supabase.rpc('submit_receipt', { p_receipt: receiptId });
  if (error) throw error;
  return data as string;
}

export type Decision = 'approve' | 'request_changes' | 'reject';

export async function decideReceipt(
  receiptId: string,
  decision: Decision,
  reason?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('decide_receipt', {
    p_receipt: receiptId,
    p_decision: decision,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Whether this company runs the approval flow. Read once per operation rather
 * than per receipt, so a batch import costs a single round trip.
 *
 * RLS scopes `companies` to the caller's own company, so no id is needed.
 */
export async function approvalFlowEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from('companies')
    .select('approval_flow_enabled')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.approval_flow_enabled);
}

/**
 * The status a directly-created receipt may be given. With the flow on, nothing
 * may be created as already-approved — it has to be submitted and approved. The
 * database enforces this too (migration 0057); this only keeps the app from
 * sending a write it knows will be refused.
 */
export function creationStatus(flowEnabled: boolean): 'confirmed' | 'pending_review' {
  return flowEnabled ? 'pending_review' : 'confirmed';
}
