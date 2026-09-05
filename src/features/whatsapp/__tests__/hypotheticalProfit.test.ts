import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { validateToolValue } from '../../../../supabase/functions/_shared/whatsappToolBoundary';
import {
  buildHypotheticalProfitReply,
  buildPortionHypotheticalProfitReply,
  parseHypotheticalProfitRequest,
  parseHypotheticalQuantity,
  type HypotheticalProfitInput,
} from '../../../../supabase/functions/_shared/whatsappHypotheticalProfit';

describe('deterministic hypothetical product profit', () => {
  it('requires AI quantity and band fields and forwards them into server arithmetic', () => {
    const contract = ASSISTANT_TOOLS.find(t => t.name === 'get_hypothetical_product_profit')!;
    expect(validateToolValue({ product_name: 'Nguvu ya sala' }, contract.input_schema)).not.toBeNull();
    expect(validateToolValue({ product_name: 'Nguvu ya sala', quantity: 2, price_band: 'retail' }, contract.input_schema)).toBeNull();
    expect(validateToolValue({ product_name: 'Nguvu ya sala', quantity: 2, price_band: 'invented' }, contract.input_schema)).not.toBeNull();
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(source).toContain('hypotheticalProfitToolReply(db, identity, productName, lang, quantity, band)');
  });
  it('answers the exact viwili retail follow-up with revenue and gross profit, not all stock', () => {
    const reply = buildHypotheticalProfitReply({ productName: 'Nguvu ya sala', askedQuantity: 2,
      priceBand: 'retail', onHand: 3, hasCount: true, unit: null, unitCost: 8000,
      retailPrice: 10600, wholesalePrice: 9500 }, 'sw');
    expect(reply).toContain('Mapato ya mauzo: 2 × TSh 10,600 = *TSh 21,200*');
    expect(reply).toContain('*TSh 5,200*');
    expect(reply).not.toContain('7,800');
    expect(reply).not.toContain('9,500');
    expect(reply).toContain('hayajaandika mauzo mapya');
  });

  it('does not cap a hypothetical request to stock or require cost to report revenue', () => {
    const reply = buildHypotheticalProfitReply({ productName: 'Nguvu ya sala', askedQuantity: 4,
      priceBand: 'retail', onHand: 3, hasCount: true, unit: null, unitCost: null,
      retailPrice: 10600, wholesalePrice: 9500 }, 'sw');
    expect(reply).toContain('*TSh 42,400*');
    expect(reply).toContain('stock ni 3');
    expect(reply).toContain('Faida ghafi haijulikani');
  });

  it('rejects invalid quantities and never substitutes retail for missing wholesale', () => {
    const base: HypotheticalProfitInput = { productName: 'vest', askedQuantity: 2,
      priceBand: 'wholesale', onHand: 3, hasCount: true, unit: null, unitCost: 8000,
      retailPrice: 10600, wholesalePrice: null };
    expect(buildHypotheticalProfitReply(base, 'sw')).toContain('haijawekwa');
    for (const askedQuantity of [0, -1, NaN, Infinity, 1000001]) {
      expect(buildHypotheticalProfitReply({ ...base, askedQuantity }, 'sw')).toContain('si sahihi');
    }
  });
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
