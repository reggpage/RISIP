import { describe, expect, it } from 'vitest';
import { shopMayAlreadyStock } from '../../../../supabase/functions/_shared/whatsappKnownProduct';

// "SIJAZIONA KWENYE STOO YAKO" IS A CLAIM ABOUT HIS SHOP, AND IT WAS WRONG.
//
// MEASURED, on the owner's own number and against his own catalogue of 64
// products. He sent eleven, two of them genuinely new, and was told SEVEN were
// new. His reply: "katika bidhaa alizolist ambazo hazipo ni mbili tu sasa
// sijui kwanini ameonyesha nyingine ambazo zipo?"
//
//   Puch    -> punch                        one missing letter
//   rosali  -> Rosali ya Maria              the short name anyone actually says
//   kitabu  -> kitabu cha hesabu AND
//              Kitabu cha Tenzi za Rohoni   two registered books, not zero
//   kofia, shuka                            genuinely new
//
// The exact resolver refuses all five and is RIGHT to: it is being asked which
// single product to bill, and for three of them there is no honest answer.
// This is a different question — does the shop plausibly already stock it —
// asked only to decide what to SAY. So it gets its own, looser test.
//
// The asymmetry is the opposite of the direction gate's. A false "known" costs
// a missing offer to register. A false "new" tells a shopkeeper he does not
// sell something he has sold for months, which is the reply that made him ask.

const catalogue = [
  'anton wa padua', 'atlasi', 'bahasha', 'Bibilia ndogo', 'Biblia', 'Bilia kubwa',
  'Birika', 'birka', 'chaki', 'daftari', 'daftari kubwa', 'daftari la graph', 'Dasan',
  'Dumu la maji', 'gundi', 'kalamu', 'kalamu za rangi', 'karatasi a4', 'kikokotoo',
  'Kikombe', 'kitabu cha hesabu', 'Kitabu cha Tenzi za Rohoni', 'Maji hill',
  'nguvu ya sala', 'Padre Pio', 'punch', 'Rosali ya Maria', 'Sabuni', 'Sodaa',
  'st rita wa kashia', 'Velvet napkin', 'Vestline',
];

describe('the eleven products he actually sent', () => {
  const known = ['Nguvu ya sala', 'Puch', 'Dasan', 'biblia', 'rosali', 'kitabu', 'atlas', 'kikokoto', 'chaki'];
  const fresh = ['kofia', 'shuka'];

  for (const name of known) {
    it(`recognises "${name}"`, () => {
      expect(shopMayAlreadyStock(name, catalogue)).toBe(true);
    });
  }

  for (const name of fresh) {
    it(`still calls "${name}" new, because it is`, () => {
      expect(shopMayAlreadyStock(name, catalogue)).toBe(false);
    });
  }

  it('gets the split he expected: nine known, two new', () => {
    const split = [...known, ...fresh].filter((name) => shopMayAlreadyStock(name, catalogue));
    expect(split).toHaveLength(9);
  });
});

describe('the three ways a name gets in', () => {
  it('the same name, however it is capitalised', () => {
    expect(shopMayAlreadyStock('BIBLIA', catalogue)).toBe(true);
    expect(shopMayAlreadyStock('  chaki ', catalogue)).toBe(true);
  });

  it('one keystroke away', () => {
    expect(shopMayAlreadyStock('Puch', catalogue)).toBe(true);   // punch
    expect(shopMayAlreadyStock('altasi', catalogue)).toBe(true); // atlasi
    expect(shopMayAlreadyStock('gunid', catalogue)).toBe(true);  // gundi
  });

  it('the opening words of a longer registered name', () => {
    // Nobody standing at a counter says "Rosali ya Maria".
    expect(shopMayAlreadyStock('rosali', catalogue)).toBe(true);
    expect(shopMayAlreadyStock('kitabu', catalogue)).toBe(true);
    expect(shopMayAlreadyStock('daftari la', catalogue)).toBe(true);
  });
});

describe('what must NOT slip through', () => {
  it('does not match on the tail of a registered name', () => {
    // "sala" is the end of "nguvu ya sala" and a different thing entirely. A
    // shop asking about it means something else, and matching would hide a
    // genuinely new product.
    for (const tail of ['sala', 'maria', 'kubwa', 'rangi', 'padua', 'graph', 'napkin']) {
      expect(shopMayAlreadyStock(tail, catalogue)).toBe(false);
    }
  });

  it('does not let a short word ride one edit into something else', () => {
    // Two- and three-letter words are almost all one edit from each other.
    expect(shopMayAlreadyStock('aji', catalogue)).toBe(false);
    expect(shopMayAlreadyStock('ki', catalogue)).toBe(false);
  });

  it('says no to an empty or blank name', () => {
    expect(shopMayAlreadyStock('', catalogue)).toBe(false);
    expect(shopMayAlreadyStock('   ', catalogue)).toBe(false);
  });

  it('says no when the shop has registered nothing at all', () => {
    expect(shopMayAlreadyStock('chaki', [])).toBe(false);
  });

  it('never treats a longer phrase as a shorter registered name', () => {
    // The opening-words rule runs one way only: asking about "daftari kubwa la
    // graph" must not be answered by "daftari".
    expect(shopMayAlreadyStock('chaki ya rangi ya bluu', ['chaki'])).toBe(false);
  });
});
