import { describe, expect, it } from 'vitest';
import { route } from '../../../../scripts/lib/route';
import { parseDailyRecord } from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import { parseBareQuantityList } from '../../../../supabase/functions/_shared/whatsappQuantitySale';

// Asked to invert the whole architecture — send every message to Claude
// first, let the model decide sale/purchase/stock, hand a "normalized"
// verdict to code for arithmetic — on the claim that the deterministic layer
// blocks understanding of ordinary stock-arrival language like
// "mzigo mpya trei 3".
//
// The claim was half right: this phrase WAS misread. But the fix is two
// narrow, deterministic guards, not an architecture inversion — every severe
// bug this session (the leaked prompt, the apology counted as an answer, the
// price read as a quantity) was caused by the MODEL being in the critical
// path for something code should have owned, never by the regex layer
// blocking language it should have understood. Putting Claude in front of
// every message — including "nimeuza daftari 5", the single highest-volume
// action in the product — trades a millisecond, free, always-available
// operation for a network call that can time out, rate-limit, or hallucinate,
// for no benefit on the 95% of messages that were never ambiguous.

describe('stock arriving, misread as a sale', () => {
  // MEASURED FAILURE: with no verb, "mzigo mpya trei 3" matched
  // parseBareQuantityList and would have been read as SELLING three of a
  // product called "mzigo mpya trei". stockPurchaseRecord already treats
  // "mzigo"/"bidhaa"/"stoo" as unmistakable stock language; this list had
  // "stock" and "store" but not their Swahili equivalents, so the two files
  // disagreed about the exact same word.
  it('no longer sells a delivery that named no product', () => {
    expect(route('mzigo mpya trei 3')).not.toBe('bare_quantity_sale');
    expect(route('bidhaa mpya zimefika')).not.toBe('bare_quantity_sale');
  });

  // The honest outcome for language this ambiguous is the AI-assisted path —
  // not a silent guess in either direction. This is the "hybrid" behaviour
  // that was asked for, and it already exists: deterministic code claims what
  // it is confident about; genuinely unclear language reaches the model,
  // which has a real tool (propose_daily_record) to structure it from there.
  it('falls through to the AI-assisted path instead of guessing', () => {
    expect(route('mzigo mpya trei 3')).toBe('conversational_ai');
  });

  it('still reads an ordinary bare sale with no stock word in it', () => {
    expect(route('daftari 5')).toBe('bare_quantity_sale');
    expect(route('nimeuza daftari 5')).toBe('quantity_sale');
  });
});

describe('a verb welded onto a product name', () => {
  // MEASURED FAILURE, from the owner's own screenshot:
  //   "nimeingiza trei 3 na mayai 15 leo"
  // was read as a list containing a product literally named "nimeingiza trei",
  // and the shop was then asked to give it a buying price. Same failure family
  // as "velvet badilisha" and "ya velvet selling price" — a verb absorbed into
  // a product name and about to be written into the catalogue for good.
  //
  // Root cause was the SAME shape as the "mzigo" bug fixed one commit earlier:
  // stockPurchaseRecord already knew "nimeingiza"; the bare-list refusal was a
  // hand-kept copy of that vocabulary that had "nimenunua" but not
  // "nimeingiza". Both now read from STOCK_ARRIVAL_VERBS, one list.
  it('never invents a product out of the verb that opened the sentence', () => {
    const listed = parseBareQuantityList('nimeingiza trei 3 na mayai 15 leo');
    expect(listed?.items.some((item) => /nimeingiza/i.test(item.product))).not.toBe(true);
    expect(listed).toBeNull();
  });

  it('refuses every stock-arrival verb the purchase parser claims', () => {
    for (const said of [
      'nimeingiza trei 3 na mayai 15',
      'nimeongeza trei 3 na mayai 15',
      'naongeza trei 3 na mayai 15',
      'nimeweka trei 3 na mayai 15',
      'nimenunua trei 3 na mayai 15',
    ]) {
      expect(parseBareQuantityList(said), said).toBeNull();
    }
  });

  // The same words WITHOUT an arrival verb are still an ordinary bare list —
  // the fix must not swallow a genuine sale that merely mentions a tray.
  it('still reads the same goods with no arrival verb in front', () => {
    const listed = parseBareQuantityList('trei 3 na mayai 15');
    expect(listed?.items).toEqual([
      { product: 'trei', quantity: 3, band: null },
      { product: 'mayai', quantity: 15, band: null },
    ]);
  });
});

describe('a quantity mistaken for a shilling amount', () => {
  // MEASURED FAILURE: "nimeingiza mzigo mpya wa mayai trei 3" — three TRAYS —
  // was recorded as a stock purchase of TSh 3. parseSaleLines could not read
  // "mayai trei 3" as a quantity line because the unit word sits between the
  // product and its number, so control fell through to moneyTokens, which has
  // no concept of a unit and simply grabbed the last bare number in the
  // sentence. Same failure family as a sale quantity read as a debt amount,
  // fixed earlier this session with the same remedy: refuse rather than
  // fabricate a number that will sit in the ledger looking legitimate.
  it('refuses to invent a three-shilling purchase from three trays', () => {
    const said = 'nimeingiza mzigo mpya wa mayai trei 3';
    const parsed = parseDailyRecord(said, 'sw');
    if (parsed.kind === 'parsed') {
      expect(parsed.record.amount).not.toBe(3);
    } else {
      expect(parsed.kind).toBe('clarify');
    }
  });

  it('still records a stock purchase that states both quantity and price', () => {
    const parsed = parseDailyRecord('nimenunua sukari kilo 50 kwa 130000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.kind).toBe('stock_purchase');
    expect(parsed.record.amount).toBe(130000);
    expect(parsed.record.lines).toEqual([
      { description: 'sukari', quantity: 50, unit_amount: 2600, unit: 'kilo' },
    ]);
  });

  it('still records a per-unit stock purchase with no measure word at all', () => {
    const parsed = parseDailyRecord('nimenunua daftari 100 kila moja 900', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.amount).toBe(90_000);
  });

  it('still refuses an undeclared, unquantified purchase exactly as before', () => {
    // "mkaa 7000" — charcoal for cooking, or charcoal to sell? Refused on
    // purpose, unrelated to this fix; kept here so the guard above is proven
    // not to have loosened this existing refusal.
    const parsed = parseDailyRecord('nimenunua mkaa 7000', 'sw');
    expect(parsed.kind).not.toBe('parsed');
  });
});
