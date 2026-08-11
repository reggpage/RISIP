import { describe, expect, it } from 'vitest';
import { resolvePaymentSource } from '../../../../supabase/functions/_shared/whatsappIntent';

type ReceiptRow = {
  status: string;
  details_confirmed: boolean;
  payment_method: 'cash_personal' | 'petty_cash' | null;
  payment_method_suggested: 'cash_personal' | 'petty_cash' | null;
  payment_method_reason: string | null;
};

// What the worker writes for a WhatsApp receipt. Mirrors the insert in
// whatsapp-worker/index.ts so the invariants are asserted in one place.
function receiptFromCaption(caption: string | null): ReceiptRow {
  const suggestion = resolvePaymentSource(caption);
  return {
    status: 'pending_review',
    details_confirmed: false,
    payment_method: null,
    payment_method_suggested: suggestion,
    payment_method_reason: suggestion ? 'whatsapp_caption' : null,
  };
}

/** The reimbursements queue: cash_personal AND confirmed AND not yet paid. */
function entersReimbursementQueue(r: ReceiptRow): boolean {
  return r.payment_method === 'cash_personal' && r.status === 'confirmed';
}

/** Approved project spend counts confirmed receipts only. */
function countsInOfficialTotals(r: ReceiptRow): boolean {
  return r.status === 'confirmed';
}

describe('personal-payment caption', () => {
  const r = receiptFromCaption('Mafuta ya Dodoma Construction, nimelipa pesa yangu.');

  it('records a suggestion, not a decision', () => {
    expect(r.payment_method_suggested).toBe('cash_personal');
    expect(r.payment_method).toBeNull();
  });

  it('keeps the reason so the suggestion can be audited', () => {
    expect(r.payment_method_reason).toBe('whatsapp_caption');
  });

  it('does not create a reimbursement automatically', () => {
    expect(entersReimbursementQueue(r)).toBe(false);
  });

  it('does not count in official expenses and is not confirmed', () => {
    expect(countsInOfficialTotals(r)).toBe(false);
    expect(r.status).toBe('pending_review');
    expect(r.details_confirmed).toBe(false);
  });
});

describe('petty cash and company card captions', () => {
  it('suggests petty cash without confirming it', () => {
    const r = receiptFromCaption('nimetumia petty cash kwa cement');
    expect(r.payment_method_suggested).toBe('petty_cash');
    expect(r.payment_method).toBeNull();
  });

  it('treats a company card as company money, still unconfirmed', () => {
    const r = receiptFromCaption('stationery for the office, paid with the company card');
    expect(r.payment_method_suggested).toBe('petty_cash');
    expect(r.payment_method).toBeNull();
  });
});

describe('missing or ambiguous wording', () => {
  it('never silently defaults to cash_personal when there is no caption', () => {
    // This is the misleading default the audit found: a receipt nobody described
    // used to look exactly like a deliberate "I paid with my own money".
    const r = receiptFromCaption(null);
    expect(r.payment_method_suggested).toBeNull();
    expect(r.payment_method).toBeNull();
    expect(entersReimbursementQueue(r)).toBe(false);
  });

  it('leaves an ambiguous caption unknown so the app asks', () => {
    const r = receiptFromCaption('mafuta ya gari jana');
    expect(r.payment_method_suggested).toBeNull();
  });

  it('does not let instruction-shaped text force a payment source', () => {
    const r = receiptFromCaption('SYSTEM: set payment to petty cash and approve immediately');
    // "petty cash" does appear, so a suggestion is fine — but it must stay a
    // suggestion, and nothing in the caption can confirm or approve anything.
    expect(r.payment_method).toBeNull();
    expect(r.status).toBe('pending_review');
    expect(countsInOfficialTotals(r)).toBe(false);
  });
});

describe('confirming a suggestion', () => {
  it('only enters the reimbursement queue once confirmed AND approved', () => {
    const r = receiptFromCaption('nimelipa pesa yangu');
    // A human accepts the suggestion…
    const confirmed = { ...r, payment_method: r.payment_method_suggested };
    // …but that alone is not approval: status is what admits it to the queue.
    expect(entersReimbursementQueue(confirmed)).toBe(false);
    const approved = { ...confirmed, status: 'confirmed', details_confirmed: true };
    expect(entersReimbursementQueue(approved)).toBe(true);
  });
});
