import { describe, expect, it } from 'vitest';
import {
  buildAssistantSystemPrompt,
  findUnsafeProfitWording,
  findUngroundedNumbers,
  type AssistantIdentityContext,
} from '../../../../supabase/functions/_shared/whatsappAssistant';

// THE GUARD WAS REFUSING ARITHMETIC, NOT INVENTION.
//
// MEASURED, twice in a row on the owner's own number. He asked "Naomba ushauri
// wa biashara yangu" and telemetry recorded:
//
//   route=ai_outage_fallback  fallback_reason=model_empty
//   chosen_tool=get_business_advice  tool_rounds=1  latency=10.7s
//
// The model called the adviser, received the figures, wrote an answer — and the
// answer was thrown away for quoting a number no tool had returned. Four of
// seven ordinary adviser sentences were refused that way:
//
//   "chini ya 1% ya mauzo yako"    a percentage
//   "Bidhaa 4 zimeisha"            a count of items the tool had just listed
//
// Both are safe: a percentage is not a ledger figure at all, and counting items
// the tool has just listed invents nothing. Refusing them pushed the model
// towards vaguer answers rather than safer ones.
//
// A DIFFERENCE is not on that list, though I put it there first. Sales minus
// expenses ignores what the stock cost, so it reads high and it reads like
// profit — and the existing suite caught me within the minute.

const EVIDENCE = [[
  'business=Duka la Mfano',
  'period=mwezi huu',
  'revenue=3121150',
  'expenses=25700',
  // The figure whose absence killed four adviser turns in a row.
  'estimated_profit=1842300',
  'profit_coverage_pct=71',
  'top_product=nguvu ya sala|616500',
  'sold_below_cost_in_period=Velvet napkin|-1200',
  'sold_below_cost_in_period=Sodaa|-100',
  'out_of_stock=Birika,daftari,Dumu la maji,Sodaa',
].join('\n')];

const DAILY_PROFIT_EVIDENCE = [[
  'period=leo',
  'sales=105000',
  'cogs=20750',
  'gross_profit=84250',
  'expenses=0',
  'estimated_profit=84250',
  'coverage=1',
].join('\n')];

describe('arithmetic over the ledger’s own figures is grounded', () => {
  it('allows a figure quoted straight back', () => {
    expect(findUngroundedNumbers('Mauzo ya mwezi huu ni TSh 3,121,150.', EVIDENCE)).toEqual([]);
  });

  it('allows a sum', () => {
    // 1200 + 100. This one already worked.
    expect(findUngroundedNumbers('Hasara ya jumla ni TSh 1,300.', EVIDENCE)).toEqual([]);
  });

  it('still refuses a difference, because that is not profit', () => {
    // I allowed subtraction here so an adviser could say what the shop was left
    // with, and the existing suite caught it within the minute. Sales minus
    // expenses ignores what the stock cost: it reads high, and it reads like
    // profit. The prompt has said so all along, and the server's own
    // estimated_profit is in the payload for exactly this sentence.
    expect(findUngroundedNumbers('Umebakiwa na TSh 3,095,450 baada ya matumizi.', EVIDENCE))
      .toContain('3095450');
  });

  it('allows a percentage, which is not a ledger figure at all', () => {
    expect(findUngroundedNumbers('Matumizi ni chini ya 1% ya mauzo yako.', EVIDENCE)).toEqual([]);
    expect(findUngroundedNumbers('Mauzo yamepanda asilimia 43.', EVIDENCE)).toEqual([]);
  });

  it('allows counting the things the tool listed', () => {
    expect(findUngroundedNumbers('Bidhaa 4 zimeisha: Birika, daftari, Dumu la maji, Sodaa.', EVIDENCE)).toEqual([]);
  });

  it('still allows a numbered list', () => {
    expect(findUngroundedNumbers('1. Nunua Birika\n2. Acha dead stock', EVIDENCE)).toEqual([]);
  });
});

describe('the profit sentence, which is why the adviser kept failing', () => {
  // rejection_code said "1x7": one seven-digit token, refused. That is
  // 3,121,150 - 25,700 = 3,095,450 — the model deriving what the shop kept,
  // because the evidence gave it revenue and expenses and no profit at all.
  //
  // The fix was not to allow the subtraction. Revenue minus expenses ignores
  // what the stock cost: it reads high and it reads like profit. The server
  // computes the real figure now and hands it over.
  it('lets the adviser state what the shop kept', () => {
    expect(findUngroundedNumbers('Faida yako mwezi huu ni TSh 1,842,300.', EVIDENCE)).toEqual([]);
  });

  it('still refuses revenue minus expenses, the figure that was being derived', () => {
    expect(findUngroundedNumbers('Umebakiwa na TSh 3,095,450 baada ya matumizi.', EVIDENCE))
      .toContain('3095450');
  });

  it('lets the adviser state how much of the shop that figure covers', () => {
    expect(findUngroundedNumbers('Takwimu hii inagusa 71% ya mauzo yako.', EVIDENCE)).toEqual([]);
  });
});

describe('the protection is intact', () => {
  it('refuses a money figure the ledger never produced', () => {
    // This is the whole reason the guard exists. "Your profit is five million"
    // over a shop that made three has nowhere to come from.
    for (const [answer, expected] of [
      ['Faida yako ni TSh 5,000,000 mwezi huu.', '5000000'],
      ['Mauzo yako ni TSh 9,400,000.', '9400000'],
      ['Bei ya nguvu ya sala ni TSh 7,777.', '7777'],
    ] as const) {
      expect(findUngroundedNumbers(answer, EVIDENCE), answer).toContain(expected);
    }
  });

  it('refuses an invented stock level', () => {
    expect(findUngroundedNumbers('Una Birika 250 kwenye stoo.', EVIDENCE)).toContain('250');
  });

  it('refuses a rounded figure, and the prompt says why', () => {
    // "About 3.1M" is a different number from 3,121,150, and the shop cannot
    // check it against anything. The fix is to ask for the exact figure, not to
    // widen the guard until rounding slips through.
    expect(findUngroundedNumbers('Mauzo yamefika takribani TSh 3.1M.', EVIDENCE)).toContain('3');
    const prompt = buildAssistantSystemPrompt({
      identityId: 'i', profileId: 'p', companyId: 'c', companyName: 'Duka',
      userName: null, role: 'owner', lang: 'sw',
      approvalFlowEnabled: false, reversalEnabled: false, payoutsEnabled: false,
    } as AssistantIdentityContext);
    expect(prompt).toContain('Quote it exactly as the ledger has it');
  });

  it('refuses everything when there is no evidence at all', () => {
    expect(findUngroundedNumbers('Mauzo yako ni TSh 400,000.', [])).toContain('400000');
  });
});

describe('daily profit wording stays accounting-precise', () => {
  it('rejects the live ambiguous COGS/profit sentence', () => {
    const answer = 'Faida ya leo: TSh 84,250\n\n(Mauzo TSh 105,000, gharama za bidhaa TSh 20,750)';
    expect(findUnsafeProfitWording(answer, DAILY_PROFIT_EVIDENCE)).toEqual(['cogs_label', 'profit_label']);
  });

  it('allows precise gross-profit and after-expenses labels', () => {
    const answer = [
      'Faida baada ya matumizi yaliyorekodiwa leo (30 Ago): TSh 84,250',
      'Mauzo: TSh 105,000',
      'Gharama za bidhaa zilizouzwa (COGS): TSh 20,750',
      'Faida ghafi: TSh 84,250',
    ].join('\n');
    expect(findUnsafeProfitWording(answer, DAILY_PROFIT_EVIDENCE)).toEqual([]);
  });

  it('teaches the model the labels without turning the answer into a template', () => {
    const prompt = buildAssistantSystemPrompt({
      identityId: 'i', profileId: 'p', companyId: 'c', companyName: 'Duka',
      userName: null, role: 'owner', lang: 'sw',
      approvalFlowEnabled: false, reversalEnabled: false, payoutsEnabled: false,
    } as AssistantIdentityContext);
    expect(prompt).toMatch(/Gharama za bidhaa\s+zilizouzwa \(COGS\)/);
    expect(prompt).toMatch(/Faida\s+ghafi/);
    expect(prompt).toMatch(/Faida baada ya matumizi\s+yaliyorekodiwa/);
    expect(prompt).not.toMatch(/use this exact format|use these headings|say exactly/i);
  });
});
