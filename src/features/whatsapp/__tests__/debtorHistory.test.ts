import { describe, expect, it } from 'vitest';
import {
  type DebtRow,
  calculateDebtorHistories,
  debtorAgeingFacts,
  debtorAgeingReply,
  debtorHistoryFacts,
  debtorHistoryReply,
} from '../../../../supabase/functions/_shared/whatsappDebtors';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';

// HOW OLD A DEBT IS, which Risip could not say at all.
//
// get_open_debts returns issued, paid and balance — a number with no time in
// it. Every real question a shopkeeper has about credit is about time: who has
// carried a balance longest, when somebody last paid anything, how old this
// particular debt is. None of them had anywhere to land.
//
// Payments settle against the OLDEST debt first. That is how a shopkeeper
// thinks about it, and it is the only way "how long has this been owed" has an
// answer at all: a customer owing 50,000 across four purchases who pays 10,000
// has cleared the first purchase, not a tenth of each.

const NOW = new Date('2026-08-29T09:00:00Z'); // 12:00 EAT

const at = (date: string) => `${date}T09:00:00Z`;
const debt = (party: string, date: string, amount: number): DebtRow =>
  ({ kind: 'debt_issued', status: 'confirmed', amount, partyName: party, occurredAt: at(date) });
const paid = (party: string, date: string, amount: number): DebtRow =>
  ({ kind: 'customer_payment', status: 'confirmed', amount, partyName: party, occurredAt: at(date) });

describe('settling oldest first', () => {
  it('clears the first purchase, not a slice of every one', () => {
    const [anna] = calculateDebtorHistories([
      debt('Mama Anna', '2026-08-01', 20_000),
      debt('Mama Anna', '2026-08-20', 30_000),
      paid('Mama Anna', '2026-08-22', 20_000),
    ], NOW);
    expect(anna.balance).toBe(30_000);
    // The August 1st debt is gone. What is outstanding is the 20th's.
    expect(anna.oldestUnpaidDate).toBe('2026-08-20');
    expect(anna.oldestUnpaidDays).toBe(9);
  });

  it('keeps the remainder of a part-paid debt at its own age', () => {
    const [juma] = calculateDebtorHistories([
      debt('Juma', '2026-08-05', 50_000),
      paid('Juma', '2026-08-25', 10_000),
    ], NOW);
    expect(juma.balance).toBe(40_000);
    // Part-paying does not make a debt younger.
    expect(juma.oldestUnpaidDate).toBe('2026-08-05');
    expect(juma.oldestUnpaidDays).toBe(24);
  });

  it('reports a customer who has never paid', () => {
    const [neema] = calculateDebtorHistories([debt('Neema', '2026-07-30', 5_000)], NOW);
    expect(neema.lastPaymentDate).toBeNull();
    expect(neema.lastPaymentDays).toBeNull();
    expect(neema.oldestUnpaidDays).toBe(30);
  });

  it('has no oldest unpaid once the balance is cleared', () => {
    const [asha] = calculateDebtorHistories([
      debt('Asha', '2026-08-01', 10_000),
      paid('Asha', '2026-08-02', 10_000),
    ], NOW);
    expect(asha.balance).toBe(0);
    expect(asha.oldestUnpaidDate).toBeNull();
    expect(asha.lastPaymentDate).toBe('2026-08-02');
  });

  it('ignores drafts and rows with no customer', () => {
    // An unconfirmed draft is not a debt, and a debt with nobody's name on it
    // cannot be chased.
    const histories = calculateDebtorHistories([
      { kind: 'debt_issued', status: 'pending', amount: 9_000, partyName: 'Ghost', occurredAt: at('2026-08-01') },
      { kind: 'debt_issued', status: 'confirmed', amount: 9_000, partyName: '  ', occurredAt: at('2026-08-01') },
      { kind: 'sale', status: 'confirmed', amount: 9_000, partyName: 'Anna', occurredAt: at('2026-08-01') },
    ], NOW);
    expect(histories).toEqual([]);
  });
});

describe('the order to make calls in', () => {
  const histories = calculateDebtorHistories([
    debt('Mama Anna', '2026-08-27', 45_000),
    debt('Juma', '2026-06-10', 12_000),
    debt('Asha', '2026-08-01', 80_000),
    paid('Asha', '2026-08-03', 80_000),
  ], NOW);

  it('puts the oldest debt first, not the biggest', () => {
    // The biggest debt is usually the best customer. The oldest one is the
    // problem, and it is the one worth a phone call this morning.
    expect(histories.map((one) => one.partyName)).toEqual(['Juma', 'Mama Anna', 'Asha']);
    expect(histories[0].oldestUnpaidDays).toBe(80);
  });

  it('drops the settled customer out of the owing list', () => {
    const said = debtorAgeingReply(histories, 'sw');
    expect(said).not.toContain('Asha');
    expect(said).toContain('*Juma* — TSh 12,000 · siku 80');
    expect(said).toContain('hajawahi kulipa');
  });

  it('says so plainly when nobody owes anything', () => {
    expect(debtorAgeingReply([], 'sw')).toBe('Hakuna mtu anayekudai kwa sasa.');
  });
});

describe('what the model is handed', () => {
  const [anna] = calculateDebtorHistories([
    debt('Mama Anna', '2026-08-01', 20_000),
    paid('Mama Anna', '2026-08-22', 5_000),
  ], NOW);

  it('carries the dates and the ages, not prose', () => {
    const facts = debtorHistoryFacts(anna);
    expect(facts).toContain('debtor=Mama Anna');
    expect(facts).toContain('balance=15000');
    expect(facts).toContain('oldest_unpaid=2026-08-01');
    expect(facts).toContain('days_outstanding=28');
    expect(facts).toContain('last_payment=2026-08-22');
    expect(facts).toContain('took=2026-08-01|20000');
    expect(facts).toContain('paid=2026-08-22|5000');
    expect(facts).not.toContain('TSh');
  });

  it('names never rather than inventing a date', () => {
    const [neema] = calculateDebtorHistories([debt('Neema', '2026-08-10', 3_000)], NOW);
    expect(debtorHistoryFacts(neema)).toContain('last_payment=never');
    expect(debtorAgeingFacts([neema])).toContain('days_since_payment=never');
  });

  it('says the customer is unknown rather than guessing one', () => {
    expect(debtorHistoryReply(null, 'Mama Zawadi', 'sw'))
      .toBe('Sina rekodi ya deni la Mama Zawadi.');
  });
});

describe('the tool, and what it may not do', () => {
  const tool = ASSISTANT_TOOLS.find((entry) => entry.name === 'get_debtor_history');

  it('is offered for the questions that are about time', () => {
    expect(tool).toBeTruthy();
    expect(tool?.description).toMatch(/nani amekaa na deni muda mrefu zaidi/);
    expect(tool?.description).toMatch(/alilipa lini/);
    // And why get_open_debts is the wrong one for those.
    expect(tool?.description).toMatch(/a debt with no age is not a debt anybody can chase/i);
  });

  it('carries one field, and it is the shopkeeper own wording', () => {
    const schema = tool?.input_schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(['party_wording']);
    const json = JSON.stringify(tool);
    for (const forbidden of ['"amount"', '"balance"', '"company_id"', '"confirmed"']) {
      expect(json).not.toContain(forbidden);
    }
  });
});
