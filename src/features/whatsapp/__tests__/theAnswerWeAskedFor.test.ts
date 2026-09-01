import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePriceBandAnswer, priceBandCancelled, priceBandQuestion } from '../../../../supabase/functions/_shared/whatsappPriceBand';
import { productReadClarification } from '../../../../supabase/functions/_shared/whatsappProductResolver';
import { quantityMeaningQuestion } from '../../../../supabase/functions/_shared/whatsappConversationMemory';
import { newProductSaved } from '../../../../supabase/functions/_shared/whatsappNewProduct';

// THE ANSWER WE ASKED FOR WAS THROWN AWAY.
//
// MEASURED, on the owner's own number, at 23:04. Risip showed him ten
// two-price products and taught the shape: "Kama zimechanganyika, andika
// namba: 1 rejareja, 2 jumla". He answered in exactly that shape, for all ten
// rows. Risip replied "Samahani, sijaelewa ujumbe wako."
//
// parsePriceBandAnswer reads that message perfectly — proved below. It was
// never called. releasesParkedQuestion ("is this a new subject?") was asked
// FIRST, and it releases on everything that is not a yes, a no or a cancel,
// so the parked sale was dropped and the message handed to a model that had
// never seen the ten rows.
//
// THE RULE, and it is the same one that cost him kofia and shuka: a message
// in the exact shape Risip printed a moment earlier is an ANSWER. Read it
// before deciding it is a new subject.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

const rows = ['nguvu ya sala', 'punch', 'Biblia', 'rosali ya maria', 'kitabu cha tenzi za rohoni',
  'atlasi', 'kikokotoo', 'chaki', 'ball', 'saa']
  .map((product, index) => ({ index, product, quantity: 9, retail: 10600, wholesale: 9500 }));

describe('the ten-row answer he actually sent', () => {
  const said = '1 jumla 2 rejareja 3 jumla 4 rejareja 5 jumla 6 rejareja 7 rejareja 8 jumla 9 jumla 10 jumla';

  it('is read, and every row lands where he put it', () => {
    expect(parsePriceBandAnswer(said, rows)).toEqual([
      'wholesale', 'retail', 'wholesale', 'retail', 'wholesale',
      'retail', 'retail', 'wholesale', 'wholesale', 'wholesale',
    ]);
  });

  it('is read with commas too, which is how the question writes it', () => {
    expect(parsePriceBandAnswer('1 rejareja, 2 jumla', rows.slice(0, 2)))
      .toEqual(['retail', 'wholesale']);
  });
});

describe('the ordering that dropped it', () => {
  const branch = webhook.slice(
    webhook.indexOf('        // OUR OWN FORM IS AN ANSWER, NOT A NEW SUBJECT.'),
    webhook.indexOf('        // OUR OWN FORM IS AN ANSWER, NOT A NEW SUBJECT.') + 1600,
  );

  it('reads the answer before asking whether the subject changed', () => {
    expect(branch).toContain('const bandHeard = bandPending ? parsePriceBandAnswer(body, bandPending.choices) : null;');
  });

  it('only releases a message that is NOT an answer', () => {
    expect(branch).toContain('bandPending && !bandHeard && releasesParkedQuestion');
  });

  it('records what it cost, so the order is not swapped back', () => {
    expect(branch).toContain('said it did not understand');
  });
});

describe('coming back to his products', () => {
  const bubble = `${newProductSaved(
    [{ product: 'ball', unitCost: 4000, retail: 7000, wholesale: null, wholesaleMinQty: null, unit: null }],
    'sw', 'question')}\n\n${quantityMeaningQuestion('sw', [], new Array(11).fill('x'), true)}`;

  it('says it once, in his own words', () => {
    expect(bubble).toContain('Sasa turudi kwenye bidhaa ulizonitumia awali — unataka tuzifanye nini?');
  });

  it('does not re-announce what he was just told', () => {
    expect(bubble).not.toContain('zipo kwenye orodha yako');
    expect(bubble).not.toContain('Nimepata idadi za bidhaa ulizotaja');
  });

  it('does not say the same sentence twice in one bubble', () => {
    expect(bubble.split('turudi kwenye bidhaa').length - 1).toBe(1);
  });

  it('still offers all three, bold, with the way out', () => {
    for (const word of ['*1* *MAUZO*', '*2* *ONGEZA*', '*3* *SAJILI*', '*GHAIRI*']) {
      expect(bubble).toContain(word);
    }
  });

  it('leaves the ordinary question exactly as it was', () => {
    // NEGATIVE CONTROL on the flag: not resuming, nothing changes.
    const plain = quantityMeaningQuestion('sw', [], new Array(11).fill('x'));
    expect(plain).toContain('Bidhaa zote 11 zipo kwenye orodha yako');
    expect(plain).toContain('Nimepata idadi za bidhaa ulizotaja');
  });
});

describe('two products whose names start the same', () => {
  const asked = productReadClarification({
    kind: 'ambiguous',
    asked: 'kitabu',
    candidates: ['kitabu cha tenzi za rohoni', 'kitabu cha hesabu'].map((productName) => ({
      productKey: productName, productName, matchKind: 'trigram' as const, matchScore: 0.98,
    })),
  }, 'sw');

  it('says where they came from and why it is asking', () => {
    expect(asked).toContain('Kwenye stoo yako kuna bidhaa 2 zinazoanza na jina au kufanana na jina “kitabu”');
  });

  it('numbers them, so nobody retypes a five-word name', () => {
    expect(asked).toContain('*1.* kitabu cha tenzi za rohoni');
    expect(asked).toContain('*2.* kitabu cha hesabu');
    expect(asked).not.toContain(' au kitabu cha hesabu');
  });

  it('asks in his words, and says how to answer', () => {
    expect(asked).toContain('Ulikuwa unamaanisha bidhaa gani kati ya hizi? Jibu kwa namba.');
    expect(asked).toContain('*GHAIRI*');
  });
});

describe('the way out of ever being asked about two prices', () => {
  const asked = priceBandQuestion(rows.slice(0, 3), 'sw');

  it('is taught in the shape he types, beside the product', () => {
    expect(asked).toContain('Ukiandika neno rejareja au jumla mbele ya bidhaa');
    expect(asked).toContain('daftari 4 jumla, penseli 3 rejareja');
  });

  it('no longer teaches a heading nobody writes', () => {
    expect(asked).not.toContain('Mauzo ya leo rejareja');
  });

  it('is marked as the tip it is', () => {
    expect(asked).toContain('💡');
  });
});

describe('GHAIRI, on the question that prints the word', () => {
  const branch = webhook.slice(
    webhook.indexOf('        if (bandPending && isPendingEscape(body)) {'),
    webhook.indexOf('        if (bandPending && isPendingEscape(body)) {') + 900,
  );

  it('exists at all', () => {
    // MEASURED by reading the branch: isCancel makes releasesParkedQuestion
    // return false, and the answer parser finds no band word in "ghairi", so
    // the branch re-sent the very question he was trying to leave.
    expect(branch).toContain('await clearConversation(db, identity.id as string);');
    expect(branch).toContain('priceBandCancelled(lang)');
  });

  it('is decided before the answer is read', () => {
    const escape = webhook.indexOf('if (bandPending && isPendingEscape(body)) {');
    const parse = webhook.indexOf('const bandHeard = bandPending ? parsePriceBandAnswer(');
    expect(escape).toBeGreaterThan(-1);
    expect(escape).toBeLessThan(parse);
  });

  it('says nothing was written down', () => {
    expect(priceBandCancelled('sw')).toContain('sijaandika mauzo hayo');
  });
});
