import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseReadRequest } from '../../../../supabase/functions/_shared/whatsappReadTools';

// MEASURED FAILURE, from the owner's own screen. The same question, three
// times, hours apart:
//
//   10:26  Leo nimeuza shingapi   -> "Naweza kukusaidia kuhusu Risip..."
//   12:45  Leo nimeuza shingapi   -> the same generic menu
//   16:02  Imeuzwa shingapi leo   -> the same generic menu
//
// "Leo nimeuza ngapi" worked. "Shingapi" is "shilingi ngapi" run together and
// is how the question is actually typed. One missing word, and a shop asking
// what it had taken that day was handed a list of things it could ask about
// instead — three times, without ever being told what was wrong.
//
// This is a question with an exact arithmetic answer. It should never have
// depended on a model choosing a tool.

const asksAboutSales = (said: string) => {
  const request = parseReadRequest(said);
  expect(request, said).not.toBeNull();
  expect(request!.tool, said).toBe('ai_business_summary');
  return request!;
};

describe('asking what today took', () => {
  it.each([
    'Leo nimeuza shingapi',
    'Imeuzwa shingapi leo',
    'leo nimeuza shilingi ngapi',
    'imeuzwa kiasi gani leo',
    'leo nimepata shingapi',
  ])('answers %s from the ledger', (said) => {
    expect(asksAboutSales(said).period).toBe('today');
  });

  it('still answers the wordings that already worked', () => {
    for (const said of ['leo nimeuza ngapi', 'Leo nimeuza kiasi gani', 'mauzo ya leo']) {
      expect(asksAboutSales(said).period).toBe('today');
    }
  });

  it('keeps the period the question asked for', () => {
    expect(parseReadRequest('mwezi huu nimeuza shingapi')?.period).toBe('month');
    expect(parseReadRequest('wiki hii imeuzwa shingapi')?.period).toBe('week');
  });
});

describe('a question is still not a sale', () => {
  // A sale always names a figure; a question never does. The two cannot
  // collide, and this is the assertion that keeps it that way.
  it.each([
    'nimeuza daftari 5 kwa 7500',
    'nimeuza nyama kilo 2 cash',
    'nimeuza soseji 8',
  ])('does not read %s as a question', (said) => {
    const request = parseReadRequest(said);
    expect(request?.tool ?? null, said).not.toBe('ai_business_summary');
  });
});

// MEASURED FAILURE, one minute after two questions had been answered properly:
//
//   17:27  Imeuzwa shingapi leo  -> a real summary
//   17:27  Leo nimeuza shingapi  -> a real summary
//   17:28  leo mambo yakoje?     -> the generic help menu
//
// It is the same question as "biashara yangu ikoje" in the words people use
// when they are not being formal. Handing back a list of topics, to somebody
// who had just watched Risip answer twice, reads as Risip not understanding
// Swahili.
describe('asking how things are going', () => {
  it.each([
    'leo mambo yakoje?',
    'mambo yakoje',
    'hali ikoje leo',
    'duka likoje',
    'vipi biashara',
    'kunaendeleaje',
  ])('reads %s as a question about the business', async (said) => {
    const { parseAdvisorRequest } = await import(
      '../../../../supabase/functions/_shared/whatsappAdvisor');
    expect(parseAdvisorRequest(said)).toBe(true);
  });

  it('still answers the formal wording it always did', async () => {
    const { parseAdvisorRequest } = await import(
      '../../../../supabase/functions/_shared/whatsappAdvisor');
    expect(parseAdvisorRequest('Leo biashara yangu ikoje')).toBe(true);
    expect(parseAdvisorRequest('nipe ushauri')).toBe(true);
  });

  it('stays narrow: a count is not a consultation', async () => {
    const { parseAdvisorRequest } = await import(
      '../../../../supabase/functions/_shared/whatsappAdvisor');
    for (const said of ['daftari ziko ngapi', 'nimeuza nyama kilo 2', 'leo nimeuza shingapi', 'mambo']) {
      expect(parseAdvisorRequest(said), said).toBe(false);
    }
  });
});

describe('when the model comes back with nothing', () => {
  it('says so, instead of handing back a menu of topics', () => {
    const webhook = readFileSync(
      resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(webhook).toContain('let assistantCameBackEmpty = false;');
    expect(webhook).toContain('assistantCameBackEmpty = true;');
    // The truth is narrower than "I can help you with Risip": the question was
    // understood and the answer did not arrive. It is now narrower still —
    // An operational failure now gets a context-aware next question and is not
    // written into conversational memory as if it were an assistant answer.
    expect(webhook).toContain('assistantClarificationQuestion(lang, body, pendingClarificationOf(convo))');
    expect(webhook).toContain('await replyQuietly(phone, failureReply, false);');
    const fallback = webhook.slice(webhook.indexOf('// Two honest outcomes and no third'));
    expect(fallback.indexOf('assistantClarificationQuestion'))
      .toBeLessThan(fallback.indexOf("t('onlyRisip', lang)"));
  });
});
