import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answersPendingQuestion, messageGoesToModel } from '../../../../supabase/functions/_shared/whatsappRouting';
import {
  ALLOWED_VALUES,
  CLARIFICATION_FIELDS,
  asBand,
  checkCanonicalValue,
  checkNumber,
  describePending,
  validateClarificationAnswers,
} from '../../../../supabase/functions/_shared/whatsappClarification';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';

// CODE DOES NOT READ WHAT A PERSON MEANT — BEFORE OR AFTER THE MODEL.
//
// The first repair moved three parsers from in front of the model to behind it,
// and that was not enough. This module briefly held canonicalBand() and
// canonicalEventType(), which read "reja" and "mauzo" out of the trader's own
// words to decide what they meant:
//
//   /\b(jumla|jumlla|wholesale|bulk)\b/
//   /\b(rejareja|rejarej|reja\s*reja|reja|retail)\b/
//   /\b(mauzo|nimeuza|sale|sales|sold)\b/
//
// Same job, later in the pipeline. A word list does not stop being a word list
// because it runs second. The model returns the MEANING now, and what is left
// here is a membership test against the answers the parked question allows —
// which no wording, in any language or spelling, can change.

const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const routing = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/whatsappRouting.ts'), 'utf8');
const clarification = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/whatsappClarification.ts'), 'utf8');

/** Executable lines only: the comments quote the removed parsers on purpose. */
const code = (source: string) => source
  .split(/\r?\n/)
  .filter((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
  })
  .join('\n');

describe('no code reads the trader’s wording, at any point', () => {
  it('has no word list left in the clarification path', () => {
    const executable = code(clarification);
    for (const gone of ['BAND_WORDS', 'EVENT_WORDS', 'canonicalBand(wording', 'canonicalEventType(wording']) {
      expect(executable, `${gone} still reads wording`).not.toContain(gone);
    }
    // The regexes themselves, not just their names.
    expect(executable).not.toMatch(/jumla\|/);
    expect(executable).not.toMatch(/rejareja\|/);
    expect(executable).not.toMatch(/mauzo\|/);
  });

  it('keeps no clarification parser in front of the model either', () => {
    const gate = code(routing.slice(
      routing.indexOf('export function answersPendingQuestion'),
      routing.indexOf('export function messageGoesToModel'),
    ));
    for (const parser of [
      'parseQuantityAnswer', 'parsePriceBandAnswer', 'parseQuantityMeaningAnswer', 'parsePaymentMethodAnswer',
    ]) {
      expect(gate, `${parser} still reads human language before the model`).not.toContain(parser);
    }
    expect(gate).toContain('isDailyRecordConfirmation(text) || isDailyRecordRejection(text)');
  });

  it('runs the payment phrase list only when the model was never consulted', () => {
    // MEASURED: "mpesa" beside a pending draft was read by a list of Tanzanian
    // mobile-money brands eight hundred lines ABOVE the gate that decides who
    // reads what.
    expect(webhook).toContain('const answeredMethod = messageGoesToModel(convo, body, systemCommand)');
    expect(webhook).toContain('? null\n            : parsePaymentMethodAnswer(body);');
  });
});

describe('§17 acceptance matrix: none of these is a protocol answer', () => {
  const PARKED = [
    { awaiting: 'product_cost', options: { kind: 'price_band_choice', choices: [{ productName: 'nyama' }] } },
    { awaiting: 'daily_record_quantity', options: { product: 'nyama', ledger: 'sale' } },
    { awaiting: 'payment_source', options: { kind: 'daily_record_confirmation', dailyRecordId: 'x' } },
  ];

  const LANGUAGE = [
    'reja', 'rejarej', 'rejareja', 'jumla', 'jumlla',
    '5', 'thelathini', 'mbili na nusu', 'kilo tatu',
    'anton', 'namaanisha anton', 'ile ya hisense', 'huyo wa kwanza',
    'cash', 'mpesa', 'tigopesa', 'bank',
    'mauzo', 'ni manunuzi', 'nimehesabu stock tu',
    'Juma', 'hisense',
    'leo nimeuza shingapi',
  ];

  it('sends every one of them to the model, whatever is parked', () => {
    for (const convo of PARKED) {
      for (const said of LANGUAGE) {
        expect(answersPendingQuestion(convo, said), `${said} (parked: ${convo.awaiting})`).toBe(false);
        expect(messageGoesToModel(convo, said, false), `${said} would not reach the model`).toBe(true);
      }
    }
  });

  it('still keeps the exact protocol words out of the model', () => {
    for (const convo of PARKED) {
      for (const said of ['NDIYO', 'ndiyo', 'HAPANA', 'hapana', 'ghairi']) {
        expect(answersPendingQuestion(convo, said), said).toBe(true);
        expect(messageGoesToModel(convo, said, false), said).toBe(false);
      }
    }
  });
});

describe('the model is told what it is being asked', () => {
  it('names the field and the answers it accepts, without a figure', () => {
    const described = describePending({ field: 'price_band', intent: 'sale', product: 'Nguvu ya Sala' });
    expect(described).toContain('field=price_band');
    expect(described).toContain('allowed_values=retail|wholesale');
    expect(described).toContain('Nguvu ya Sala');
    expect(described).not.toMatch(/\d{3,}/);
  });

  it('tells the model that the decision is its own', () => {
    const described = describePending({ field: 'event_type', intent: 'unknown' })!;
    expect(described).toMatch(/the server no longer reads their words at all/i);
  });

  it('offers a unit question the measures the product is actually sold in', () => {
    const described = describePending({
      field: 'unit', intent: 'sale', product: 'mafuta', choices: ['lita', 'robo'],
    });
    expect(described).toContain('allowed_values=lita|robo');
  });

  it('says nothing when nothing is parked', () => {
    expect(describePending(null)).toBeNull();
  });

  it('reaches the assistant turn from the parked row', () => {
    expect(webhook).toContain('function pendingClarificationOf');
    expect(webhook).toContain('pendingClarificationOf(convo)');
  });
});

describe('the tool carries meaning, not wording to be parsed', () => {
  const tool = ASSISTANT_TOOLS.find((entry) => entry.name === 'resolve_pending_clarification');
  const item = (tool!.input_schema as {
    properties: { answers: { items: { properties: Record<string, { enum?: string[] }> } } };
  }).properties.answers.items;

  it('asks for a canonical value the model decided', () => {
    expect(Object.keys(item.properties)).toEqual(['field', 'canonical_value', 'numeric_value', 'raw_wording']);
    expect(item.properties.field.enum).toEqual([...CLARIFICATION_FIELDS]);
  });

  it('says plainly that the server no longer reads the words', () => {
    expect(tool!.description).toMatch(/YOU decide what the trader meant/i);
    expect(tool!.description).toMatch(/the server no longer reads their words/i);
  });

  it('accepts several facts settled in one breath', () => {
    // "mpesa na ilikuwa jana", "hisense kilo tatu".
    expect(tool!.description).toMatch(/Answer several fields at once/i);
    const answers = validateClarificationAnswers({
      answers: [
        { field: 'quantity', numeric_value: 3, canonical_value: null, raw_wording: 'tatu' },
        { field: 'unit', canonical_value: 'kilo', numeric_value: null, raw_wording: 'kilo' },
      ],
    });
    expect(answers.map((answer) => answer.field)).toEqual(['quantity', 'unit']);
  });

  it('drops an entry that names no question and no value', () => {
    expect(validateClarificationAnswers({ answers: [{ field: 'nonsense', canonical_value: 'retail' }] })).toEqual([]);
    expect(validateClarificationAnswers({ answers: [{ field: 'price_band' }] })).toEqual([]);
    expect(validateClarificationAnswers({ answers: [{ field: 'price_band', canonical_value: 'null' }] })).toEqual([]);
  });

  it('carries no identity, price or confirmation', () => {
    const schema = JSON.stringify(tool!.input_schema);
    for (const forbidden of ['"company_id"', '"profile_id"', '"role"', '"price"', '"total"', '"confirmed"']) {
      expect(schema, forbidden).not.toContain(forbidden);
    }
  });
});

describe('the server checks bounds, which is not reading language', () => {
  it('accepts a meaning the question allows', () => {
    expect(checkCanonicalValue('price_band', 'retail')).toEqual({ kind: 'ok', value: 'retail' });
    expect(checkCanonicalValue('event_type', 'stock_count')).toEqual({ kind: 'ok', value: 'stock_count' });
    expect(checkCanonicalValue('payment_method', 'mobile_money')).toEqual({ kind: 'ok', value: 'mobile_money' });
  });

  it('refuses a meaning it does not', () => {
    expect(checkCanonicalValue('price_band', 'discount')).toEqual({ kind: 'reject', reason: 'not_allowed' });
    expect(checkCanonicalValue('payment_method', 'bitcoin')).toEqual({ kind: 'reject', reason: 'not_allowed' });
    expect(checkCanonicalValue('price_band', null)).toEqual({ kind: 'reject', reason: 'missing' });
  });

  it('is a membership test, so wording cannot move it', () => {
    // The point of the whole change: these are the trader's words, and none of
    // them is a legal MEANING. The server does not know what they mean and does
    // not try — that was the model's job and it has already been done.
    for (const wording of ['reja', 'rejareja', 'jumla', 'mauzo', 'mpesa', 'tigopesa']) {
      expect(checkCanonicalValue('price_band', wording).kind, wording).toBe('reject');
    }
  });

  it('leaves open-ended fields to the company’s own data', () => {
    // A product or a person has no enum. The catalogue and the customer list
    // decide, not a word list.
    expect(ALLOWED_VALUES.product).toBeUndefined();
    expect(ALLOWED_VALUES.party).toBeUndefined();
    expect(checkCanonicalValue('product', 'Anton wa Padua')).toEqual({ kind: 'ok', value: 'Anton wa Padua' });
  });

  it('range-checks a number rather than re-reading the sentence', () => {
    expect(checkNumber(30)).toEqual({ kind: 'value', value: 30 });
    expect(checkNumber(2.5)).toEqual({ kind: 'value', value: 2.5 });
    expect(checkNumber(0)).toEqual({ kind: 'ask', reason: 'out_of_range' });
    expect(checkNumber(-3)).toEqual({ kind: 'ask', reason: 'out_of_range' });
    expect(checkNumber(null)).toEqual({ kind: 'ask', reason: 'missing' });
  });

  it('narrows a band to the two the ledger stores', () => {
    expect(asBand('retail')).toBe('retail');
    expect(asBand('wholesale')).toBe('wholesale');
    expect(asBand('reja')).toBeNull();
  });
});

describe('resuming re-derives everything financial', () => {
  it('refuses to resume a question that is not the one on the table', () => {
    expect(webhook).toContain('Naomba unijibu hilo kwanza');
  });

  it('refuses to resume when nothing is parked, without ending the turn', () => {
    // It still refuses to invent a state to fit the answer — that part was
    // always right. What changed is what happens next.
    //
    // MEASURED: the owner was shown a nine-line stock count at 13:58, the
    // parked question expired at 14:28, and he answered at 14:29 by sending
    // the same nine lines again. One minute. He was told "Sina swali
    // linalosubiri jibu kwa sasa" and his nine products were dropped.
    //
    // Being right about the state is not the same as being useful. The turn
    // now goes back to the model with no terminalReply, so it answers the
    // message that is actually in front of it.
    const branch = webhook.slice(
      webhook.indexOf('  if (!pending) {'),
      webhook.indexOf('  if (!pending) {') + 2200,
    );
    expect(branch).toContain('no_pending_question=true');
    expect(branch).toContain('isError: true,');
    expect(branch.slice(branch.indexOf('return {'), branch.indexOf('isError: true,')))
      .not.toContain('terminalReply');
  });

  it('prices through the one shared path, not a second copy', () => {
    expect(webhook).toContain('async function priceAndDraftSale');
    expect((webhook.match(/await priceAndDraftSale\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('resumes the payment method on the same draft, without re-drafting', () => {
    const branch = webhook.slice(webhook.indexOf("if (pending.field === 'payment_method')"));
    expect(branch.slice(0, 1600)).toContain("db.rpc('wa_set_draft_payment_method'");
    expect(branch.slice(0, 1600)).toContain('await pendingDraftState(');
  });

  it('lets a unit settled in the same breath ride with the quantity', () => {
    const branch = webhook.slice(webhook.indexOf("if (pending.field === 'quantity')"));
    expect(branch.slice(0, 1600)).toContain("byField.get('unit')");
    expect(branch.slice(0, 1600)).toContain('spokenUnit: unit');
  });

  it('takes a payment method settled alongside any other answer', () => {
    expect(webhook).toContain('function paymentFrom(');
    expect((webhook.match(/paymentFrom\(byField\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
