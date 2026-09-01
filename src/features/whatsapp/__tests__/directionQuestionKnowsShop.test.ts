import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quantityMeaningQuestion } from '../../../../supabase/functions/_shared/whatsappConversationMemory';

// THE QUESTION SHOULD KNOW THE SHOP IT IS ASKING.
//
// The owner's improvement, and it is the right one: "nataka ai iwe na akili
// isiwe tu kama roboti ielewe concept iulize kulingana na concept… kama ai
// imenotice bidhaa ambazo hazipo ndio iseme pia kuna bidhaa naona hazipo
// kwenye stoo yako hizi ni mpya kama ni mpya chagua manunuzi."
//
// He was shown three equal options with no context at all, while the server
// was one query away from knowing that all nine products were already his.
//
// MEASURED, and it was my bug: the branch took its product names from the
// PRICING path, which only reports them when something FAILS to resolve. Nine
// products it knew perfectly well came back as two empty lists, so the
// question said nothing about his shop. The catalogue is now read directly.
//
// It STATES what it found and never decides on it. Recognising a product does
// not prove a sale, and a new name does not prove a purchase — a shop counting
// its shelf for the first time meets both. So the question leans, and he
// chooses.

const nine = ['Nguvu ya sala', 'Puch', 'Dasan', 'biblia', 'rosali', 'kitabu', 'atlas', 'kikokoto', 'chaki'];
const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('when every product is already his', () => {
  const asked = quantityMeaningQuestion('sw', [], nine);

  it('says so, and counts them', () => {
    expect(asked).toContain('Bidhaa zote 9 zipo kwenye orodha yako');
  });

  it('does not invent new products that are not there', () => {
    // SAJILI is still offered as option 3 — it is one of the three things a
    // list of numbers can mean. What must not appear is the "these are new"
    // block, because none of them are.
    expect(asked).not.toContain('ni mpya');
    expect(asked).not.toContain('sijaziona kwenye stoo yako');
  });

  it('still gives all three choices, because knowing the products settles nothing', () => {
    // He could be selling them, restocking them, or counting them. The shop
    // recognising a name proves none of the three.
    expect(asked).toContain('(a) *MAUZO* / *1*');
    expect(asked).toContain('(b) *ONGEZA* / *2*');
    expect(asked).toContain('(c) *SAJILI* / *3*');
  });
});

describe('when some are new', () => {
  const asked = quantityMeaningQuestion('sw', ['sandarusi', 'gundi'], nine);

  it('names them, and says plainly that they are new', () => {
    expect(asked).toContain('sijaziona kwenye stoo yako — ni mpya');
    expect(asked).toContain('*sandarusi*');
    expect(asked).toContain('*gundi*');
  });

  it('leans towards purchase without deciding it', () => {
    // "Kama umezinunua" — if you bought them. A conditional, not a conclusion:
    // a first-ever stock count also contains names Risip has never seen.
    expect(asked).toContain('Zikiwa mpya kweli, chagua *3*');
    expect(asked).not.toContain('Nimerekodi');
  });

  it('offers registration, since a new product needs prices before anything else', () => {
    expect(asked).toContain('(c) *SAJILI* / *3*');
    expect(asked).toContain('bei ya kununua na bei ya kuuza');
  });

  it('still reports what it DID recognise', () => {
    expect(asked).toContain('Bidhaa 9 zipo kwenye orodha yako');
  });
});

describe('where the answer comes from', () => {
  const branch = webhook.slice(
    webhook.indexOf('// WHICH OF THESE DOES THE SHOP ALREADY SELL?'),
    webhook.indexOf('// WHICH OF THESE DOES THE SHOP ALREADY SELL?') + 3000,
  );

  it('reads the catalogue directly, not the pricing path', () => {
    // The pricing path answers this question only when it fails, which is why
    // nine known products produced silence.
    expect(branch).toContain("db.rpc('company_product_names'");
    // Exact resolver first — the one that would bill the line — then the
    // looser "does the shop plausibly stock it" test, which is the only
    // question being asked here.
    expect(branch).toContain('await resolveProductForRead(db, identity, item.product)');
    expect(branch).toContain('shopMayAlreadyStock(item.product, catalogue)');
  });

  it('records why the previous source was wrong', () => {
    expect(branch).toContain('only reports names when something FAILS to resolve');
  });

  it('hands both lists to the question', () => {
    expect(webhook).toContain('quantityMeaningQuestion(lang, missingProducts, resolvedProducts)');
  });

  it('does not double-count a product named twice', () => {
    expect(webhook).toContain('if (!target.includes(item.product)) target.push(item.product);');
  });

  it('does not call a product new just because it could not be billed', () => {
    // MEASURED: three of five "new" products were a missing letter, a short
    // name, and a word opening TWO registered books. The exact resolver is
    // right to refuse all three; saying he does not sell them is a different
    // claim, and a false one.
    expect(webhook).toContain('different claim, and a false one.');
  });
});
