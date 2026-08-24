import { describe, expect, it } from 'vitest';
import { parseQuantityOnlySale, parseBareQuantityList } from '../../../../supabase/functions/_shared/whatsappQuantitySale';
import { canonicalUnitWord, isUnitWord } from '../../../../supabase/functions/_shared/whatsappStock';

// PHASE 5 — separating the goods from the measure.
//
// MEASURED: "nimeuza nyama kilo 2" produced a product called "nyama kilo", so
// the measure never reached the pricing engine and a configured-unit sale could
// not be priced at all.
//
// `product` is left EXACTLY as written, because every existing vertical
// resolves from it and one of them depends on the whole phrase — an oil shop's
// declared portion is matched as "mafuta robo". The split is offered ALONGSIDE.

const items = (said: string) => parseQuantityOnlySale(said)?.items;
const one = (said: string) => {
  const list = items(said);
  expect(list, said).toBeTruthy();
  expect(list!.length, said).toBe(1);
  return list![0];
};

describe('an explicit measure', () => {
  it('separates nyama from kilo without changing what was written', () => {
    expect(one('nimeuza nyama kilo 2')).toMatchObject({
      product: 'nyama kilo', quantity: 2, spokenUnit: 'kilo', productWithoutUnit: 'nyama',
    });
  });

  it.each([
    ['nimeuza nyama kilo mbili', 2],
    ['nimeuza nyama kilo mbili na nusu', 2.5],
  ])('reads the quantity in %s as %s', (said, quantity) => {
    expect(one(said)).toMatchObject({ quantity, spokenUnit: 'kilo', productWithoutUnit: 'nyama' });
  });

  it('reads a fraction that leads the sentence', () => {
    // "nusu kilo nyama" normalises to "kilo 0.5 nyama" — the same thing said
    // with the measure in front.
    expect(one('nimeuza nusu kilo nyama')).toMatchObject({
      product: 'nyama', quantity: 0.5, spokenUnit: 'kilo',
    });
  });
});

describe('a measure that leads, in the plural', () => {
  it('reads vifuko 4 vya mbwa as four kifuko of the dog food wording', () => {
    expect(one('nimeuza vifuko 4 vya mbwa')).toMatchObject({
      product: 'mbwa', quantity: 4, spokenUnit: 'kifuko',
    });
  });

  it('folds the plural in language only, never into a new measure', () => {
    expect(canonicalUnitWord('vifuko')).toBe('kifuko');
    expect(canonicalUnitWord('vipande')).toBe('kipande');
    expect(canonicalUnitWord('packets')).toBe('packet');
    // A word that is not a measure comes back exactly as it went in.
    expect(canonicalUnitWord('mbwa')).toBe('mbwa');
  });
});

describe('no measure stated at all', () => {
  it.each([
    ['nimeuza za mbwa 3', 'za mbwa', 3],
    ['nimeuza soseji 8', 'soseji', 8],
    ['nimeuza maziwa 4', 'maziwa', 4],
  ])('leaves the unit unspecified in %s', (said, product, quantity) => {
    const item = one(said);
    expect(item).toMatchObject({ product, quantity });
    // The parser does not invent one. Inferring it from configuration is the
    // resolver's job, and only where the shop configured exactly one.
    expect(item.spokenUnit ?? null).toBeNull();
  });

  it('never invents a product from a bare number', () => {
    expect(parseQuantityOnlySale('nimeuza 5')).toBeNull();
  });
});

describe('what the split must never touch', () => {
  // The whole risk of this refactor. These are other shops' real lines.
  it('keeps mifuko a product, since a chips vendor buys bags by the packet', () => {
    expect(one('nimeuza mifuko 2')).toMatchObject({ product: 'mifuko', quantity: 2 });
    expect(one('nimeuza mifuko 2').productWithoutUnit ?? null).toBeNull();
    expect(isUnitWord('mifuko')).toBe(false);
  });

  it('keeps a product name that merely ends in a measure-ish word', () => {
    expect(one('nimeuza mfuko wa saruji 2')).toMatchObject({ product: 'mfuko wa saruji', quantity: 2 });
  });

  it('leaves the oil shop’s declared portion phrase whole', () => {
    // "mafuta robo" is how the declared sale unit is matched today. The phrase
    // is untouched; the split is merely also available.
    expect(one('nimeuza mafuta robo 3')).toMatchObject({
      product: 'mafuta robo', quantity: 3, spokenUnit: 'robo', productWithoutUnit: 'mafuta',
    });
  });

  it('leaves the chips vendor’s nicknames alone', () => {
    expect(items('nimeuza kavu 3 na zege 2')).toMatchObject([
      { product: 'kavu', quantity: 3 }, { product: 'zege', quantity: 2 },
    ]);
  });

  it('still reads a ream of paper as the shop writes it', () => {
    expect(one('nimeuza karatasi A4 rimu 2')).toMatchObject({
      product: 'karatasi A4 rimu', quantity: 2,
    });
  });

  // MEASURED FAILURE during this refactor: an over-eager unit-first rule read
  // "trei 3 na mayai 15" as three treys of "na mayai 15" and refused the line.
  it('still reads a bare list that happens to start with a measure', () => {
    expect(parseBareQuantityList('trei 3 na mayai 15')?.items).toMatchObject([
      { product: 'trei', quantity: 3 },
      { product: 'mayai', quantity: 15 },
    ]);
  });
});

describe('parsing is not resolution', () => {
  it('reports linguistic entities and prices nothing', () => {
    const item = one('nimeuza vifuko 4 vya mbwa');
    // No price, no canonical name, no total. Those belong to the resolver, the
    // unit engine and wa_price_sale_unit respectively.
    expect(Object.keys(item)).not.toContain('unitPrice');
    expect(Object.keys(item)).not.toContain('total');
  });
});
