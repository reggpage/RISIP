import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_DAILY_RECORD_AMOUNT,
  buildDailyRecordConfirmation,
  buildDailyRecordConfirmationChunks,
  buildDailyRecordConfirmed,
  detectDailyRecordPriceAnomalies,
  isDailyRecordCandidate,
  isDailyRecordConfirmation,
  isDailyRecordRejection,
  parseDailyRecord,
  parseDailyRecordPriceChoice,
  resumeDailyRecordClarification,
} from '../../../../supabase/functions/_shared/whatsappDailyRecords';

describe('deterministic WhatsApp daily-record parser', () => {
  it('parses a Swahili sale with a total', () => {
    expect(parseDailyRecord('nimeuza madaftari 10 kwa 3000', 'sw')).toEqual({
      kind: 'parsed',
      record: {
        kind: 'sale',
        amount: 3000,
        partyName: null,
        description: 'madaftari 10',
        lines: [],
        confidence: 0.94,
      },
    });
  });

  it('parses a Swahili unit-price sale and recomputes the total', () => {
    const parsed = parseDailyRecord('leo nimeuza kalamu 5 kila moja 500', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind === 'parsed') {
      expect(parsed.record.amount).toBe(2500);
      expect(parsed.record.lines).toEqual([{ description: 'kalamu', quantity: 5, unit_amount: 500 }]);
    }
  });

  it('calculates the exact live phrase as 70 times 9000', () => {
    const parsed = parseDailyRecord('Nimeuza nguvu ya sala 70 kila moja ni 9000', 'sw');
    expect(parsed).toMatchObject({ kind: 'parsed', record: { amount: 630000 } });
    if (parsed.kind === 'parsed') {
      expect(parsed.record.lines).toEqual([{ description: 'nguvu ya sala', quantity: 70, unit_amount: 9000 }]);
    }
  });

  it('sums multiple sale lines', () => {
    const parsed = parseDailyRecord('nimeuza madaftari 10 kila moja 3000 na kalamu 5 kila moja 500', 'sw');
    expect(parsed).toMatchObject({ kind: 'parsed', record: { amount: 32500 } });
    if (parsed.kind === 'parsed') expect(parsed.record.lines).toHaveLength(2);
  });

  it('parses an English sale and an expense', () => {
    expect(parseDailyRecord('sold 5 notebooks each 3000', 'en')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'sale', amount: 15000 },
    });
    expect(parseDailyRecord('expense ya umeme 12000', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'expense', amount: 12000, description: 'umeme' },
    });
    expect(parseDailyRecord('spent on transport 8000', 'en')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'expense', amount: 8000 },
    });
  });

  it('sums multiple expenses and supports mixed money notation', () => {
    expect(parseDailyRecord('nimelipa transport 8000 na chakula 5000', 'sw')).toMatchObject({
      kind: 'parsed', record: { kind: 'expense', amount: 13000 },
    });
    expect(parseDailyRecord('nimeuza bidhaa kwa TSh 3k', 'sw')).toMatchObject({
      kind: 'parsed', record: { amount: 3000 },
    });
    expect(parseDailyRecord('nimeuza madaftari 10 kila moja Tshs 3,000/=', 'sw')).toMatchObject({
      kind: 'parsed', record: { amount: 30000 },
    });
    expect(parseDailyRecord('sold goods for 3,000', 'en')).toMatchObject({
      kind: 'parsed', record: { amount: 3000 },
    });
  });

  it('never collapses a repeated kwa-total sale list to its final amount', () => {
    const parsed = parseDailyRecord('nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500', 'sw');
    expect(parsed.kind).toBe('clarify');
    if (parsed.kind === 'parsed') expect(parsed.record.amount).not.toBe(1_500);
  });

  it('parses debts and customer payments with the named party', () => {
    expect(parseDailyRecord('Asha amechukua madaftari kwa mkopo 24000 atalipa Ijumaa', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'debt_issued', amount: 24000, partyName: 'Asha' },
    });
    expect(parseDailyRecord('Juma ananidai 15000', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'debt_issued', amount: 15000, partyName: 'Juma' },
    });
    expect(parseDailyRecord('Asha amelipa 10000', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'customer_payment', amount: 10000, partyName: 'Asha' },
    });
    expect(parseDailyRecord('Juma kalipa deni 5000', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'customer_payment', amount: 5000, partyName: 'Juma' },
    });
    expect(parseDailyRecord('Asha amechukua vitabu 2 kila moja 12000 kwa mkopo', 'sw')).toMatchObject({
      kind: 'parsed', record: { kind: 'debt_issued', amount: 24000 },
    });
    expect(parseDailyRecord('Asha amelipa 10000 kati ya 24000', 'sw')).toMatchObject({
      kind: 'parsed', record: { kind: 'customer_payment', amount: 10000, referenceAmount: 24000 },
    });
  });

  it('asks for clarification when the amount or message is unclear', () => {
    expect(parseDailyRecord('nimeuza bidhaa', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('expense ya umeme 12000 jana kwa mradi', 'sw')).toMatchObject({ kind: 'clarify', reason: 'message' });
    expect(parseDailyRecord('nimeuza bidhaa 10 3000', 'sw')).toMatchObject({
      kind: 'clarify', reason: 'ambiguity', question: 'Bei hii ni jumla au bei ya kila moja?',
      draft: { kind: 'daily_record_clarification', sale: { description: 'bidhaa', quantity: 10, amount: 3000 } },
    });
    expect(parseDailyRecord('nimeuza nguvu ya sala 70 kila moja', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('nimeuza bidhaa kwa 0', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('nimeuza bidhaa kwa -5000', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('nimeuza bidhaa kwa 100000001', 'sw')).toMatchObject({ kind: 'clarify', reason: 'limit' });
  });

  it('saves a clarification draft and resumes total versus unit-price choice', () => {
    const ambiguous = parseDailyRecord('nimeuza vitabu mbili 9000', 'sw');
    expect(ambiguous.kind).toBe('clarify');
    if (ambiguous.kind !== 'clarify' || !ambiguous.draft) return;
    expect(parseDailyRecordPriceChoice('bei ya kila moja')).toBe('unit_price');
    expect(parseDailyRecordPriceChoice('kila moja')).toBe('unit_price');
    expect(parseDailyRecordPriceChoice('unit price')).toBe('unit_price');
    expect(parseDailyRecordPriceChoice('jumla')).toBe('total');
    expect(parseDailyRecordPriceChoice('total')).toBe('total');
    expect(resumeDailyRecordClarification(ambiguous.draft, 'unit_price')).toMatchObject({
      kind: 'parsed', record: { amount: 18000, lines: [{ description: 'vitabu', quantity: 2, unit_amount: 9000 }] },
    });
    expect(resumeDailyRecordClarification(ambiguous.draft, 'total')).toMatchObject({
      kind: 'parsed', record: { amount: 9000, lines: [{ description: 'vitabu', quantity: 2, unit_amount: 4500 }] },
    });
  });

  it('resumes every ambiguous sale line and recomputes the combined total', () => {
    const ambiguous = parseDailyRecord('nimeuza madaftari 70 9000 - kalamu 9 500', 'sw');
    expect(ambiguous.kind).toBe('clarify');
    if (ambiguous.kind !== 'clarify' || !ambiguous.draft) return;
    const resumed = resumeDailyRecordClarification(ambiguous.draft, 'unit_price');
    expect(resumed).toMatchObject({ kind: 'parsed', record: { amount: 634500 } });
    if (resumed.kind === 'parsed') expect(resumed.record.lines).toHaveLength(2);
  });

  it('normalizes number words, @ prices, new lines, and separators while keeping names', () => {
    expect(parseDailyRecord('nimeuza madaftari saba kila moja @9,000', 'sw')).toMatchObject({
      kind: 'parsed', record: { amount: 63000, lines: [{ description: 'madaftari', quantity: 7, unit_amount: 9000 }] },
    });
    expect(parseDailyRecord('nimelipa transport: TSh 9,000\nnimetumia chakula 3,000/=', 'sw')).toMatchObject({
      kind: 'parsed', record: { amount: 12000 },
    });
  });

  it('parses a long repeated-prefix sales batch and recomputes every line server-side', () => {
    const message = [
      'nimeuza daftari 10 kila moja 1500',
      'nimeuza kalamu 20 kila moja 500',
      'nimeuza penseli 25 kila moja 300',
      'nimeuza rula 8 kila moja 800',
      'nimeuza kifutio 15 kila moja 300',
      'nimeuza kichongeo 12 kila moja 300',
      'nimeuza karatasi a4 rimu 2 kila moja 14000',
      'nimeuza bahasha 30 kila moja 200',
      'nimeuza jalada 10 kila moja 1500',
      'nimeuza stapler 2 kila moja 8000',
      'nimeuza pini za stapler 6 kila moja 1500',
      'nimeuza gundi 8 kila moja 1000',
      'nimeuza mkasi 3 kila moja 3500',
      'nimeuza kalamu za rangi 5 kila moja 5000',
      'nimeuza chaki 4 kila moja 2500',
      'nimeuza duster 3 kila moja 2000',
      'nimeuza manila 20 kila moja 1000',
      'nimeuza daftari la graph 12 kila moja 2500',
      'nimeuza atlasi 2 kila moja 15000',
      'nimeuza kamusi 1 kila moja 25000',
      'nimeuza biblia 2 kila moja 20000',
      'nimeuza nguvu ya sala 5 kila moja 12000',
      'nimeuza kitabu cha hesabu 6 kila moja 8000',
      'nimeuza marker 10 kila moja 2000',
      'nimeuza whiteboard marker 8 kila moja 2500',
      'nimeuza kikokotoo 2 kila moja 15000',
      'nimeuza mkoba wa shule 3 kila moja 25000',
      'nimeuza cellotape 10 kila moja 1500',
      'nimeuza punch 1 kila moja 12000',
      'nimeuza daftari kubwa 15 kila moja 2000',
      'nimeuza kalamu 12 kila moja 500 na daftari 8 kila moja 1500',
      'nimeuza penseli 20 kila moja 300 na kifutio 20 kila moja 300',
      'nimeuza bahasha 50 kila moja 200 na gundi 4 kila moja 1000',
      'nimeuza chaki 6 kila moja 2500 na duster 4 kila moja 2000',
      'nimeuza daftari 20 kila moja 1500 na kalamu 30 kila moja 500',
      'nimeuza manila 10 kila moja 1000 na cellotape 5 kila moja 1500',
      'nimeuza nguvu ya sala 3 kila moja 12000 na biblia 1 kila moja 20000',
      'nimeuza rula 10 kila moja 800 na kichongeo 10 kila moja 300',
      'nimeuza marker 6 kila moja 2000 na whiteboard marker 4 kila moja 2500',
      'nimeuza jalada 12 kila moja 1500 na punch 1 kila moja 12000',
      'nimeuza daftari 10 kila moja 1500 na kalamu 15 kila moja 500 na penseli 10 kila moja 300',
      'nimeuza karatasi a4 rimu 1 kila moja 14000 na bahasha 20 kila moja 200 na gundi 3 kila moja 1000',
      'nimeuza atlasi 1 kila moja 15000 na kamusi 1 kila moja 25000 na kitabu cha hesabu 2 kila moja 8000',
      'nimeuza chaki 5 kila moja 2500 na duster 2 kila moja 2000 na manila 8 kila moja 1000',
      'nimeuza mkoba wa shule 2 kila moja 25000 na kikokotoo 1 kila moja 15000 na rula 5 kila moja 800',
    ].join('\n');

    const parsed = parseDailyRecord(message, 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.lines).toHaveLength(65);
    expect(parsed.record.amount).toBe(1_080_000);
    expect(parsed.record.lines[0]).toEqual({ description: 'daftari', quantity: 10, unit_amount: 1500 });
    expect(parsed.record.lines.at(-1)).toEqual({ description: 'rula', quantity: 5, unit_amount: 800 });

    const chunks = buildDailyRecordConfirmationChunks(parsed.record, 'sw', 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 500)).toBe(true);
    expect(chunks.at(-1)).toContain('Jumla: *TSh 1,080,000*');
    expect(chunks.at(-1)).toContain('NDIYO');
    expect(buildDailyRecordConfirmationChunks(parsed.record, 'sw').every((chunk) => chunk.length <= 3200)).toBe(true);
  });

  it('uses the requested language for confirmation copy', () => {
    const parsed = parseDailyRecord('nimeuza bidhaa kwa TSh 15000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind === 'parsed') {
      const reply = buildDailyRecordConfirmation(parsed.record, 'sw');
      expect(reply).toContain('TSh 15,000');
      expect(reply).toContain('NDIYO');
      expect(reply).not.toContain('Confirm');
    }
  });

  it('shows formula lines and total in the confirmation summary', () => {
    const parsed = parseDailyRecord('nimeuza nguvu ya sala 70 kila moja ni 9000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind === 'parsed') {
      const reply = buildDailyRecordConfirmation(parsed.record, 'sw');
      expect(reply).toContain('nguvu ya sala: 70 × TSh 9,000 = TSh 630,000');
      expect(reply).toContain('Jumla: *TSh 630,000*');
    }
  });

  it('adds a records link and bold total after confirmation', () => {
    const parsed = parseDailyRecord('nimeuza madaftari 10 kila moja 3000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind === 'parsed') {
      const reply = buildDailyRecordConfirmed(parsed.record, 'sw');
      expect(reply).toContain('*TSh 30,000*');
      expect(reply).toContain('https://risip.online/daily-records');
    }
  });

  it('does not exceed the declared safety limit', () => {
    expect(MAX_DAILY_RECORD_AMOUNT).toBe(100_000_000);
    expect(parseDailyRecord('nimeuza bidhaa kwa 100000000', 'sw')).toMatchObject({ kind: 'parsed' });
    expect(parseDailyRecord('nimeuza bidhaa kwa 100000001', 'sw')).toMatchObject({ kind: 'clarify', reason: 'limit' });
  });

  it('recognises explicit confirmation and rejection only', () => {
    expect(isDailyRecordConfirmation('NDIYO')).toBe(true);
    expect(isDailyRecordConfirmation('yes, confirm')).toBe(true);
    expect(isDailyRecordRejection('HAPANA')).toBe(true);
    expect(isDailyRecordRejection('cancel')).toBe(true);
    expect(isDailyRecordRejection('Toka')).toBe(true);
    expect(isDailyRecordRejection('Futa')).toBe(true);
    expect(isDailyRecordConfirmation('nimeuza 5000')).toBe(false);
  });

  it('tolerates common spelling slips and reports deterministic confidence', () => {
    const parsed = parseDailyRecord('nimeuzza madaftari saba kila moja @9,000', 'sw');
    expect(parsed).toMatchObject({ kind: 'parsed', record: { amount: 63000, confidence: 0.98 } });
  });

  it('warns about unusual historical prices without changing the amount', () => {
    const parsed = parseDailyRecord('nimeuza madaftari 10 kila moja 9000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    const warnings = detectDailyRecordPriceAnomalies(parsed.record, [
      { description: 'madaftari', unit_amount: 3000 },
      { description: 'madaftari', unit_amount: 3000 },
    ]);
    expect(warnings).toHaveLength(1);
    expect(parsed.record.amount).toBe(90000);
  });
});

describe('what counts as something that happened', () => {
  it('takes a sale in the simple past, not only the perfect', () => {
    // Found by the router probe, not by a person: "niliuza st rita wa kashia 3
    // kwa 13500" reached no parser at all, because only "nimeuza" was listed.
    // A plain sale was being handed to the model to improvise.
    expect(isDailyRecordCandidate('niliuza st rita wa kashia 3 kwa 13500')).toBe(true);
    expect(isDailyRecordCandidate('tuliuza daftari 10 kwa 15000')).toBe(true);
    expect(isDailyRecordCandidate('nililipa umeme 45000')).toBe(true);
    expect(isDailyRecordCandidate('nilinunua stock ya sukari 50000')).toBe(true);
  });

  it('does not mistake a question about sales for a sale', () => {
    // "mauzo" is a noun that opens as many questions as it does records, and it
    // was putting every one of them one step from becoming a draft.
    expect(isDailyRecordCandidate('mauzo ya leo ni ngapi')).toBe(false);
    expect(isDailyRecordCandidate('mauzo ya wiki hii yalikuwa kiasi gani')).toBe(false);
    expect(isDailyRecordCandidate('deni langu ni ngapi?')).toBe(false);
    expect(isDailyRecordCandidate('bidhaa gani inauza sana')).toBe(false);
  });

  it('still takes a bare noun when nothing is being asked', () => {
    // "stock ya sukari 50000" is how a restock actually gets typed.
    expect(isDailyRecordCandidate('stock ya sukari 50000')).toBe(true);
  });

  it('keeps a tag question, because the sale still carries its amount', () => {
    expect(isDailyRecordCandidate('nimeuza daftari 5 kwa 7500, ni sawa?')).toBe(true);
  });

  it('does not mistake a question about past takings for a sale', () => {
    // My own regression: adding the simple past so "niliuza st rita 3 kwa
    // 13500" would record also swallowed "Jana niliuza shingapi?" and answered
    // it with "write a positive amount". The verb is identical; one carries a
    // figure, the other asks for one.
    expect(isDailyRecordCandidate('Jana niliuza shingapi?')).toBe(false);
    expect(isDailyRecordCandidate('niliuza ngapi wiki iliyopita')).toBe(false);
    expect(isDailyRecordCandidate('nimeuza kiasi gani leo')).toBe(false);
    expect(isDailyRecordCandidate('nimelipa kiasi gani mwezi huu')).toBe(false);
  });

  it('still records a sale that states no price, because it asks for none', () => {
    expect(isDailyRecordCandidate('nimeuza daftari 10')).toBe(true);
    expect(isDailyRecordCandidate('nimeuza kalamu 12 na daftari 8')).toBe(true);
  });
});

describe('questions the eval set caught, the first time it was ever run', () => {
  it('does not mistake "who owes me" for a debt being recorded', () => {
    // A selling/debt verb with no number anywhere, asking WHO, is a question
    // about the past — not a record of it. It was one step from a draft.
    expect(isDailyRecordCandidate('nani ananidai?')).toBe(false);
    expect(isDailyRecordCandidate('nani ananidwa pesa')).toBe(false);
  });

  it('does not mistake "what sold most" for a sale', () => {
    expect(isDailyRecordCandidate('wht sold most tday')).toBe(false);
    expect(isDailyRecordCandidate('What sold the most today?')).toBe(false);
    expect(isDailyRecordCandidate('top 5 bidhaa zangu')).toBe(false);
    expect(isDailyRecordCandidate('nionyeshe bidhaa zote ninazouza')).toBe(false);
  });

  it('needs a number before a bare noun counts as a record', () => {
    // "mauzo ya wiki hii" was answered by asking for a positive amount.
    expect(isDailyRecordCandidate('mauzo ya wiki hii')).toBe(false);
    expect(isDailyRecordCandidate('stock ya sukari 50000')).toBe(true);
  });

  it('still records a sale that names goods without asking anything', () => {
    expect(isDailyRecordCandidate('nimeuza daftari 10')).toBe(true);
    expect(isDailyRecordCandidate('nimeuza bidhaa')).toBe(true);
    expect(isDailyRecordCandidate('nimeuza daftari 5 kwa 7500')).toBe(true);
  });
});

describe('deciding "total or each" instead of asking', () => {
  it('still asks when the parser alone cannot tell', () => {
    // The webhook settles this from the price list; the parser on its own has
    // no shop behind it and must keep asking.
    expect(parseDailyRecord('nimeuza ugali 2 3000', 'sw'))
      .toMatchObject({ kind: 'clarify', reason: 'ambiguity' });
  });

  it('resumes to the unit-price reading', () => {
    const parsed = parseDailyRecord('nimeuza ugali 2 3000', 'sw');
    if (parsed.kind !== 'clarify' || !parsed.draft) throw new Error('expected a draft');
    expect(resumeDailyRecordClarification(parsed.draft, 'unit_price'))
      .toMatchObject({ kind: 'parsed', record: { amount: 6000 } });
  });

  it('resumes to the total reading', () => {
    const parsed = parseDailyRecord('nimeuza ugali 2 3000', 'sw');
    if (parsed.kind !== 'clarify' || !parsed.draft) throw new Error('expected a draft');
    expect(resumeDailyRecordClarification(parsed.draft, 'total'))
      .toMatchObject({ kind: 'parsed', record: { amount: 3000 } });
  });

  it('is wired to the price list, and only settles one reading', () => {
    const webhook = readFileSync(
      resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(webhook).toContain('const settled = await settlePriceAmbiguity(db, identity, parsed.draft);');
    // Both readings matching is a coincidence, not a decision to make for
    // somebody: the question survives.
    expect(webhook).toContain('if (perItemReading === totalReading) return null;');
  });
});

describe('buying goods is half the ledger', () => {
  it('records a restock that never says the word "stock"', () => {
    // MEASURED FAILURE: this was answered "Sijaelewa vizuri", while the same
    // sentence with "nimeuza" recorded perfectly. No shopkeeper says "stock"
    // when they say what they bought.
    const parsed = parseDailyRecord('nimenunua vitabu 10 kila moja 7000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.kind).toBe('stock_purchase');
    expect(parsed.record.amount).toBe(70000);
    expect(parsed.record.lines).toEqual([{ description: 'vitabu', quantity: 10, unit_amount: 7000 }]);
  });

  it('records the money when the quantity cannot be read cleanly', () => {
    const parsed = parseDailyRecord('nimenunua daftari 100 kwa 120000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.amount).toBe(120000);
    // No line, so nothing moves on the shelf, and the description reads cleanly.
    expect(parsed.record.lines).toEqual([]);
    expect(parsed.record.description).toBe('daftari');
  });

  it('still refuses to turn lunch into stock', () => {
    // One number and no goods count: as likely a running cost as a restock, and
    // a wrong guess puts a meal on the shelf for ever.
    expect(parseDailyRecord('nimenunua chakula 5000', 'sw').kind).toBe('clarify');
    expect(parseDailyRecord('nimenunua mafuta 20000', 'sw').kind).toBe('clarify');
  });

  it('leaves the declared form exactly as it was', () => {
    const parsed = parseDailyRecord('nimenunua stock ya sukari 70000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.kind).toBe('stock_purchase');
    expect(parsed.record.amount).toBe(70000);
  });

  it('still lets the sentence call itself an expense', () => {
    const parsed = parseDailyRecord('nimelipa nimenunua petrol 20000', 'sw');
    expect(parsed.kind === 'parsed' && parsed.record.kind).toBe('expense');
  });
});
