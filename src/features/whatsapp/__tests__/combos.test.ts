import { describe, expect, it } from 'vitest';
import {
  type ComboCandidate,
  type ComboSplit,
  applyOrderQuantity,
  comboNotice,
  comboQuestion,
  comboQuestions,
  comboSaveOffer,
  comboTotal,
  parseComboAnswer,
  parseComboVariant,
  splitCombo,
} from '../../../../supabase/functions/_shared/whatsappCombos';

// A kijiwe as it actually registers itself.
const KIJIWE: ComboCandidate[] = [
  { key: 'chips kavu', name: 'Chips kavu' },
  { key: 'yai', name: 'Yai' },
  { key: 'soseji', name: 'Soseji' },
  { key: 'mishikaki', name: 'Mishikaki' },
  { key: 'kuku', name: 'Kuku', units: ['robo', 'nusu', 'kilo'] },
  { key: 'soda', name: 'Soda' },
];

const split = (phrase: string, catalogue = KIJIWE, saved = []) =>
  splitCombo(phrase, catalogue, saved) as ComboSplit | null;

describe('reading an order the way it is shouted at the counter', () => {
  it('reads two products written as one phrase', () => {
    // "chips yai" vs "chips kavu" is 0.40 similar, and the resolver floor is
    // 0.45 — so this was answered "not in your store" while both goods were.
    const reading = split('chips yai');
    expect(reading?.pieces.map((piece) => piece.key)).toEqual(['chips kavu', 'yai']);
    expect(reading?.source).toBe('split');
  });

  it('reads them glued together with no space at all', () => {
    // similarity('chipssosej','soseji') = 0.20. No amount of fuzzy matching
    // reaches this; the word has to be cut.
    expect(split('chipssosej')?.pieces.map((piece) => piece.key)).toEqual(['chips kavu', 'soseji']);
  });

  it('reads three, with the joining word and a count', () => {
    const reading = split('chips kuku na mishikaki 3');
    expect(reading?.pieces.map((piece) => piece.key)).toEqual(['chips kavu', 'kuku', 'mishikaki']);
    expect(reading?.pieces[2].quantity).toBe(3);
  });

  it('keeps the count with the piece it follows, not with the order', () => {
    const reading = split('chips yai 2 soseji');
    expect(reading?.pieces.find((piece) => piece.key === 'yai')?.quantity).toBe(2);
    expect(reading?.pieces.find((piece) => piece.key === 'soseji')?.quantity).toBe(1);
  });

  it('takes a nickname it was taught, without cutting anything', () => {
    // "zege" is 0.00 similar to "chips mayai". A nickname is not a spelling of
    // anything — it can only ever be learned.
    const saved = [{ name: 'zege', pieces: [
      { key: 'chips kavu', name: 'Chips kavu', quantity: 1, unit: null },
      { key: 'yai', name: 'Yai', quantity: 1, unit: null },
    ] }];
    const reading = splitCombo('zege', KIJIWE, saved) as ComboSplit;
    expect(reading.source).toBe('saved');
    expect(reading.pieces.map((piece) => piece.key)).toEqual(['chips kavu', 'yai']);
  });
});

describe('what it refuses to read', () => {
  it('leaves a single registered product to the ordinary path', () => {
    expect(split('chips kavu')).toBeNull();
    expect(split('soda')).toBeNull();
  });

  it('refuses a phrase holding a word the shop does not sell', () => {
    // Half understood is not understood. Pricing the half we recognised would
    // book a sale that never happened.
    expect(split('chips wali')).toBeNull();
    expect(split('pilau kuku')).toBeNull();
  });

  it('never invents a product from a catalogue that has none', () => {
    expect(splitCombo('chips yai', [])).toBeNull();
  });

  it('asks rather than choosing between two products with the same first word', () => {
    const twoChips: ComboCandidate[] = [
      { key: 'chips kavu', name: 'Chips kavu' },
      { key: 'chips mayai', name: 'Chips mayai' },
      { key: 'soseji', name: 'Soseji' },
    ];
    expect(splitCombo('chips soseji', twoChips)).toEqual({
      kind: 'ambiguous', token: 'chips', candidates: ['Chips kavu', 'Chips mayai'],
    });
  });
});

describe('asking, once, about what the words did not say', () => {
  it('spots a measure nobody named', () => {
    // robo and kilo are 3,000 and 10,000 for the same word "kuku".
    const reading = split('chips kuku')!;
    const open = comboQuestions(reading);
    expect(open.map((piece) => piece.key)).toContain('kuku');
    expect(reading.pieces.find((piece) => piece.key === 'kuku')?.unitMissing).toBe(true);
  });

  it('spots a count nobody named', () => {
    const reading = split('chipssosej')!;
    expect(comboQuestions(reading).map((piece) => piece.key)).toContain('soseji');
  });

  it('does not ask about a measure the product does not have', () => {
    const reading = split('chips yai')!;
    expect(reading.pieces.every((piece) => !piece.unitMissing)).toBe(true);
  });

  it('asks one question for the whole order', () => {
    const reading = split('chips kuku na mishikaki')!;
    const asked = comboQuestion(reading, 2, new Map([['kuku', ['robo', 'nusu', 'kilo']]]), 'sw');
    expect(asked).toContain('chips kuku na mishikaki');
    expect(asked).toContain('Kuku');
    expect(asked).toContain('robo / nusu / kilo');
    expect((asked.match(/\?/g) ?? []).length).toBeLessThanOrEqual(2);
  });
});

describe('reading the answer', () => {
  const units = new Map([['kuku', ['robo', 'nusu', 'kilo']]]);

  it('takes a bare word when only one thing was asked', () => {
    const open = comboQuestions(split('chips kuku')!);
    expect(parseComboAnswer('nusu', open, units)).toEqual([{ unit: 'nusu' }]);
  });

  it('takes the piece by name', () => {
    const open = comboQuestions(split('chips kuku na mishikaki')!);
    const answered = parseComboAnswer('kuku nusu, mishikaki 3', open, units)!;
    expect(answered[open.findIndex((piece) => piece.key === 'kuku')]).toEqual({ unit: 'nusu' });
    expect(answered[open.findIndex((piece) => piece.key === 'mishikaki')]).toEqual({ quantity: 3 });
  });

  it('takes the row numbers the question printed', () => {
    const open = comboQuestions(split('chips kuku na mishikaki')!);
    expect(parseComboAnswer('1 nusu 2 3', open, units)).toEqual([{ unit: 'nusu' }, { quantity: 3 }]);
  });

  it('is not an answer when it says nothing about either', () => {
    const open = comboQuestions(split('chips kuku')!);
    expect(parseComboAnswer('sijui', open, units)).toBeNull();
    expect(parseComboAnswer('', open, units)).toBeNull();
  });
});

describe('showing the arithmetic before saving it', () => {
  const reading = split('chips yai')!;

  it('adds the pieces, and refuses when one has no price', () => {
    const prices = new Map([['chips kavu', 2000], ['yai', 500]]);
    expect(comboTotal(reading, (piece) => prices.get(piece.key) ?? null)).toBe(2500);
    expect(comboTotal(reading, (piece) => (piece.key === 'yai' ? null : 2000))).toBeNull();
  });

  it('multiplies a piece that appears more than once per order', () => {
    const two = split('chips yai 2')!;
    const prices = new Map([['chips kavu', 2000], ['yai', 500]]);
    expect(comboTotal(two, (piece) => prices.get(piece.key) ?? null)).toBe(3000);
  });

  it('shows the reading in the confirmation, in their own words', () => {
    const shown = comboNotice([reading], 'sw');
    expect(shown).toContain('chips yai');
    expect(shown).toContain('Chips kavu + Yai');
  });

  it('offers to remember it, so the question is asked exactly once', () => {
    expect(comboSaveOffer(reading, 'sw')).toContain('Nihifadhi');
    expect(comboSaveOffer(reading, 'sw')).toContain('sitakuuliza tena');
  });
});

describe('the answer cannot land on the wrong piece', () => {
  const units = new Map([['kuku', ['robo', 'nusu', 'kilo']]]);

  it('does not let a count overwrite a measure', () => {
    // MEASURED: "kuku nusu, mishikaki 3" arrived as one run of words, the 3
    // landed on kuku, and the chicken silently became three chickens.
    const open = comboQuestions(split('chips kuku na mishikaki')!);
    const answered = parseComboAnswer('kuku nusu, mishikaki 3', open, units)!;
    expect(answered[0]).toEqual({ unit: 'nusu' });
    expect(answered[1]).toEqual({ quantity: 3 });
  });

  it('ignores a number offered for a measure question', () => {
    const open = comboQuestions(split('chips kuku')!);
    expect(parseComboAnswer('3', open, units)).toBeNull();
  });

  it('ignores a measure offered for a count question', () => {
    const open = comboQuestions(split('chips yai')!);
    expect(parseComboAnswer('nusu', open, units)).toBeNull();
  });
});

describe('what the number at the end is counting', () => {
  // The owner: "kikawaida wakisema chips yai mbili wanamaanisha chips 2000, yai
  // zinachanganywa mbili kwenye kavu moja jumla 1000, kwa hiyo inakuwa 3000.
  // Sasa wakisema zege mbili wanamaanisha 6000."
  const prices = new Map([['chips kavu', 2000], ['yai', 500]]);
  const priceOf = (piece: { key: string }) => prices.get(piece.key) ?? null;

  it('counts the last thing named, not the orders, on a fresh reading', () => {
    const read = split('chips yai')!;
    const { orders, split: counted } = applyOrderQuantity(read, 2);
    expect(orders).toBe(1);
    expect(counted.pieces.find((piece) => piece.key === 'yai')?.quantity).toBe(2);
    expect(counted.pieces.find((piece) => piece.key === 'chips kavu')?.quantity).toBe(1);
    // 2,000 for the chips + two eggs at 500 = 3,000. Not 5,000.
    expect(comboTotal(counted, priceOf)).toBe(3000);
  });

  it('counts orders once the name has been saved', () => {
    const saved = [{ name: 'zege', pieces: [
      { key: 'chips kavu', name: 'Chips kavu', quantity: 1, unit: null },
      { key: 'yai', name: 'Yai', quantity: 2, unit: null },
    ] }];
    const read = splitCombo('zege', KIJIWE, saved) as ComboSplit;
    const { orders, split: counted } = applyOrderQuantity(read, 2);
    expect(orders).toBe(2);
    // Two zege at 3,000 each.
    expect(comboTotal(counted, priceOf)! * orders).toBe(6000);
  });

  it('stops asking how many, once the number has said so', () => {
    const { split: counted } = applyOrderQuantity(split('chips yai')!, 2);
    expect(comboQuestions(counted).map((piece) => piece.key)).not.toContain('yai');
  });
});

describe('one product registered in several kinds', () => {
  const withKinds: ComboCandidate[] = [
    { key: 'chips kavu', name: 'Chips kavu' },
    { key: 'yai', name: 'Yai' },
    { key: 'mishikaki wa ngombe', name: 'Mishikaki wa ngombe' },
    { key: 'mishikaki wa kuku', name: 'Mishikaki wa kuku' },
  ];

  it('asks which kind, naming the ones the shop actually registered', () => {
    // The owner: "inauliza wa kuku au ngombe pale tu kama zilisajiliwa".
    const reading = splitCombo('chips yai na mishikaki', withKinds);
    expect(reading).toEqual({
      kind: 'ambiguous',
      token: 'mishikaki',
      candidates: ['Mishikaki wa ngombe', 'Mishikaki wa kuku'],
    });
  });

  it('does not ask when the whole name is already there', () => {
    // The joining word "wa" belongs to the name. Dropping it read this as
    // mishikaki plus kuku — two products, and one of them the wrong price.
    const reading = splitCombo('chips yai na mishikaki wa kuku', withKinds) as ComboSplit;
    expect(reading.pieces.map((piece) => piece.key))
      .toEqual(['chips kavu', 'yai', 'mishikaki wa kuku']);
  });

  it('does not ask a shop that registered only one kind', () => {
    const oneKind: ComboCandidate[] = [
      { key: 'chips kavu', name: 'Chips kavu' },
      { key: 'mishikaki', name: 'Mishikaki' },
    ];
    const reading = splitCombo('chips mishikaki', oneKind) as ComboSplit;
    expect(reading.pieces.map((piece) => piece.key)).toEqual(['chips kavu', 'mishikaki']);
  });

  it('reads the answer by name, by the distinguishing words, or by number', () => {
    const kinds = ['Mishikaki wa ngombe', 'Mishikaki wa kuku'];
    expect(parseComboVariant('wa kuku', kinds)).toBe('Mishikaki wa kuku');
    expect(parseComboVariant('Mishikaki wa ngombe', kinds)).toBe('Mishikaki wa ngombe');
    expect(parseComboVariant('2', kinds)).toBe('Mishikaki wa kuku');
    expect(parseComboVariant('sijui', kinds)).toBeNull();
    // "mishikaki" alone still names both, so it is still not an answer.
    expect(parseComboVariant('mishikaki', kinds)).toBeNull();
  });
});
