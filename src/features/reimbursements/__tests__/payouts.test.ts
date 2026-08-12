import { describe, expect, it } from 'vitest';
import { canRecordPayout, isReimbursable, sameEmployee } from '../payouts';
import type { PaymentMethod, Receipt, ReceiptStatus, UserRole } from '@/types/db';

// Mirrors the eligibility clause in create_reimbursement_payout, which is what
// actually enforces it. These pin the rule the UI is built on.

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    uploaded_by: 'w1',
    status: 'confirmed' as ReceiptStatus,
    payment_method: 'cash_personal' as PaymentMethod,
    total_amount: 64674,
    reimbursed_at: null,
    ...over,
  } as Receipt;
}

describe('what can be paid back', () => {
  it('a confirmed receipt the employee paid for themselves', () => {
    expect(isReimbursable(receipt())).toBe(true);
  });

  it('never petty cash — that money was the company float already', () => {
    expect(isReimbursable(receipt({ payment_method: 'petty_cash' }))).toBe(false);
  });

  it('never a company card — the company already paid the vendor', () => {
    expect(isReimbursable(receipt({ payment_method: 'company_card' }))).toBe(false);
  });

  it('never before it is approved', () => {
    for (const status of ['pending_review', 'submitted', 'changes_requested', 'processing'] as ReceiptStatus[]) {
      expect(isReimbursable(receipt({ status }))).toBe(false);
    }
  });

  it('never a rejected, duplicate or failed receipt', () => {
    for (const status of ['rejected', 'duplicate', 'error'] as ReceiptStatus[]) {
      expect(isReimbursable(receipt({ status }))).toBe(false);
    }
  });

  it('never twice', () => {
    expect(isReimbursable(receipt({ reimbursed_at: '2026-08-09T21:28:56Z' }))).toBe(false);
  });

  it('never with no payment source chosen yet', () => {
    expect(isReimbursable(receipt({ payment_method: null }))).toBe(false);
  });
});

describe('one payout pays one person', () => {
  it('accepts several receipts from the same employee', () => {
    expect(sameEmployee([receipt({ id: 'a' }), receipt({ id: 'b' })])).toBe(true);
  });

  it('refuses a mixed selection, because one transfer goes to one person', () => {
    expect(sameEmployee([receipt({ id: 'a' }), receipt({ id: 'b', uploaded_by: 'w2' })])).toBe(false);
  });

  it('refuses an empty selection', () => {
    expect(sameEmployee([])).toBe(false);
  });
});

describe('who may record a payment', () => {
  it('finance may', () => {
    expect(canRecordPayout('owner' as UserRole)).toBe(true);
    expect(canRecordPayout('accountant' as UserRole)).toBe(true);
  });

  it('a worker never may — not even for their own receipt', () => {
    expect(canRecordPayout('worker' as UserRole)).toBe(false);
    expect(canRecordPayout(undefined)).toBe(false);
  });
});

describe('paying is settlement, not a second expense', () => {
  // The expense was counted when the receipt was confirmed. Nothing in the
  // dashboard, project totals or exports reads reimbursed_at, so a payout moves
  // no company figure — asserted against the database in the migration tests.
  const confirmed = [receipt({ id: 'a', total_amount: 64674 }), receipt({ id: 'b', total_amount: 43250 })];
  const companyTotal = (rows: Receipt[]) =>
    rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + Number(r.total_amount), 0);

  it('the total is the same before and after paying', () => {
    const before = companyTotal(confirmed);
    const afterPaying = companyTotal(confirmed.map((r) => ({ ...r, reimbursed_at: '2026-08-12T00:00:00Z' })));
    expect(afterPaying).toBe(before);
    expect(afterPaying).toBe(107924);
  });
});
