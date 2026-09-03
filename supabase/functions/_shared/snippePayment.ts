// Asking Snippe for one payment.
//
// Written once and used twice: from billing-charge, where a human presses a
// button, and from whatsapp-webhook, where a shopkeeper types "1". Two copies
// of code that moves money is two places to get the idempotency key wrong.
//
// EVERY LESSON THE FIRST LIVE PAYMENT TAUGHT IS ENCODED HERE:
//   the amount is an integer of SHILLINGS, not cents (TSh 1,000 settled with a
//   TSh 25 fee, which is 2.5 per cent exactly);
//   a payment with no provider is accepted, returns 201 and pending, and rings
//   NOBODY, so the network is required;
//   Snippe ignores external_reference and returns its own, so the reference it
//   gives back is the only reliable link to an invoice and must be stored;
//   customer firstname, lastname and email are all required, though no example
//   in their quickstart shows them.

const SNIPPE_BASE = 'https://api.snippe.sh';

/** No plan costs this much. A bug that multiplies by 100 stops here. */
export const MAX_CHARGE_TZS = 200_000;

export type SnippeProvider = 'mpesa' | 'airtel' | 'mixx' | 'halotel';

/**
 * Which network a Tanzanian number is on.
 *
 * MEASURED: sending no provider produced a prompt the owner never received.
 * Guessing is therefore better than omitting, but only where the guess is
 * safe. These prefixes are the allocations that have been stable for years;
 * anything outside them returns null and the caller ASKS rather than guesses,
 * because a push to the wrong network is silence, and silence in a payment
 * flow reads as a broken product.
 */
export function providerForPhone(phone: string): SnippeProvider | null {
  const digits = String(phone ?? '').replace(/[^0-9]/g, '');
  const local = digits.startsWith('255') ? digits.slice(3)
    : digits.startsWith('0') ? digits.slice(1)
    : digits;
  if (local.length !== 9) return null;
  const head = local.slice(0, 2);
  if (['74', '75', '76'].includes(head)) return 'mpesa';
  if (['78', '68', '69'].includes(head)) return 'airtel';
  if (['71', '65', '67'].includes(head)) return 'mixx';
  if (['62', '61'].includes(head)) return 'halotel';
  return null;
}

export type SnippeCustomer = {
  firstname: string;
  lastname: string;
  email: string;
};

/** One name is a real answer here, so it fills both fields rather than failing. */
export function splitName(fullName: string | null | undefined): { firstname: string; lastname: string } {
  const whole = String(fullName ?? '').replace(/\s+/g, ' ').trim();
  if (!whole) return { firstname: '', lastname: '' };
  const cut = whole.lastIndexOf(' ');
  return cut > 0
    ? { firstname: whole.slice(0, cut), lastname: whole.slice(cut + 1) }
    : { firstname: whole, lastname: whole };
}

export type PaymentRequest = {
  invoiceId: string;
  amountTzs: number;
  phone: string;
  provider: SnippeProvider;
  customer: SnippeCustomer;
  webhookUrl: string;
  apiKey: string;
  /**
   * Bumped BY HAND to start a genuinely new payment when the last one expired
   * unpaid. The key stays the invoice, which is what stops a refreshed browser
   * or a double-tapped "1" becoming a second charge.
   */
  attempt?: number;
};

export type PaymentResult = {
  ok: boolean;
  httpStatus: number;
  reference: string | null;
  status: string | null;
  payload: Record<string, unknown>;
};

export async function createSnippePayment(request: PaymentRequest): Promise<PaymentResult> {
  const amount = Math.round(request.amountTzs);
  if (!(amount >= 500 && amount <= MAX_CHARGE_TZS)) {
    return {
      ok: false, httpStatus: 0, reference: null, status: null,
      payload: { error: `amount out of range: ${amount}` },
    };
  }
  const phone = String(request.phone).replace(/[^0-9]/g, '');
  if (!/^255[0-9]{9}$/.test(phone)) {
    return {
      ok: false, httpStatus: 0, reference: null, status: null,
      payload: { error: 'phone must be 255XXXXXXXXX' },
    };
  }

  const attempt = Number.isInteger(request.attempt) && (request.attempt ?? 1) > 1
    ? request.attempt : 1;

  const response = await fetch(`${SNIPPE_BASE}/v1/payments`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${request.apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': attempt === 1 ? request.invoiceId : `${request.invoiceId}:${attempt}`,
    },
    body: JSON.stringify({
      payment_type: 'mobile',
      details: { amount, currency: 'TZS' },
      phone_number: phone,
      customer: { ...request.customer, phone },
      channel: { type: 'mobile_money', provider: request.provider },
      external_reference: request.invoiceId,
      webhook_url: request.webhookUrl,
    }),
  });

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { payload = { raw: text.slice(0, 400) }; }
  const data = (payload.data ?? payload) as Record<string, unknown>;

  return {
    ok: response.ok,
    httpStatus: response.status,
    reference: data.reference ? String(data.reference) : null,
    status: data.status ? String(data.status) : null,
    payload,
  };
}
