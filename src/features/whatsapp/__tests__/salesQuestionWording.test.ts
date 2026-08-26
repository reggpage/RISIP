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
