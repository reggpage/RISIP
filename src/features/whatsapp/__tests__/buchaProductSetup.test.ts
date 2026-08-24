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

  it('sends a price with no cost to wa_set_selling_price', () => {
    expect(webhook).toContain('setup.purchaseCost === null');
    expect(webhook).toContain("await db.rpc('wa_set_selling_price'");
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
