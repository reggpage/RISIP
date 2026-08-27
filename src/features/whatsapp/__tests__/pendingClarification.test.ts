import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answersPendingQuestion } from '../../../../supabase/functions/_shared/whatsappRouting';
import {
  CLARIFICATION_FIELDS,
  canonicalBand,
  canonicalEventType,
  checkQuantity,
  describePending,
  validateClarificationAnswer,
} from '../../../../supabase/functions/_shared/whatsappClarification';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { normalizeNumberWords } from '../../../../supabase/functions/_shared/whatsappDailyRecords';

// THE LAST TWO BRAINS.
//
// A shop met a language model when it opened a subject and a regular expression
// when it answered the follow-up:
//
//   parseQuantityAnswer         "tano", "thelathini", "mbili na nusu"
//   parsePriceBandAnswer        "reja", "rejarej", "jumla"
//   parseQuantityMeaningAnswer  "mauzo", "manunuzi", "hesabu"
//
// Nothing the shopkeeper could see decided which brain answered — only whether
// a question happened to be parked. "Namaanisha anton" fell through all three
// lists and got the same question a third time.
//
// Those lists are still in the codebase, and they still do useful work: given a
// phrase the model has already identified as the answer to a specific question,
// they decide whether it names a legal value. That is a bounds check. What they
// no longer do is decide what a sentence is about.

const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const routing = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/whatsappRouting.ts'), 'utf8');
const readNumber = (phrase: string) => {
  const normalized = normalizeNumberWords(phrase.toLowerCase());
  const found = /-?\d+(?:[.,]\d+)?/u.exec(normalized.replace(/(\d),(\d{3})\b/gu, '$1$2'));
  return found ? Number(found[0].replace(',', '.')) : null;
};

describe('no clarification parser stands in front of the model', () => {
  it('leaves only yes and no in the gate', () => {
    // Executable lines only. The comment inside names all three parsers on
    // purpose, so the next reader can see what used to stand here and why it
    // went — asserting on the whole slice would fight that documentation.
    const gate = routing
      .slice(
        routing.indexOf('export function answersPendingQuestion'),
        routing.indexOf('export const PARSERS_BEHIND_CLAUDE'),
      )
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    for (const parser of [
      'parseQuantityAnswer', 'parsePriceBandAnswer', 'parseQuantityMeaningAnswer',
      'parsePaymentMethodAnswer',
    ]) {
      expect(gate, `${parser} still reads human language before the model`).not.toContain(parser);
    }
    expect(gate).toContain('isDailyRecordConfirmation(text) || isDailyRecordRejection(text)');
  });

  it('stops importing them here at all', () => {
    for (const parser of ['parseQuantityAnswer', 'parsePriceBandAnswer', 'parseQuantityMeaningAnswer']) {
      expect(routing, `${parser} is still imported by the router`).not.toContain(parser.concat(' }'));
    }
  });
});

describe('§17 acceptance matrix: none of these is a protocol answer', () => {
  const PARKED = [
    { awaiting: 'product_cost', options: { kind: 'price_band_choice', choices: [{ productName: 'nyama' }] } },
    { awaiting: 'daily_record_quantity', options: { product: 'nyama', ledger: 'sale' } },
  ];

  const LANGUAGE = [
    // price band
    'reja', 'rejarej', 'rejareja', 'jumla', 'jumlla',
    // quantity
    '5', 'thelathini', 'mbili na nusu', 'kilo tatu',
    // product
    'anton', 'namaanisha anton', 'ile ya hisense', 'huyo wa kwanza',
    // payment
    'cash', 'mpesa', 'tigopesa', 'bank',
    // a change of subject
    'leo nimeuza shingapi',
  ];

  it('sends every one of them to the model, whatever is parked', () => {
    for (const convo of PARKED) {
      for (const said of LANGUAGE) {
        expect(
          answersPendingQuestion(convo, said),
          `${said} (parked: ${convo.awaiting})`,
        ).toBe(false);
      }
    }
  });

  it('still keeps the exact protocol words out of the model', () => {
    for (const convo of PARKED) {
      for (const said of ['NDIYO', 'ndiyo', 'HAPANA', 'hapana', 'ghairi']) {
        expect(answersPendingQuestion(convo, said), said).toBe(true);
      }
    }
  });
});

describe('the model is told what it is being asked', () => {
  it('describes the parked question without carrying a figure', () => {
    const described = describePending({
      field: 'price_band', intent: 'sale', product: 'Nguvu ya Sala',
      allowedValues: ['retail', 'wholesale'],
    });
    expect(described).toContain('field=price_band');
    expect(described).toContain('allowed_values=retail|wholesale');
    expect(described).toContain('Nguvu ya Sala');
    // No price, no total, no balance, ever.
    expect(described).not.toMatch(/\d{3,}/);
  });

  it('says nothing when nothing is parked', () => {
    expect(describePending(null)).toBeNull();
  });

  it('reaches the assistant turn from the parked row', () => {
    expect(webhook).toContain('function pendingClarificationOf');
    expect(webhook).toContain('pendingClarificationOf(convo)');
  });
});

describe('the resume tool carries words, not decisions', () => {
  const tool = ASSISTANT_TOOLS.find((entry) => entry.name === 'resolve_pending_clarification');

  it('is on the menu, with three bounded fields', () => {
    expect(tool).toBeDefined();
    const properties = Object.keys((tool!.input_schema as { properties: Record<string, unknown> }).properties);
    expect(properties).toEqual(['field', 'wording', 'numeric_candidate']);
  });

  it('accepts only the questions Risip knows how to ask', () => {
    const field = (tool!.input_schema as { properties: { field: { enum: string[] } } }).properties.field;
    expect(field.enum).toEqual([...CLARIFICATION_FIELDS]);
  });

  it('tells the model to send words rather than a canonical value', () => {
    expect(tool!.description).toMatch(/OWN WORDS/);
    expect(tool!.description).toMatch(/Do not translate them into a canonical value/i);
  });

  it('refuses an answer to a question nobody asked', () => {
    expect(validateClarificationAnswer({ field: 'nonsense', wording: 'reja' })).toBeNull();
    expect(validateClarificationAnswer({ field: 'price_band' })).toBeNull();
    expect(validateClarificationAnswer({ field: 'price_band', wording: 'null' })).toBeNull();
  });

  it('carries no identity, price or confirmation', () => {
    const schema = JSON.stringify(tool!.input_schema);
    // Exact field names: 'price' on its own would match price_band, which is
    // the whole point of the tool.
    for (const forbidden of ['"company_id"', '"profile_id"', '"role"', '"price"', '"total"', '"confirmed"']) {
      expect(schema, forbidden).not.toContain(forbidden);
    }
  });
});

describe('the server decides what the words are worth', () => {
  it('maps band wording, including the way people mistype it', () => {
    for (const said of ['reja', 'rejarej', 'rejareja', 'reja reja', 'retail']) {
      expect(canonicalBand(said), said).toBe('retail');
    }
    for (const said of ['jumla', 'jumlla', 'wholesale']) {
      expect(canonicalBand(said), said).toBe('wholesale');
    }
    expect(canonicalBand('sijui')).toBeNull();
  });

  it('maps what a bare list turned out to be', () => {
    expect(canonicalEventType('mauzo')).toBe('sale');
    expect(canonicalEventType('manunuzi')).toBe('stock_purchase');
    expect(canonicalEventType('hesabu')).toBe('stock_count');
    expect(canonicalEventType('sijui')).toBeNull();
  });

  it('re-reads a quantity rather than trusting the model', () => {
    expect(checkQuantity('thelathini', 30, readNumber)).toEqual({ kind: 'value', value: 30 });
    expect(checkQuantity('mbili na nusu', 2.5, readNumber)).toEqual({ kind: 'value', value: 2.5 });
    expect(checkQuantity('5', 5, readNumber)).toEqual({ kind: 'value', value: 5 });
  });

  it('asks again when the two readings disagree', () => {
    // The words are the evidence. Guessing which of the two misread the
    // sentence is not a decision a ledger should make.
    expect(checkQuantity('thelathini', 3, readNumber)).toEqual({ kind: 'ask', reason: 'disagreement' });
    expect(checkQuantity('sijui', null, readNumber)).toEqual({ kind: 'ask', reason: 'unreadable' });
    expect(checkQuantity('0', 0, readNumber)).toEqual({ kind: 'ask', reason: 'out_of_range' });
  });
});

describe('resuming re-derives everything financial', () => {
  it('refuses to resume a question that is not the one on the table', () => {
    expect(webhook).toContain('if (pending.field !== answer.field)');
  });

  it('refuses to resume when nothing is parked', () => {
    expect(webhook).toContain('I am not waiting on an answer right now');
  });

  it('prices through the one shared path, not a second copy', () => {
    // Two copies of a pricing path is how the same sale gets drafted two
    // different ways depending on which door it came through.
    expect(webhook).toContain('async function priceAndDraftSale');
    const calls = (webhook.match(/await priceAndDraftSale\(/g) ?? []).length;
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('clears the parked question before it drafts', () => {
    const branch = webhook.slice(webhook.indexOf('async function executeClarification'));
    expect(branch.slice(0, 4000)).toContain('await clearConversation(db, identity.id as string);');
  });
});
