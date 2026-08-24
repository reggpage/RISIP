import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  derivedUnitCost,
  packagingConfirmation,
  parseProductSetup,
  productSetupConfirmation,
  setupSaleUnits,
} from '../../../../supabase/functions/_shared/whatsappProductSetup';
import { parseDailyRecordBatch } from '../../../../supabase/functions/_shared/whatsappDailyRecordBatch';

// RISIP BUCHA, PHASE 4 — setting a product up in the shop's own words.
//
// No new engine. Every sentence here is read into the arguments
// wa_configure_product_units already takes, and the conversion arithmetic —
// 18,000 a box of twelve makes a packet cost 1,500 — stays in SQL.

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');

const setup = (said: string) => {
  const reading = parseProductSetup(said);
  expect(reading, said).not.toBeNull();
  return reading!;
};

describe('bought and sold in the same measure', () => {
  it("reads ongeza nyama ya ng'ombe nanunua kilo 9000 nauza 12000", () => {
    expect(setup("ongeza nyama ya ng'ombe nanunua kilo 9000 nauza 12000")).toEqual({
      kind: 'product_setup',
      product: "nyama ya ng'ombe",
      baseUnit: 'kilo', purchaseUnit: 'kilo', purchaseSize: 1, purchaseCost: 9000,
      saleUnit: 'kilo', salePrice: 12000,
    });
  });

  it('reads the measure written last: ongeza maini nanunua 7000 nauza 10000 kilo', () => {
    const reading = setup('ongeza maini nanunua 7000 nauza 10000 kilo');
    if (reading.kind !== 'product_setup') return;
    expect(reading.product).toBe('maini');
    expect(reading.baseUnit).toBe('kilo');
    expect(reading.purchaseCost).toBe(7000);
    expect(reading.salePrice).toBe(10000);
  });
});

describe('bought whole, sold in pieces', () => {
  // The two figures the brief named, and both are divisions the shop never does.
  it('turns a box of twelve at 18,000 into 1,500 a packet', () => {
    const reading = setup('ongeza maziwa box ina packet 12, box nanunua 18000 na packet nauza 2000');
    if (reading.kind !== 'product_setup') return;
    expect(reading).toEqual({
      kind: 'product_setup', product: 'maziwa',
      baseUnit: 'packet', purchaseUnit: 'box', purchaseSize: 12, purchaseCost: 18000,
      saleUnit: 'packet', salePrice: 2000,
    });
    expect(derivedUnitCost(reading)).toBe(1500);
  });

  it('turns a packet of twenty-four at 18,000 into 750 a sausage', () => {
    const reading = setup('ongeza soseji packet ina 24, packet nanunua 18000 na moja nauza 1000');
    if (reading.kind !== 'product_setup') return;
    // "moja nauza 1000" means one PIECE sells for 1000.
    expect(reading.baseUnit).toBe('kipande');
    expect(reading.purchaseSize).toBe(24);
    expect(derivedUnitCost(reading)).toBe(750);
    expect(reading.salePrice).toBe(1000);
  });

  it('never divides in the preview without saying what it divided', () => {
    const reading = setup('ongeza maziwa box ina packet 12, box nanunua 18000 na packet nauza 2000');
    if (reading.kind !== 'product_setup') return;
    const preview = productSetupConfirmation(reading, derivedUnitCost(reading), 'sw');
    expect(preview).toContain('box 1');
    expect(preview).toContain('packet 12');
    expect(preview).toContain('TSh 1,500');
    expect(preview).toContain('NDIYO');
  });
});

describe('a price with no cost behind it', () => {
  it('reads ongeza chakula cha mbwa nauza kilo 2000 and invents no cost', () => {
    const reading = setup('ongeza chakula cha mbwa nauza kilo 2000');
    if (reading.kind !== 'product_setup') return;
    expect(reading.product).toBe('chakula cha mbwa');
    expect(reading.baseUnit).toBe('kilo');
    expect(reading.salePrice).toBe(2000);
    expect(reading.purchaseCost).toBeNull();
    expect(derivedUnitCost(reading)).toBeNull();
  });

  it('says outright that the buying cost is not known', () => {
    const reading = setup('ongeza chakula cha mbwa nauza kilo 2000');
    if (reading.kind !== 'product_setup') return;
    const preview = productSetupConfirmation(reading, null, 'sw');
    expect(preview).toContain('sijui bado');
    expect(preview).not.toContain('TSh 0');
  });
});

describe('a bag that holds a kilo', () => {
  // "Kifuko" is emphatically not a product alias: a bag is not another name for
  // dog food, it is a quantity of it.
  it('reads kwetu chakula cha mbwa kinawekwa vifuko vya kilo moja', () => {
    expect(setup('kwetu chakula cha mbwa kinawekwa vifuko vya kilo moja')).toEqual({
      kind: 'packaging_setup',
      product: 'chakula cha mbwa',
      packageUnit: 'kifuko',
      baseUnit: 'kilo',
      size: 1,
    });
  });

  it('explains the consequence in the shop’s own arithmetic', () => {
    const reading = setup('kwetu chakula cha mbwa kinawekwa vifuko vya kilo moja');
    if (reading.kind !== 'packaging_setup') return;
    expect(packagingConfirmation(reading, 'sw')).toContain('kilo 3');
  });

  it('is never stored as vocabulary', () => {
    const vocabulary = src('supabase/functions/_shared/whatsappVocabulary.ts');
    expect(vocabulary).not.toMatch(/kifuko['"]\s*[:,]/);
    const migration = src('supabase/migrations/0124_business_vocabulary.sql');
    expect(migration).toContain("if v_kind not in ('product_alias', 'semantic_term') then");
  });
});

describe('the three shapes go through three existing doors', () => {
  // MEASURED, by calling the real RPC: configure_product_units demands a base
  // unit, a purchase unit, a size, a cost AND a priced selling unit, and
  // refuses a product it has already configured.
  it('sends a full setup to wa_configure_product_units', () => {
    expect(webhook).toContain("await db.rpc('wa_configure_product_units'");
    expect(webhook).toContain('p_sale_units: setupSaleUnits(setup),');
  });

  // Originally this asserted wa_set_selling_price, and the hardening pass
  // proved that door throws the unit away. See "a price needs a unit to belong
  // to" below.
  it('sends a price with no cost through the unit door', () => {
    expect(webhook).toContain('setup.purchaseCost === null');
    expect(webhook).toContain("await db.rpc('wa_add_product_unit'");
  });

  it('sends a package to wa_add_product_unit', () => {
    expect(webhook).toContain("await db.rpc('wa_add_product_unit'");
    expect(webhook).toContain('p_base_quantity: setup.size,');
  });

  it('is owner and accountant only', () => {
    expect(webhook).toContain("await audit(db, identity, waMessageId, 'product_setup', 'role', 'blocked');");
  });

  it('stores nothing before the shop says NDIYO', () => {
    const handler = webhook.slice(webhook.indexOf('const productSetup = parseProductSetup(writeBody);'));
    expect(handler.indexOf("awaiting: 'product_cost',")).toBeGreaterThan(-1);
    expect(handler.slice(0, handler.indexOf("awaiting: 'product_cost',")))
      .not.toContain("db.rpc('wa_configure_product_units'");
  });
});

describe('a selling unit carries its price and nothing invented', () => {
  it('declares base_quantity 1 for the unit stock is counted in', () => {
    const reading = setup('ongeza maziwa box ina packet 12, box nanunua 18000 na packet nauza 2000');
    if (reading.kind !== 'product_setup') return;
    expect(setupSaleUnits(reading)).toEqual([
      { unit: 'packet', base_quantity: 1, retail: 2000, wholesale: null, min_qty: null },
    ]);
  });
});

describe('what must not be mistaken for a setup', () => {
  it.each([
    'nimeuza nyama kilo 3 cash',
    'nyama kilo 3 imeharibika',
    'nimechukua nyama kilo 2 nyumbani',
    'nikisema za mbwa namaanisha chakula cha mbwa',
  ])('refuses %s', (said) => {
    expect(parseProductSetup(said)).toBeNull();
  });
});

describe('the chips vendor still buys bags by the packet', () => {
  // "kifuko" joined the shared measures; its plural "mifuko" deliberately did
  // not, because for a chips vendor mifuko ARE the product.
  it('keeps mifuko a product, not a measure', () => {
    const parse = parseDailyRecordBatch(
      'nimenunua mifuko pakiti 2 kwa 6000\nnimenunua mkaa gunia 1 kwa 45000', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records[0].lines[0]).toEqual(
      { description: 'mifuko', quantity: 2, unit_amount: 3000, unit: 'pakiti' });
  });
});

// PHASE 4 HARDENING.
//
// MEASURED against production: after phase 4 routed the sell-only sentence
// through wa_set_selling_price, sale_unit was NULL, product_units had no rows
// at all, and wa_company_product_sale_units could not see the product. The
// shop had said "kilo" and the word was thrown away, so phase 5 would have had
// nothing whatsoever to say about "kifuko 4".
describe('a price needs a unit to belong to', () => {
  const migration = src('supabase/migrations/0126_a_price_needs_a_unit_to_belong_to.sql');

  it('sends a sell-only setup through the unit door, not the bare price one', () => {
    const handler = webhook.slice(webhook.indexOf('setup.purchaseCost === null'));
    const branch = handler.slice(0, handler.indexOf('wa_configure_product_units'));
    expect(branch).toContain("db.rpc('wa_add_product_unit'");
    expect(branch).toContain('p_retail: setup.salePrice,');
    // The bare-price RPC still serves the older price-change flows, and is
    // named in the comment here explaining why setup no longer uses it — so
    // this asserts the CALL that is made, not the absence of a word.
    expect(branch).not.toContain("db.rpc('wa_set_selling_price'");
  });

  it('lets the first unit of a product be its base', () => {
    expect(migration).toContain('v_is_base := true;');
    // A base unit is by definition one of itself.
    expect(migration).toContain('the first unit of a product must be its base, with a conversion of one');
  });

  it('prices any unit with ONE formula, not one per package type', () => {
    expect(migration).toContain('create or replace function public.wa_price_sale_unit(');
    // Its own price when it has one; otherwise derived from the base.
    expect(migration).toContain("case when (select retail_price from own_price) is not null then 'unit' else 'derived' end");
    expect(migration).toContain('* m.base_quantity');
  });

  it('stores no duplicate price for a derived unit', () => {
    // A kifuko that holds a kilo needs no price of its own, because the kilo
    // has one.
    const kifuko = webhook.slice(webhook.indexOf("db.rpc('wa_add_product_unit'"));
    expect(kifuko.slice(0, 300)).toContain('p_retail: null,');
  });
});

describe('adding kifuko to the shared measures broke nobody', () => {
  // The word joined the list; its plural deliberately did not.
  it('keeps mifuko a product a chips vendor buys by the packet', () => {
    const parse = parseDailyRecordBatch(
      'nimenunua mifuko pakiti 2 kwa 6000\nnimenunua viazi gunia 2 kwa 90000', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records[0].lines[0].description).toBe('mifuko');
    expect(parse.records[1].lines[0].description).toBe('viazi');
  });

  it('still reads a sale of a product whose name contains a measure word', () => {
    // "mfuko" has always been a measure; a shop selling something called
    // "mfuko wa saruji" is unaffected because the whole phrase is the name.
    const parse = parseDailyRecordBatch(
      'nimeuza mfuko wa saruji 2 kwa 30000, kalamu 3 kwa 1500', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records[0].lines.map((line) => line.description))
      .toEqual(['mfuko wa saruji', 'kalamu']);
  });

  it('leaves a bare kifuko with no product to attach to unresolved', () => {
    // A measure standing alone is still not a product, which is the rule the
    // arrival parser learned from "trei".
    const parse = parseDailyRecordBatch('nimenunua kifuko 3 kwa 6000 na kreti 2 kwa 24000', 'sw');
    expect(parse.kind).toBe('unreadable');
  });
});
