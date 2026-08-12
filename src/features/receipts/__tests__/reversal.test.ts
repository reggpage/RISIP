import { describe, expect, it } from 'vitest';
import { canRequestReversal, canReverse, type LiveExpense } from '../reversal';
import type { Receipt, ReceiptStatus, UserRole } from '@/types/db';

// These pin what the UI offers. The database is what actually enforces it —
// reverse_petty_cash_receipt re-checks the role, the flag, maker-checker and
// every blocking precondition — so a mismatch here is a UX bug, never a hole.

const WORKER = 'w1';
const ACCT = 'a1';
const OWNER = 'o1';

const LIVE: LiveExpense = { id: 'txn1', amount: -400000, account_id: 'acc1' };

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    uploaded_by: WORKER,
    status: 'confirmed' as ReceiptStatus,
    payment_method: 'petty_cash',
    total_amount: 400000,
    reimbursed_at: null,
    decided_by: null,
    ...over,
  } as Receipt;
}

describe('who may reverse', () => {
  it('finance may, on a confirmed receipt with money booked', () => {
    expect(canReverse(receipt(), ACCT, 'accountant', true, false, LIVE).allowed).toBe(true);
    expect(canReverse(receipt(), OWNER, 'owner', true, false, LIVE).allowed).toBe(true);
  });

  it('a worker never may, however the flags are set', () => {
    expect(canReverse(receipt(), WORKER, 'worker', true, true, LIVE).allowed).toBe(false);
  });

  it('nobody may while the company flag is off', () => {
    expect(canReverse(receipt(), ACCT, 'accountant', false, false, LIVE).allowed).toBe(false);
  });

  it('there is nothing to reverse without a live posting', () => {
    // After a void the expense is marked reversed, so fetchLiveExpense returns
    // null and the controls disappear rather than offering a second reversal.
    expect(canReverse(receipt(), ACCT, 'accountant', true, false, null).allowed).toBe(false);
  });

  it('only a confirmed receipt has a posting to undo', () => {
    for (const status of ['pending_review', 'submitted', 'changes_requested', 'rejected'] as ReceiptStatus[]) {
      expect(canReverse(receipt({ status }), ACCT, 'accountant', true, false, LIVE).allowed).toBe(false);
    }
  });
});

describe('reversal is refused when somebody else already holds the number', () => {
  it('a reimbursed receipt says so up front, rather than after a typed reason', () => {
    const r = canReverse(receipt({ reimbursed_at: '2026-08-01T00:00:00Z' }), ACCT, 'accountant', true, false, LIVE);
    expect(r.allowed).toBe(false);
    expect(r.blockedReason).toMatch(/already been reimbursed/);
  });

  it('invoices and retirements are left to the server, which holds those rows', () => {
    // The client has no invoice_receipts / staff_retirement_receipts data, so it
    // must not guess. The RPC refuses and its sentence is shown verbatim.
    expect(canReverse(receipt(), ACCT, 'accountant', true, false, LIVE).allowed).toBe(true);
  });
});

describe('maker-checker', () => {
  it('you cannot undo the decision you made', () => {
    const r = canReverse(receipt({ decided_by: ACCT }), ACCT, 'accountant', true, false, LIVE);
    expect(r.allowed).toBe(false);
    expect(r.blockedReason).toMatch(/another member of your finance team/);
  });

  it('a second finance user can', () => {
    expect(canReverse(receipt({ decided_by: ACCT }), OWNER, 'owner', true, false, LIVE).allowed).toBe(true);
  });

  it('a one-person company may, and the audit row records it', () => {
    expect(canReverse(receipt({ decided_by: ACCT }), ACCT, 'accountant', true, true, LIVE).allowed).toBe(true);
  });
});

describe('staff may ask, never execute', () => {
  it('the uploader may ask', () => {
    expect(canRequestReversal(receipt(), WORKER, 'worker')).toBe(true);
  });

  it('a colleague may not ask about somebody else receipt', () => {
    expect(canRequestReversal(receipt(), 'w2', 'worker')).toBe(false);
  });

  it('there is nothing to ask about before it is confirmed', () => {
    expect(canRequestReversal(receipt({ status: 'submitted' }), WORKER, 'worker')).toBe(false);
  });

  it('finance can ask too, which is how they hand it to a colleague', () => {
    expect(canRequestReversal(receipt(), ACCT, 'accountant' as UserRole)).toBe(true);
  });
});

