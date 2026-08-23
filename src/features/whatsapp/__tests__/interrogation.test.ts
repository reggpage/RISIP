import { describe, expect, it } from 'vitest';
import { route } from '../../../../scripts/lib/route';
import { parseProductCost } from '../../../../supabase/functions/_shared/whatsappProductCosts';

// Every case here came out of scripts/interrogate.ts — a harness that builds
// questions from the shop's own catalogue, prices and counts, asks them in the
// words a shopkeeper would use, and checks the answer against arithmetic done
// separately. None of them were written by somebody who knew what the parsers
// expected, which is exactly why they found what the eval files did not.

describe('questions about the shelf, asked the way they get asked', () => {
  it('reads the whole shelf without the word "stock ya"', () => {
    for (const said of [
      'stock yangu ikoje', 'stock yangu', 'nina nini dukani',
      'nionyeshe zilizopo', 'zilizopo',
    ]) {
      expect(route(said), said).toBe('stock_question');
    }
  });

  it('reads "what has run out" in more than one dialect of it', () => {
    for (const said of ['nini kimeisha dukani', 'zipi zimekwisha', 'bidhaa gani zimeisha?']) {
      expect(route(said), said).toBe('stock_question');
    }
  });
});

describe('questions about money, answered from the ledger', () => {
  it('takes the plainest way of asking what came in today', () => {
    for (const said of [
      'leo nimeuza kiasi gani?', 'nimeuza kiasi gani leo',
      'nimeingiza pesa ngapi leo', 'nimeuza ngapi wiki hii',
    ]) {
      expect(route(said), said).toBe('ai_business_summary');
    }
  });

  it('takes a request for the debtor list phrased as a list', () => {
    for (const said of ['orodha ya wanaodaiwa', 'nionyeshe madeni', 'nani ananidai']) {
      expect(route(said), said).toBe('ai_debtors');
    }
  });

  // The line these questions must not cross: a message that states a figure is
  // a record, not a question, and reading one as the other loses the day.
  it('still records the sales and purchases that state a figure', () => {
    expect(route('nimeuza daftari 5 kwa 7500')).toBe('daily_record');
    expect(route('nimeuza daftari 5')).toBe('quantity_sale');
    expect(route('nina daftari 90')).toBe('stock_count');
    expect(route('nimelipa umeme 20000')).toBe('daily_record');
  });
});

describe('a buying price stated per unit', () => {
  // "daftari nimenunua kwa 1750 kila moja" was answered with "is 1,750 the
  // total or the price of each?" — a question the sentence had just answered.
  it('reads it whichever end the verb is at', () => {
    expect(parseProductCost('daftari nimenunua kwa 1750 kila moja'))
      .toEqual({ product: 'daftari', unitCost: 1750, unit: null });
    expect(parseProductCost('nimenunua daftari kwa 1750 kila moja'))
      .toEqual({ product: 'daftari', unitCost: 1750, unit: null });
    expect(parseProductCost('kifutio nimenunua kwa 200 each'))
      .toEqual({ product: 'kifutio', unitCost: 200, unit: null });
  });

  // Without "kila moja" the figure is the day's spending, and filing it as a
  // unit cost would put every future margin out by the size of the delivery.
  it('leaves a purchase with no per-unit words alone', () => {
    expect(parseProductCost('nimenunua daftari 20 kwa 35000')).toBeNull();
    expect(route('nimenunua daftari 20 kwa 35000')).toBe('daily_record');
  });
});
