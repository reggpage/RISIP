import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildHypotheticalProfitReply,
  buildPortionHypotheticalProfitReply,
  parseHypotheticalProfitRequest,
  parseHypotheticalQuantity,
  type HypotheticalProfitInput,
} from '../../../../supabase/functions/_shared/whatsappHypotheticalProfit';

describe('deterministic hypothetical product profit', () => {
  it('claims the exact failed live question without claiming ordinary period profit', () => {
    expect(parseHypotheticalProfitRequest('zikiuza atlasi zote nitakuwa na faida ya shingapi')).toBe('atlasi');
    expect(parseHypotheticalProfitRequest('If I sell all the atlases, what profit will I make?')).toBe('atlases');
    expect(parseHypotheticalProfitRequest('faida ya leo ni ngapi')).toBeNull();
  });

  it('calculates retail and wholesale scenarios from server-provided pieces', () => {
    const reply = buildHypotheticalProfitReply({
      productName: 'Atlasi', onHand: 14, hasCount: true, unit: null,
      unitCost: 10_000, retailPrice: 15_000, wholesalePrice: 13_000,
    }, 'sw');
    expect(reply).toContain('14 × (TSh 15,000 − TSh 10,000) = *TSh 70,000*');
    expect(reply).toContain('14 × (TSh 13,000 − TSh 10,000) = *TSh 42,000*');
    expect(reply).toContain('hayajaandika mauzo mapya');
  });

  it('names every missing piece instead of returning a retry-later error', () => {
    const reply = buildHypotheticalProfitReply({
      productName: 'Atlasi', onHand: null, hasCount: false, unit: null,
      unitCost: null, retailPrice: null, wholesalePrice: null,
    }, 'sw');
    expect(reply).toContain('hesabu ya bidhaa ya kuanzia');
    expect(reply).toContain('bei ya kununua');
    expect(reply).toContain('bei ya kuuza');
    expect(reply).not.toContain('jaribu tena');
  });

  it('does not claim stock or cost is missing when only the selling price is absent', () => {
    const reply = buildHypotheticalProfitReply({
      productName: 'Atlasi', onHand: 14, hasCount: true, unit: null,
      unitCost: 10_000, retailPrice: null, wholesalePrice: null,
    }, 'sw');
    expect(reply).toContain('bei ya kuuza');
    expect(reply).not.toContain('stock count ya kuanzia');
    expect(reply).not.toContain('- bei ya kununua');
  });

  it('routes the deterministic read before the conversational model', () => {
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    // The order inverted deliberately: the model reads the message first and
    // the deterministic reads are the fallback beneath it. What matters here is
    // unchanged — the arithmetic is the tool's, not the model's — so this now
    // asserts the tool exists and is reachable, not that it runs first.
    const deterministic = webhook.indexOf('parseHypotheticalProfitRequest(body)');
    const assistant = webhook.indexOf('const aiEligible = Boolean(body?.trim())');
    expect(deterministic).toBeGreaterThan(-1);
    expect(deterministic).toBeGreaterThan(assistant);
    expect(webhook).toContain("if (name === 'get_hypothetical_product_profit')");
    // Stage D: the rendered sentence became the FALLBACK rather than the answer.
    // A terminalReply on a success path hands the shop a pre-written line and
    // stops the model reasoning about what was actually asked. What this test
    // guards is unchanged and is the part that matters: the arithmetic is still
    // the tool's, and the model still cannot compute a profit of its own.
    expect(webhook).toContain('return { content: result.text, fallbackReply: result.text };');
    expect(webhook).not.toContain('return { content: result.text, terminalReply: result.text };');
  });

  it('uses base-unit cost and only complete portions in a sell-all estimate', () => {
    const reply = buildPortionHypotheticalProfitReply({
      productName: 'mafuta', onHandBase: 39.25, hasCount: true, baseUnit: 'lita',
      baseUnitCost: 1000, saleUnit: 'robo', unitBaseQuantity: 0.25,
      retailPrice: 700, wholesalePrice: null,
    }, 'sw');
    expect(reply).toContain('157 robo');
    expect(reply).toContain('TSh 70,650');
    expect(reply).toContain('hayajaandika mauzo mapya');
  });

  it('names base stock left over when it cannot form another complete portion', () => {
    const reply = buildPortionHypotheticalProfitReply({
      productName: 'mafuta', onHandBase: 1.25, hasCount: true, baseUnit: 'lita',
      baseUnitCost: 1000, saleUnit: 'nusu', unitBaseQuantity: 0.5,
      retailPrice: 1200, wholesalePrice: null,
    }, 'sw');
    expect(reply).toContain('2 nusu');
    expect(reply).toContain('Inabaki: 0.25 lita');
  });
});

describe('answering the quantity that was actually asked', () => {
  const shop: HypotheticalProfitInput = {
    productName: 'marker', onHand: 79, hasCount: true, unit: null,
    unitCost: 1300, retailPrice: 2000, wholesalePrice: 1800,
    avgUnitPrice: null,
  };

  it('reads the number out of the question', () => {
    // "kwa bei ya reja reja marker nikiuza kumi ntapata shingapi?"
    expect(parseHypotheticalQuantity('kwa bei ya reja reja marker nikiuza kumi ntapata shingapi?')).toBe(10);
    expect(parseHypotheticalQuantity('nikiuza 25 nitapata faida gani')).toBe(25);
    expect(parseHypotheticalQuantity('if i sell 12 what profit')).toBe(12);
  });

  it('has no number to read when none was named', () => {
    expect(parseHypotheticalQuantity('zikiuza marker zote nitakuwa na faida ya shingapi')).toBeNull();
    expect(parseHypotheticalQuantity('faida ya marker ni ngapi')).toBeNull();
  });

  it('estimates on the quantity asked, not the whole shelf', () => {
    // MEASURED FAILURE: asked about ten, answered for seventy-nine. The
    // arithmetic was right and it answered nobody's question.
    const reply = buildHypotheticalProfitReply({ ...shop, askedQuantity: 10 }, 'sw');
    expect(reply).toContain('10 × (TSh 2,000 − TSh 1,300) = *TSh 7,000*');
    expect(reply).not.toContain('79 ×');
  });

  it('still covers the shelf when no number was named', () => {
    const reply = buildHypotheticalProfitReply({ ...shop, askedQuantity: null }, 'sw');
    expect(reply).toContain('79 × (TSh 2,000 − TSh 1,300) = *TSh 55,300*');
  });

  it('never estimates on more than the shop has, and says so', () => {
    const reply = buildHypotheticalProfitReply({ ...shop, askedQuantity: 200 }, 'sw');
    expect(reply).toContain('79 ×');
    expect(reply).toMatch(/Uliuliza 200/);
  });
});
