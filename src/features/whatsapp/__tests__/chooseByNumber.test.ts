import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseProductChoiceAnswer,
  productChoiceCancelled,
  replaceAskedProduct,
} from '../../../../supabase/functions/_shared/whatsappProductResolver';
import {
  parseNewProductPricing,
  readIncompletePriceLines,
  splitProductPriceSegments,
} from '../../../../supabase/functions/_shared/whatsappNewProduct';

// TWO THINGS HE HIT IN ONE MORNING.
//
// 1. "handbag @1000 kuuza 5000 jumla 4500 vikoi @ 10000 kuuza 18000 jumla
//    15000" — six prices, two products, on one line, because that is what
//    people do. Risip read one product literally named "handbag kuuza jumla
//    vikoi kuuza jumla" and asked him for a price he had given twice. Two
//    causes: "kuuza" was missing from the selling words (every synonym was
//    listed except the plainest one), and nothing split a line at the point
//    where it stops being about one product.
//
// 2. The numbered "which kitabu did you mean?" had no reader. The answer went
//    to the model, which had the list in the turn above and usually got it
//    right. The owner asked for the treatment the other numbered questions
//    get, and this one decides which product a sale is written against.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('the line he actually sent', () => {
  const his = 'handbag @1000 kuuza 5000 jumla 4500 vikoi @ 10000 kuuza 18000 jumla 15000';

  it('is split where it stops being about one product', () => {
    expect(splitProductPriceSegments(his)).toEqual([
      'handbag @1000 kuuza 5000 jumla 4500',
      'vikoi @ 10000 kuuza 18000 jumla 15000',
    ]);
  });

  it('registers both, with all six prices', () => {
    expect(parseNewProductPricing(his)).toEqual([
      { product: 'handbag', unitCost: 1000, retail: 5000, wholesale: 4500, wholesaleMinQty: null, unit: null },
      { product: 'vikoi', unitCost: 10000, retail: 18000, wholesale: 15000, wholesaleMinQty: null, unit: null },
    ]);
  });

  it('no longer reports a half-finished line', () => {
    expect(readIncompletePriceLines(his)).toHaveLength(0);
  });

  it('reads "kuuza" as selling, which is the plainest way to say it', () => {
    expect(parseNewProductPricing('kofia @4000 kuuza 7000')[0])
      .toMatchObject({ product: 'kofia', unitCost: 4000, retail: 7000 });
  });
});

describe('splitting does not damage the lines that already worked', () => {
  it('keeps a multi-word name whole', () => {
    expect(parseNewProductPricing('hand bag @1000 nauza 5000')[0].product).toBe('hand bag');
    expect(parseNewProductPricing('karatasi A4 rimu @4000 nauza 7000')[0].product)
      .toBe('karatasi A4 rimu');
  });

  it('still reads one product per line', () => {
    const two = parseNewProductPricing('kofia @4000 nauza 7000\nshuka @9000 nauza 15000');
    expect(two.map((p) => p.product)).toEqual(['kofia', 'shuka']);
  });

  it('catches a half line mixed in with a whole one', () => {
    const said = 'hand bag @1000 kuuza 5000 vikoi @10000';
    expect(parseNewProductPricing(said).map((p) => p.product)).toEqual(['hand bag']);
    expect(readIncompletePriceLines(said).map((l) => l.product)).toEqual(['vikoi']);
  });

  it('still says nothing about an ordinary sentence', () => {
    // NEGATIVE CONTROL: splitting must not invent products out of prose.
    expect(readIncompletePriceLines('nimeuza soda 5 na maji 3')).toHaveLength(0);
    expect(parseNewProductPricing('hizi nimezinunua leo asubuhi')).toHaveLength(0);
  });
});

describe('answering the numbered question', () => {
  const candidates = ['kitabu cha tenzi za rohoni', 'kitabu cha hesabu'];

  it('reads the number the question asked for', () => {
    expect(parseProductChoiceAnswer('1', candidates)).toBe('kitabu cha tenzi za rohoni');
    expect(parseProductChoiceAnswer('2', candidates)).toBe('kitabu cha hesabu');
    expect(parseProductChoiceAnswer('(2)', candidates)).toBe('kitabu cha hesabu');
  });

  it('reads a name too, because typing it out is just as clear', () => {
    expect(parseProductChoiceAnswer('KITABU CHA HESABU', candidates)).toBe('kitabu cha hesabu');
    expect(parseProductChoiceAnswer('hesabu', candidates)).toBe('kitabu cha hesabu');
  });

  it('refuses a number that is not on the list', () => {
    expect(parseProductChoiceAnswer('3', candidates)).toBeNull();
    expect(parseProductChoiceAnswer('0', candidates)).toBeNull();
  });

  it('refuses the ambiguous word itself, which answers nothing', () => {
    expect(parseProductChoiceAnswer('kitabu', candidates)).toBeNull();
  });

  it('refuses anything that is not an answer, so it reaches the model', () => {
    expect(parseProductChoiceAnswer('sijui', candidates)).toBeNull();
    expect(parseProductChoiceAnswer('nimeuza soda 5', candidates)).toBeNull();
    expect(parseProductChoiceAnswer('leo nimeuza shingapi', candidates)).toBeNull();
  });
});

describe('his sentence is replayed, not restarted', () => {
  it('swaps only the word that was asked about', () => {
    const said = 'Dasan 7 biblia 30 rosali 7 kitabu 20 atlas 8';
    expect(replaceAskedProduct(said, 'kitabu', 'kitabu cha tenzi za rohoni'))
      .toBe('Dasan 7 biblia 30 rosali 7 kitabu cha tenzi za rohoni 20 atlas 8');
  });

  it('keeps every other product and every quantity', () => {
    const said = 'Nguvu ya sala 9\nPuch 17\nkitabu 20';
    const out = replaceAskedProduct(said, 'kitabu', 'kitabu cha hesabu');
    expect(out).toContain('Nguvu ya sala 9');
    expect(out).toContain('Puch 17');
    expect(out).toContain('kitabu cha hesabu 20');
  });

  it('does not cut into a longer word', () => {
    expect(replaceAskedProduct('vikitabu 4', 'kitabu', 'kitabu cha hesabu')).toBe('vikitabu 4');
  });
});

describe('the branch that reads it', () => {
  const marker = '        // WHICH OF THE TWO DID HE MEAN — READ BY US, NOT GUESSED AT.';
  const branch = webhook.slice(webhook.indexOf(marker), webhook.indexOf(marker) + 2600);

  it('exists, and runs on the parked state', () => {
    expect(branch).toContain('if (productChoicePending) {');
    expect(branch).toContain('parseProductChoiceAnswer(body, productChoicePending.candidates)');
  });

  it('replays his sentence rather than asking him to retype it', () => {
    expect(branch).toContain('replaceAskedProduct(');
    expect(branch).toContain('productChoicePending.originalText');
    expect(branch).toContain('intent = routeFor(body);');
    expect(webhook).toContain('let assistantEvidenceBody = body;');
    expect(webhook).toContain('assistantEvidenceBody = replaced;');
    expect(webhook).toContain('identity, assistantEvidenceBody)');
    expect(webhook).toContain('name, input, evidenceText ?? body!');
  });

  it('lets GHAIRI out, since the question prints the word', () => {
    expect(branch).toContain('isPendingEscape(body)');
    expect(branch).toContain('productChoiceCancelled(lang)');
  });

  it('releases a message that is not an answer instead of re-asking forever', () => {
    expect(branch).toContain("'released', 'to_model'");
    expect(branch).not.toContain('await reply(phone, productReadClarification');
  });

  it('says nothing was written when he walks away', () => {
    expect(productChoiceCancelled('sw')).toContain('sijaandika chochote');
  });
});

describe('the question is parked when the sale blocks on it', () => {
  const marker = "              if (priced.choice) {";
  const park = webhook.slice(webhook.indexOf(marker), webhook.indexOf(marker) + 1200);

  it('keeps his whole message, not just the ambiguous word', () => {
    expect(park).toContain("kind: 'product_read_choice',");
    expect(park).toContain("originalText: body ?? '',");
    expect(park).toContain('candidates: priced.choice.candidates,');
  });
});
