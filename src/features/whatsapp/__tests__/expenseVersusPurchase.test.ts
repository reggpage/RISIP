import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS, buildAssistantSystemPrompt } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { calculateProfitEstimate } from '../../../../supabase/functions/_shared/whatsappReadTools';

// MATUMIZI IS NOT MANUNUZI, AND THE CONTRACT WAS FORCING IT TO BE.
//
// MEASURED against this shop's whole history, sixteen records:
//
//   16 Aug  "Nauli"                                          -> expense        ✓
//   16 Aug  "Chakula"                                        -> expense        ✓
//   16 Aug  "Matumizi"                                       -> expense        ✓
//   27 Aug  "chakula"                                        -> expense        ✓
//   22 Aug  "matumizi nimenunua chakula nimetumia nauli"     -> stock_purchase ✗
//
// The noun was never the problem. The VERB was. Every short expense landed
// correctly; the one sentence carrying "nimenunua" did not.
//
// And it was not the model guessing badly — the contract left it nowhere else
// to go. The routing rule said anything that MOVES PRODUCTS OR STOCK goes to
// propose_business_event, "nimenunua chakula" is plainly a thing arriving, and
// propose_business_event has no expense in its enum at all. Once that sentence
// routed, stock_purchase was the only slot left in the tool it had been sent
// to. This is the same failure as Stage A.1: the model understood the message
// and the contract had nowhere to put it.
//
// It costs money, in one direction. Profit is sales - cogs - expenses; a stock
// purchase is inventory and is deliberately NOT subtracted, because it is
// counted through cost of goods when the thing sells. So filing an expense as
// a purchase leaves it out of the day's costs and reports the profit too high
// — by exactly the 7,500 in that record.

const prompt = buildAssistantSystemPrompt({
  identityId: 'id', profileId: 'pid', companyId: 'cid',
  lang: 'sw', userName: 'Asha', companyName: 'St. Ritha bookshop', role: 'owner',
  approvalFlowEnabled: false, reversalEnabled: false, payoutsEnabled: false,
});
const business = ASSISTANT_TOOLS.find((tool) => tool.name === 'propose_business_event');
const money = ASSISTANT_TOOLS.find((tool) => tool.name === 'propose_money_event');

describe('why it went wrong, stated so it cannot quietly come back', () => {
  it('leaves propose_business_event with no expense to fall into', () => {
    // This is the hole, and it stays open on purpose: an expense is not a
    // stock movement and does not belong in this tool. Which is exactly why
    // the ROUTING has to be right — there is no recovering from it here.
    const schema = business?.input_schema as { properties: { kind: { enum: string[] } } };
    expect(schema.properties.kind.enum).not.toContain('expense');
  });

  it('keeps the expense where an expense can actually be recorded', () => {
    const schema = money?.input_schema as { properties: { kind: { enum: string[] } } };
    expect(schema.properties.kind.enum).toContain('expense');
  });
});

describe('the test that decides it', () => {
  it('is what happens to the thing next, not that it was bought', () => {
    expect(prompt).toContain('BUYING IS NOT WHAT MAKES IT STOCK');
    expect(prompt).toMatch(/goods the shop will SELL are stock_purchase/);
    expect(prompt).toMatch(/things it USED UP are an expense/);
  });

  it('refuses to settle it on the noun, because the noun cannot settle it', () => {
    // A word list would have been the quick fix and the wrong one: the same
    // word is stock in one shop and spending in another, so any list is wrong
    // for half the shops on the platform.
    expect(prompt).toMatch(/rice is stock in a food shop and lunch in a bookshop/);
    expect(prompt).toMatch(/The noun cannot settle it/);
    expect(prompt).toMatch(/the test is what THIS shop trades/);
  });

  it('believes a trader who has already called it spending', () => {
    // "matumizi" opened that sentence. They had said what it was.
    expect(prompt).toMatch(/when they have already called it spending, believe them/);
  });

  it('says the fence on BOTH sides of the contract', () => {
    // Stated once, on the tool the message never reaches, changes nothing.
    expect(business?.description).toMatch(/belong to propose_money_event/);
    expect(money?.description).toMatch(/USED UP is an expense HERE even though it is a thing/);
  });

  it('tells the model what the mistake costs, not merely that it is one', () => {
    expect(prompt).toMatch(/reports the profit too high/);
  });
});

describe('the money at stake, computed rather than asserted', () => {
  const day = '2026-08-22T09:00:00Z';
  const row = (kind: string, amount: number) =>
    ({ kind, status: 'confirmed', amount, partyName: null, occurredAt: day });

  it('subtracts an expense from the day and a purchase not at all', () => {
    // Not a quirk — this is correct accounting, and it is the reason the
    // misfiling matters. Stock is not gone, it is on the shelf; it becomes a
    // cost when it sells.
    const sales = [row('sale', 50_000)];
    const asExpense = calculateProfitEstimate([...sales, row('expense', 7_500)], [], []);
    const asPurchase = calculateProfitEstimate([...sales, row('stock_purchase', 7_500)], [], []);
    expect(asExpense.estimatedProfit).toBe(42_500);
    expect(asPurchase.estimatedProfit).toBe(50_000);
    expect(asPurchase.estimatedProfit - asExpense.estimatedProfit).toBe(7_500);
  });

  it('overstates and never understates, which is the dangerous direction', () => {
    // A shopkeeper told they earned less than they did checks the books. One
    // told they earned more does not.
    const wrong = calculateProfitEstimate([row('sale', 20_000), row('stock_purchase', 7_500)], [], []);
    const right = calculateProfitEstimate([row('sale', 20_000), row('expense', 7_500)], [], []);
    expect(wrong.estimatedProfit).toBeGreaterThan(right.estimatedProfit);
  });
});
