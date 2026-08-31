import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  incompletePriceReply,
  newProductOffer,
  newProductSaved,
  parseNewProductPricing,
  readIncompletePriceLines,
} from '../../../../supabase/functions/_shared/whatsappNewProduct';
import {
  quantityMeaningQuestion,
  stockPurchaseNeedsPrices,
} from '../../../../supabase/functions/_shared/whatsappConversationMemory';

// HALF A PRICE LIST IS STILL A PRICE LIST.
//
// The owner asked for it in one line: "bidhaa mpya ikiingia bila bei za kununua
// na kuuza ai inotice mapema na kumsaidia mtu."
//
// Registering a product needs two numbers. parseNewProductLine returns null
// without both — so "kofia @4000", a person who simply has not typed the second
// number yet, read as NOTHING, fell past every deterministic branch and landed
// on the model. That is the exact route that once showed him a confirmation for
// kofia and wrote a cost for shuka. Half a form is still our form.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('a registration line that is trying and missing one half', () => {
  it('catches a buying price with no selling price', () => {
    const [line] = readIncompletePriceLines('kofia @4000');
    expect(line).toMatchObject({ product: 'kofia', hasCost: true, hasRetail: false });
  });

  it('catches a selling price with no buying price', () => {
    const [line] = readIncompletePriceLines('kofia nauza 7000');
    expect(line).toMatchObject({ product: 'kofia', hasCost: false, hasRetail: true });
  });

  it('reads every line, not only the first', () => {
    const lines = readIncompletePriceLines('kofia @4000\nshuka nauza 15000');
    expect(lines.map((l) => l.product)).toEqual(['kofia', 'shuka']);
  });

  it('stays silent on a line that is already complete', () => {
    expect(parseNewProductPricing('kofia @4000 nauza 7000')).toHaveLength(1);
    expect(readIncompletePriceLines('kofia @4000 nauza 7000')).toHaveLength(0);
  });

  it('stays silent on a line that is not a registration at all', () => {
    // NEGATIVE CONTROL. An ordinary sale carries a number and no price marker;
    // dragging it into a registration would be worse than the bug.
    expect(readIncompletePriceLines('nimeuza soda 5')).toHaveLength(0);
    expect(readIncompletePriceLines('leo nimeuza shingapi')).toHaveLength(0);
    expect(readIncompletePriceLines('hizi nimezinunua leo asubuhi')).toHaveLength(0);
  });

  it('names the half that is missing, per product', () => {
    const said = incompletePriceReply(
      readIncompletePriceLines('kofia @4000\nshuka nauza 15000'), 'sw');
    expect(said).toContain('*kofia* — imebaki bei ya kuuza');
    expect(said).toContain('*shuka* — imebaki bei ya kununua');
  });

  it('shows the shape, and the way out', () => {
    const said = incompletePriceReply(readIncompletePriceLines('kofia @4000'), 'sw');
    expect(said).toContain('@4000 nauza 7000');
    expect(said).toContain('*GHAIRI*');
  });
});

describe('the webhook answers it instead of the model', () => {
  const gate = webhook.slice(
    webhook.indexOf('// HALF A PRICE LIST IS STILL A PRICE LIST.'),
    webhook.indexOf('// HALF A PRICE LIST IS STILL A PRICE LIST.') + 1600,
  );

  it('only looks while a registration is actually pending', () => {
    expect(gate).toContain('registrationPending && !answeringWithPrices');
  });

  it('replies and ends the turn, so nothing reaches Claude', () => {
    expect(gate).toContain('incompletePriceReply(incompletePrices, lang)');
    expect(gate).toContain("await finish('skipped');");
  });

  it('records why, so nobody deletes it as noise', () => {
    expect(gate).toContain('kofia and wrote shuka');
  });
});

describe('the words he asked to be changed', () => {
  it('does not tell him products are "waiting"', () => {
    const offer = newProductOffer(['kofia'], 'sw', 9);
    expect(offer).toContain('zipo tayari kwenye stoo yako');
    expect(offer).not.toContain('nimezipata na zinasubiri');
  });

  it('does not ask again whether he wanted them', () => {
    // He already said so. Asking twice is the form asking twice.
    const offer = newProductOffer(['kofia', 'shuka'], 'sw', 0);
    expect(offer).toContain('Nitumie bei zake');
    expect(offer).not.toContain('Ulitaka');
  });

  it('teaches the short shape he actually types, not the laboured one', () => {
    const offer = newProductOffer(['kofia'], 'sw', 0);
    expect(offer).toContain('@<bei uliyonunua> nauza <bei unayouza>');
  });

  it('comes back to his products rather than telling him to "review"', () => {
    const saved = newProductSaved(
      [{ product: 'kofia', unitCost: 4000, retail: 7000, wholesale: null, wholesaleMinQty: null, unit: null }],
      'sw', true);
    expect(saved).toContain('turudi kwenye bidhaa ulizonitumia awali');
    expect(saved).not.toContain('kagua');
  });

  it('keeps the three words bold every single time', () => {
    // "Mauzo, Ongeza na Sajili inatakiwa ziwe bold always."
    for (const known of [[], ['soda'], new Array(12).fill('x')]) {
      const asked = quantityMeaningQuestion('sw', [], known);
      expect(asked).toContain('*1* *MAUZO*');
      expect(asked).toContain('*2* *ONGEZA*');
      expect(asked).toContain('*3* *SAJILI*');
    }
  });
});

describe('GHAIRI is offered wherever the answer would write something', () => {
  const ways = {
    'the direction question': quantityMeaningQuestion('sw', [], ['soda']),
    'the registration offer': newProductOffer(['kofia'], 'sw', 0),
    'the purchase price list': stockPurchaseNeedsPrices({
      kind: 'quantity_meaning_clarification',
      sourceMessageId: 'x',
      originalText: 'soda 5',
      sale: { items: [{ product: 'soda', quantity: 5 }] },
    } as never, 'sw'),
  };
  for (const [name, text] of Object.entries(ways)) {
    it(`on ${name}`, () => {
      expect(text).toContain('*GHAIRI*');
    });
  }
});
