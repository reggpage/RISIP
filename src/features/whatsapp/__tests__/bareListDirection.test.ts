import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { priceBandQuestion } from '../../../../supabase/functions/_shared/whatsappPriceBand';
import { quantityMeaningQuestion } from '../../../../supabase/functions/_shared/whatsappConversationMemory';

// A LIST OF NUMBERS IS NOT AN INSTRUCTION.
//
// MEASURED, on the owner's own number. He sent nine products and their counts
// with no verb anywhere:
//
//   Nguvu ya sala 9 / Puch 17 / Dasan 7 biblia 30 rosali 7 kitabu 20
//   atlas 8 kikokoto 13 chaki 60
//
// and Risip filed it as a stock count without asking. His words: "hii
// ingetakiwa iniulize kama ni mauzo, manunuzi, au unaongeza idadi kwenye stoo
// ili mtu achague."
//
// He is right, and this is the most expensive ambiguity in the product. Those
// same nine lines are three different messages — goods SOLD, goods BOUGHT, or
// a COUNT of what is on the shelf — and they move the ledger in opposite
// directions. Guessing "count" on a message that meant "sales" erases a day's
// takings and overwrites the shelf in the same stroke.
//
// The question already existed, and it was already the right question. Nothing
// ever reached it, because the model answered first and the deterministic path
// that raises it sits far below the model in the file. The fix is not a parser
// in front of the model: it is giving the model a way to say "this message
// does not say", which is a judgement about language and therefore its job.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const business = ASSISTANT_TOOLS.find((tool) => tool.name === 'propose_business_event');

describe('the model can now say it does not know', () => {
  it('has somewhere to put a missing direction', () => {
    const schema = business?.input_schema as {
      properties: { missing_fields: { items: { enum: string[] } } };
    };
    expect(schema.properties.missing_fields.items.enum).toContain('direction');
  });

  it('is told that the three readings contradict each other', () => {
    const described = (business?.input_schema as {
      properties: { missing_fields: { description: string } };
    }).properties.missing_fields.description;
    expect(described).toMatch(/DIRECTION IS THE ONE YOU MUST NOT GUESS/);
    expect(described).toMatch(/SOLD, goods BOUGHT, or a COUNT/);
    expect(described).toMatch(/opposite directions/);
  });

  it('is told which words DO settle it, so it does not ask needlessly', () => {
    const described = (business?.input_schema as {
      properties: { missing_fields: { description: string } };
    }).properties.missing_fields.description;
    for (const verb of ['nimeuza', 'nimenunua', 'nimehesabu', 'ziwe']) {
      expect(described).toContain(verb);
    }
  });
});

describe('the server asks instead of writing', () => {
  const branch = webhook.slice(
    webhook.indexOf("if ((event.missingFields.includes('direction') || directionUnstated)"),
    webhook.indexOf("if ((event.missingFields.includes('direction') || directionUnstated)") + 6000,
  );

  it('raises the question before any draft is built', () => {
    const guard = webhook.indexOf("if ((event.missingFields.includes('direction') || directionUnstated)");
    const dateStep = webhook.indexOf('const date = decideDate(', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(dateStep).toBeGreaterThan(guard);
  });

  it('fires on the server’s own check, not only on the model volunteering it', () => {
    // MEASURED: handed nine products with no verb, the model chose stock_count
    // and set no missing field. Waiting for it to admit uncertainty was the
    // flaw in the first version of this fix.
    expect(webhook).toContain('|| directionUnstated');
    expect(webhook).toContain('!messageStatesDirection(said)');
  });

  it('asks the question that already existed rather than inventing a second one', () => {
    expect(branch).toContain('quantityMeaningQuestion(lang, missingProducts, resolvedProducts)');
  });

  it('parks the answer so the reply lands on this list', () => {
    expect(branch).toContain("kind: 'quantity_meaning_clarification'");
    expect(branch).toContain("awaiting: 'product_cost'");
  });

  it('is terminal — the model must not paraphrase a question about direction', () => {
    expect(branch).toContain('terminalReply: question');
  });

  it('does not put a parser in front of the model', () => {
    // The owner's standing rule. The model makes the semantic call; the parser
    // below only normalises quantities it was already handed. The reasoning
    // sits in the comment block ABOVE the guard, not inside it.
    const guard = webhook.indexOf("if ((event.missingFields.includes('direction') || directionUnstated)");
    expect(webhook.slice(Math.max(0, guard - 1400), guard))
      .toContain('it is not deciding what the message meant');
  });
});

describe('the three choices the shopkeeper is given', () => {
  const asked = quantityMeaningQuestion('sw', []);

  it('offers the owner’s three words, numbered', () => {
    // "iwe Mauzo, Ongeza na Sajili." STOCK left the menu: an absolute shelf
    // count is a rarer and more deliberate act, and it keeps its own header
    // word rather than sitting between two everyday ones.
    expect(asked).toContain('*1* MAUZO');
    expect(asked).toContain('*2* ONGEZA');
    expect(asked).toContain('*3* SAJILI');
    expect(asked).not.toContain('MANUNUZI');
  });

  it('says what each one will DO, not just what it is called', () => {
    // "pia mtu apewe maana zake mwanzoni kabisa." A category name tells
    // somebody nothing; a consequence does.
    expect(asked).toContain('nimeuza bidhaa hizi');
    expect(asked).toContain('nimenunua, ziongezwe kwenye zilizopo');
    expect(asked).toContain('bidhaa mpya, ziwekwe kwenye orodha kwanza');
  });

  it('invites their own words as well as a number', () => {
    // "nachotaka hata mtu akijielezea kwa maswali ai iwe na uwezo wa kuelewa
    // kama chatgpt." The numbers are for whoever would rather not type.
    expect(asked).toContain('au niambie kwa maneno yako');
  });
});

describe('two prices do not stop the other products', () => {
  // "isikatishe bidhaa nyingine ifanye mahesabu then ndio isime hizi bidhaa
  // zina bei mbili" — his instruction, and it is about not wasting his work.
  const choices = [
    { index: 0, product: 'Biblia', quantity: 5, retail: 12_000, wholesale: 10_000, unit: null },
    { index: 1, product: 'Daftari', quantity: 12, retail: 1_500, wholesale: 1_200, unit: null },
  ];
  const settled = [
    { product: 'chaki', quantity: 60, unitPrice: 200, unit: null },
    { product: 'atlas', quantity: 8, unitPrice: 6_500, unit: null },
  ];
  const asked = priceBandQuestion(choices, 'sw', settled);

  it('shows what it already worked out, with the totals', () => {
    expect(asked).toContain('*Nimekwisha pima hizi:*');
    expect(asked).toContain('chaki 60 — *TSh 12,000*');
    expect(asked).toContain('atlas 8 — *TSh 52,000*');
  });

  it('puts the finished work before the question', () => {
    expect(asked.indexOf('Nimekwisha pima')).toBeLessThan(asked.indexOf('Hizi zina bei mbili'));
  });

  it('asks only about the products that genuinely need him', () => {
    expect(asked).toContain('Biblia');
    expect(asked).toContain('Daftari');
    expect(asked).not.toMatch(/\d\. \*chaki\*/);
  });

  it('teaches the shortcut so he never sees this again', () => {
    expect(asked).toContain('Ukiandika "Mauzo ya leo rejareja" juu ya orodha, sitauliza tena');
  });

  it('says nothing about finished work when there is none', () => {
    expect(priceBandQuestion(choices, 'sw', [])).not.toContain('Nimekwisha pima');
  });
});
