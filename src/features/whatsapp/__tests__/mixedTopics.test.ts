import { describe, expect, it } from 'vitest';
import { riderQuestionNotice, splitRiderQuestion } from '../../../../supabase/functions/_shared/whatsappMixedTopics';
import { parseStockCountBatch } from '../../../../supabase/functions/_shared/whatsappStockBatch';
import { parseStockCount } from '../../../../supabase/functions/_shared/whatsappStock';
import { parseSellingPrice } from '../../../../supabase/functions/_shared/whatsappSellingPrice';
import { parseProductCostBatch } from '../../../../supabase/functions/_shared/whatsappCostBatch';
import { parseProductCost } from '../../../../supabase/functions/_shared/whatsappProductCosts';
import { isDailyRecordCandidate } from '../../../../supabase/functions/_shared/whatsappDailyRecords';

describe('a message that carries an instruction and a question', () => {
  it('does not tear a comma-separated sale list into a fake rider topic', () => {
    expect(splitRiderQuestion('nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500')).toBeNull();
  });

  it('splits the ordinary case: a sale and a question about today', () => {
    const mixed = splitRiderQuestion('nimeuza daftari 5 kwa 7500, faida ya leo ni ngapi?');
    expect(mixed?.action).toBe('nimeuza daftari 5 kwa 7500');
    expect(mixed?.question).toBe('faida ya leo ni ngapi');
  });

  it('splits on a question mark', () => {
    const mixed = splitRiderQuestion('nimeuza daftari 5 kwa 7500. Faida ya leo ni ngapi? asante');
    expect(mixed?.question).toMatch(/faida ya leo ni ngapi/i);
  });

  it('splits on "pia"', () => {
    const mixed = splitRiderQuestion('nimeuza daftari 5 kwa 7500 pia niambie deni la Juma');
    expect(mixed?.action).toBe('nimeuza daftari 5 kwa 7500');
    expect(mixed?.question).toBe('niambie deni la Juma');
  });

  it('splits on a line break, which is how most people write two things', () => {
    const mixed = splitRiderQuestion('nimeuza kalamu 10 kwa 5000\nje mauzo ya jana yalikuwa ngapi');
    expect(mixed?.action).toBe('nimeuza kalamu 10 kwa 5000');
    expect(mixed?.question).toBe('je mauzo ya jana yalikuwa ngapi');
  });

  it('splits on "kisha"', () => {
    const mixed = splitRiderQuestion('nimeuza daftari 5 kwa 7500 kisha nionyeshe risiti za leo');
    expect(mixed?.question).toBe('nionyeshe risiti za leo');
  });
});

describe('what it must never tear in half', () => {
  it('leaves a list of goods alone — a comma is not a topic change', () => {
    // "nimeuza daftari 5, kalamu 3" is ONE sale of two things.
    expect(splitRiderQuestion('nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500')).toBeNull();
  });

  it('leaves "na" alone, because it joins goods', () => {
    expect(splitRiderQuestion('nimeuza daftari na kalamu kwa 9000')).toBeNull();
  });

  it('leaves a message that is only a question', () => {
    // The read path already owns this one whole.
    expect(splitRiderQuestion('faida ya leo ni ngapi?')).toBeNull();
    expect(splitRiderQuestion('je mauzo ya jana yalikuwa ngapi')).toBeNull();
  });

  it('leaves a message that is only an instruction', () => {
    expect(splitRiderQuestion('nimeuza daftari 5 kwa 7500')).toBeNull();
    expect(splitRiderQuestion('hesabu ya stock\ndaftari 90\nkalamu 240')).toBeNull();
  });

  it('does not split a one-word fragment off either side', () => {
    expect(splitRiderQuestion('nimeuza pia sukari kilo 2 kwa 5000')).toBeNull();
  });

  it('ignores an empty or enormous message', () => {
    expect(splitRiderQuestion('')).toBeNull();
    expect(splitRiderQuestion('a'.repeat(2100))).toBeNull();
  });
});

describe('what the sender is told', () => {
  it('says the question was seen and when it will be answered', () => {
    const notice = riderQuestionNotice('faida ya leo ni ngapi', 'sw');
    expect(notice).toContain('faida ya leo ni ngapi');
    expect(notice).toMatch(/najibu hapa chini/);
  });
});

// The split is only trusted when the action half actually reaches a write
// parser. These cases run the real routing predicate the webhook uses, so a
// change to either side shows up here rather than on somebody's phone.
describe('the split the router actually acts on', () => {
  const claimsWrite = (said: string) => Boolean(
    parseStockCountBatch(said) ?? parseStockCount(said) ?? parseSellingPrice(said)
    ?? parseProductCostBatch(said) ?? parseProductCost(said),
  ) || isDailyRecordCandidate(said);

  it('a sale with a question riding on it splits, and the sale still routes', () => {
    const mixed = splitRiderQuestion('nimeuza daftari 5 kwa 7500, faida ya leo ni ngapi?')!;
    expect(claimsWrite(mixed.action)).toBe(true);
  });

  it('a buying price with a question riding on it still routes', () => {
    const mixed = splitRiderQuestion('bei ya kununua daftari ni 1200 pia nionyeshe bidhaa zangu')!;
    expect(parseProductCost(mixed.action)).toEqual({ product: 'daftari', unitCost: 1200, unit: null });
  });

  it('a bulk stock count with a question riding on it still routes', () => {
    const mixed = splitRiderQuestion('hesabu ya stock\ndaftari 90\nkalamu 240\nfaida ya leo ni ngapi?')!;
    expect(parseStockCountBatch(mixed.action)?.counts).toHaveLength(2);
    expect(mixed.question).toBe('faida ya leo ni ngapi');
  });

  it('two questions and no instruction is left to the read path', () => {
    expect(splitRiderQuestion('faida ya leo ni ngapi? mauzo ya jana ni ngapi?')).toBeNull();
  });
});
