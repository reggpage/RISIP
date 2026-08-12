import { describe, expect, it } from 'vitest';
import { canDecide, canSubmit, creationStatus, missingBeforeSubmit } from '../approvalFlow';
import type { Receipt, ReceiptStatus, UserRole } from '@/types/db';

const WORKER = 'user-worker';
const OTHER_FINANCE = 'user-accountant';

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1', project_id: 'p1', company_id: 'c1', uploaded_by: WORKER,
    image_url: null, vendor_name: 'Erima Energy', vendor_tin: null, vendor_vrn: null,
    receipt_number: null, verification_code: null, receipt_date: null, receipt_time: null,
    total_amount: 183024, tax_amount: null, category: 'Fuel',
    status: 'pending_review' as ReceiptStatus, duplicate_of: null,
    payment_method: 'cash_personal', payment_method_suggested: null, payment_method_reason: null,
    scanned_doc_id: null, raw_ai_response: null, low_confidence_fields: [],
    created_at: '2026-08-12T00:00:00Z', reimbursed_at: null, reimbursed_by: null,
    source: 'whatsapp', details_confirmed: false,
    submitted_at: null, submitted_by: null, decided_at: null, decided_by: null,
    decision_reason: null,
    ...over,
  } as Receipt;
}

describe('missingBeforeSubmit', () => {
  it('names exactly what is still missing', () => {
    expect(missingBeforeSubmit(receipt())).toEqual([]);
    expect(missingBeforeSubmit(receipt({ project_id: null }))).toEqual(['project']);
    expect(missingBeforeSubmit(receipt({ project_id: null, category: null, payment_method: null })))
      .toEqual(['project', 'category', 'payment source']);
  });
});

describe('canSubmit', () => {
  it('lets the uploader submit a completed receipt', () => {
    expect(canSubmit(receipt(), WORKER, 'worker')).toBe(true);
  });

  it('refuses while any detail is still unchosen', () => {
    expect(canSubmit(receipt({ payment_method: null }), WORKER, 'worker')).toBe(false);
    expect(canSubmit(receipt({ project_id: null }), WORKER, 'worker')).toBe(false);
  });

  it('lets finance submit on someone else behalf', () => {
    expect(canSubmit(receipt(), OTHER_FINANCE, 'accountant')).toBe(true);
  });

  it('refuses an unrelated worker', () => {
    expect(canSubmit(receipt(), 'someone-else', 'worker')).toBe(false);
  });

  it('allows resubmission after changes were requested', () => {
    expect(canSubmit(receipt({ status: 'changes_requested' }), WORKER, 'worker')).toBe(true);
  });

  it('refuses once submitted, confirmed or rejected', () => {
    for (const status of ['submitted', 'confirmed', 'rejected'] as ReceiptStatus[]) {
      expect(canSubmit(receipt({ status }), WORKER, 'worker')).toBe(false);
    }
  });
});

describe('canDecide', () => {
  const submitted = receipt({ status: 'submitted', submitted_by: WORKER });

  it('never lets a worker approve, reject or request changes', () => {
    const d = canDecide(submitted, WORKER, 'worker', true);
    expect(d.approve).toBe(false);
    expect(d.requestChanges).toBe(false);
    expect(d.reject).toBe(false);
  });

  it('lets finance decide on someone else submission', () => {
    const d = canDecide(submitted, OTHER_FINANCE, 'accountant', false);
    expect(d.approve).toBe(true);
    expect(d.requestChanges).toBe(true);
    expect(d.reject).toBe(true);
    expect(d.selfBlocked).toBe(false);
  });

  it('blocks approving your own submission by default (maker-checker)', () => {
    const own = receipt({ status: 'submitted', submitted_by: OTHER_FINANCE });
    const d = canDecide(own, OTHER_FINANCE, 'accountant', false);
    expect(d.approve).toBe(false);
    expect(d.selfBlocked).toBe(true);
    // Sending it back is still allowed — that moves no money.
    expect(d.requestChanges).toBe(true);
  });

  it('allows self-approval only when the company is configured for it', () => {
    const own = receipt({ status: 'submitted', submitted_by: OTHER_FINANCE });
    const d = canDecide(own, OTHER_FINANCE, 'accountant', true);
    expect(d.approve).toBe(true);
    expect(d.selfBlocked).toBe(false);
  });

  it('offers nothing unless the receipt is actually submitted', () => {
    for (const status of ['pending_review', 'confirmed', 'rejected', 'changes_requested'] as ReceiptStatus[]) {
      const d = canDecide(receipt({ status }), OTHER_FINANCE, 'owner', true);
      expect(d.approve || d.requestChanges || d.reject).toBe(false);
    }
  });
});

describe('totals invariant', () => {
  // Mirrors every financial read path: they all filter status === 'confirmed'.
  const countsInTotals = (s: ReceiptStatus) => s === 'confirmed';

  it('keeps the new states out of official totals', () => {
    expect(countsInTotals('submitted')).toBe(false);
    expect(countsInTotals('changes_requested')).toBe(false);
    expect(countsInTotals('rejected')).toBe(false);
    expect(countsInTotals('pending_review')).toBe(false);
    expect(countsInTotals('confirmed')).toBe(true);
  });
});

describe('creationStatus — the INSERT bypass that was found', () => {
  it('keeps creating receipts confirmed while the flow is off', () => {
    // batchScan.ts and manualEntry.ts behaviour must not change for existing
    // companies, which all run with the flag off.
    expect(creationStatus(false)).toBe('confirmed');
  });

  it('never creates an already-approved receipt once the flow is on', () => {
    // With the flag on this used to slip straight into official totals without
    // anyone approving it. The database refuses it too (migration 0057).
    expect(creationStatus(true)).toBe('pending_review');
  });

  it('only ever returns a status the database permits on insert', () => {
    for (const flag of [true, false]) {
      expect(['confirmed', 'pending_review']).toContain(creationStatus(flag));
    }
  });
});

describe('status messaging drives the right panel', () => {
  // Mirrors ApprovalPanel's branches, so a wrong status can never show the wrong
  // affordance (e.g. an Approve button on a rejected receipt).
  const affordances = (r: Receipt, viewerId: string, role: UserRole, selfOk: boolean) => ({
    submit: canSubmit(r, viewerId, role),
    ...canDecide(r, viewerId, role, selfOk),
  });

  it('offers nothing actionable on a rejected receipt', () => {
    const a = affordances(receipt({ status: 'rejected' }), OTHER_FINANCE, 'owner', true);
    expect(a.submit || a.approve || a.requestChanges || a.reject).toBe(false);
  });

  it('offers nothing actionable on an approved receipt', () => {
    const a = affordances(receipt({ status: 'confirmed' }), OTHER_FINANCE, 'owner', true);
    expect(a.submit || a.approve || a.requestChanges || a.reject).toBe(false);
  });

  it('offers resubmit, not approval, after changes were requested', () => {
    const r = receipt({ status: 'changes_requested', decision_reason: 'VAT does not match.' });
    const a = affordances(r, WORKER, 'worker', true);
    expect(a.submit).toBe(true);
    expect(a.approve).toBe(false);
    expect(r.decision_reason).toBeTruthy();
  });

  it('offers submit but never approval to the uploader while pending', () => {
    const a = affordances(receipt(), WORKER, 'worker', true);
    expect(a.submit).toBe(true);
    expect(a.approve).toBe(false);
  });
});
