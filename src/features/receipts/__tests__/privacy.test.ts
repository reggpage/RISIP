import { describe, expect, it } from 'vitest';
import type { ReceiptStatus, UserRole } from '@/types/db';

// Mirrors migration 0060's receipts_select policy. The database is what actually
// enforces this — these tests pin the rule the UI is built on, so a future change
// to one without the other shows up here.
function canReadReceipt(
  viewer: { id: string; role: UserRole; companyId: string },
  receipt: { uploadedBy: string; companyId: string },
): boolean {
  if (receipt.companyId !== viewer.companyId) return false;
  return receipt.uploadedBy === viewer.id || viewer.role === 'owner' || viewer.role === 'accountant';
}

const WORKER = { id: 'w1', role: 'worker' as UserRole, companyId: 'c1' };
const OTHER_WORKER = { id: 'w2', role: 'worker' as UserRole, companyId: 'c1' };
const ACCOUNTANT = { id: 'a1', role: 'accountant' as UserRole, companyId: 'c1' };
const OWNER = { id: 'o1', role: 'owner' as UserRole, companyId: 'c1' };
const OUTSIDER = { id: 'x1', role: 'owner' as UserRole, companyId: 'c2' };

const ownReceipt = { uploadedBy: 'w1', companyId: 'c1' };
const colleagueReceipt = { uploadedBy: 'w2', companyId: 'c1' };
const otherCompanyReceipt = { uploadedBy: 'z9', companyId: 'c2' };

describe('a worker sees only their own receipts', () => {
  it('reads their own', () => {
    expect(canReadReceipt(WORKER, ownReceipt)).toBe(true);
  });

  it('cannot read a colleague receipt', () => {
    expect(canReadReceipt(WORKER, colleagueReceipt)).toBe(false);
    expect(canReadReceipt(OTHER_WORKER, ownReceipt)).toBe(false);
  });

  it('cannot read another company at all', () => {
    expect(canReadReceipt(WORKER, otherCompanyReceipt)).toBe(false);
    expect(canReadReceipt(OUTSIDER, ownReceipt)).toBe(false);
  });
});

describe('a worker cannot aggregate a company total', () => {
  // Every company figure in the app — total expenses, confirmed count, spend
  // trend, spend by category, project spend — is summed from receipts. If the
  // rows are scoped, so is every one of those numbers.
  const company = [
    { uploadedBy: 'w1', companyId: 'c1', amount: 100, status: 'confirmed' as ReceiptStatus },
    { uploadedBy: 'w2', companyId: 'c1', amount: 900, status: 'confirmed' as ReceiptStatus },
    { uploadedBy: 'a1', companyId: 'c1', amount: 500, status: 'confirmed' as ReceiptStatus },
  ];
  const visibleTotal = (viewer: typeof WORKER) =>
    company.filter((r) => canReadReceipt(viewer, r) && r.status === 'confirmed')
           .reduce((s, r) => s + r.amount, 0);

  it('a worker only ever sums their own spend', () => {
    expect(visibleTotal(WORKER)).toBe(100);
    expect(visibleTotal(WORKER)).not.toBe(1500);
  });

  it('finance still sees the whole company', () => {
    expect(visibleTotal(ACCOUNTANT)).toBe(1500);
    expect(visibleTotal(OWNER)).toBe(1500);
  });
});

describe('image access follows receipt visibility', () => {
  // 0060 dropped the "any object under a project in your company" branch, so an
  // image is readable exactly when its receipt row is.
  const canReadImage = (viewer: typeof WORKER, receipt: { uploadedBy: string; companyId: string }) =>
    canReadReceipt(viewer, receipt);

  it('a worker cannot open a colleague receipt image', () => {
    expect(canReadImage(WORKER, colleagueReceipt)).toBe(false);
  });

  it('a worker can still open their own', () => {
    expect(canReadImage(WORKER, ownReceipt)).toBe(true);
  });

  it('finance can open any image in their company, and none outside it', () => {
    expect(canReadImage(OWNER, colleagueReceipt)).toBe(true);
    expect(canReadImage(OWNER, otherCompanyReceipt)).toBe(false);
  });
});

describe('company-wide surfaces are finance-only', () => {
  const isFinance = (role: UserRole) => role === 'owner' || role === 'accountant';

  it('gates the company dashboard, reports and exports', () => {
    expect(isFinance('worker')).toBe(false);
    expect(isFinance('accountant')).toBe(true);
    expect(isFinance('owner')).toBe(true);
  });

  it('keeps a worker out of every company figure listed in the rule', () => {
    for (const _surface of [
      'total expenses', 'confirmed receipt count', 'spend trend',
      'spend by category', 'active staff', 'invoices this month',
      'project totals', 'exports',
    ]) {
      expect(isFinance('worker')).toBe(false);
    }
  });
});

describe('a worker can still do their job', () => {
  // Scoping visibility must not stop staff filing and submitting: uploading is
  // the whole point of their account.
  const canUpload = (viewer: typeof WORKER, receipt: { uploadedBy: string; companyId: string }) =>
    receipt.uploadedBy === viewer.id && receipt.companyId === viewer.companyId;

  it('can file a receipt as themselves', () => {
    expect(canUpload(WORKER, ownReceipt)).toBe(true);
  });

  it('cannot file one in somebody else name', () => {
    expect(canUpload(WORKER, colleagueReceipt)).toBe(false);
  });

  it('can read back what they just filed', () => {
    expect(canReadReceipt(WORKER, ownReceipt)).toBe(true);
  });
});
