import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Obligation,
  obligationFacts,
  obligationListReply,
  obligationName,
  obligationReminderReply,
  obligationSetReply,
  periodName,
} from '../../../../supabase/functions/_shared/whatsappObligations';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';

// RENT, and everything else that arrives whether you sold anything or not.
//
// The owner's words: "tumesahau swala la kodi ni lazima system imuulize mteja
// gharama za jengo kila mwezi ni shingapi kuna wengine wanalipa mwezi, miezi
// mitatu, miezi 6 na wengine mwaka". A shop could be told its profit every day
// for a month and never be told the rent falls due on Friday.
//
// Three decisions were taken rather than asked again, and each is a test here:
// a payment records the period it COVERS; a half payment does not move the due
// date; and a raise is a new fact, not a correction, so last year's rent stays
// answerable.

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0150_recurring_obligations.sql'), 'utf8');

const rent = (over: Partial<Obligation> = {}): Obligation => ({
  id: 'o1', kind: 'rent', label: null, amount: 200_000, periodMonths: 1,
  nextDueOn: '2026-09-05', daysUntilDue: 6, paidForCurrentPeriod: 0,
  outstanding: 200_000, lastPaidOn: null, previousAmount: null,
  ...over,
});

describe('how it is named and how often it comes', () => {
  it('says the kind in the shop’s own language', () => {
    expect(obligationName(rent(), 'sw')).toBe('Kodi ya jengo');
    expect(obligationName(rent({ label: 'duka la pili' }), 'sw'))
      .toBe('Kodi ya jengo (duka la pili)');
  });

  it('covers every period a shopkeeper actually pays on', () => {
    // The owner named four: monthly, three months, six months, yearly.
    expect(periodName(1, 'sw')).toBe('kila mwezi');
    expect(periodName(3, 'sw')).toBe('kila miezi 3');
    expect(periodName(6, 'sw')).toBe('kila miezi 6');
    expect(periodName(12, 'sw')).toBe('kila mwaka');
  });
});

describe('what the shopkeeper is shown', () => {
  it('states overdue as overdue, not as a negative number', () => {
    // "Due in -3 days" is a number nobody reads.
    const said = obligationListReply([rent({ daysUntilDue: -3 })], 'sw');
    expect(said).toContain('Ilipaswa kulipwa siku 3 zilizopita');
    expect(said).not.toContain('-3');
  });

  it('says today when it is today', () => {
    expect(obligationListReply([rent({ daysUntilDue: 0 })], 'sw')).toContain('leo');
  });

  it('shows both halves of a half payment', () => {
    // A half payment is not a status. It is a subtraction, and both what went
    // in and what is still short matter.
    const said = obligationListReply([
      rent({ paidForCurrentPeriod: 80_000, outstanding: 120_000 }),
    ], 'sw');
    expect(said).toContain('Umelipa TSh 80,000');
    expect(said).toContain('imebaki *TSh 120,000*');
  });

  it('marks a settled period as paid', () => {
    expect(obligationListReply([
      rent({ paidForCurrentPeriod: 200_000, outstanding: 0 }),
    ], 'sw')).toContain('✅ Imelipwa');
  });

  it('says what the rent used to be when the landlord raises it', () => {
    const said = obligationListReply([
      rent({ amount: 250_000, previousAmount: 200_000 }),
    ], 'sw');
    expect(said).toContain('Ilikuwa TSh 200,000');
    expect(said).toContain('imepandishwa');
  });

  it('asks for it in words when nothing is recorded yet', () => {
    const said = obligationListReply([], 'sw');
    expect(said).toContain('Hujaniambia gharama zozote');
    expect(said).toContain('kodi ya jengo ni 200000 kila mwezi');
  });
});

describe('what the model is handed', () => {
  it('carries dates and figures, not prose', () => {
    const facts = obligationFacts([
      rent({ paidForCurrentPeriod: 80_000, outstanding: 120_000, previousAmount: 200_000, amount: 250_000 }),
    ], '2026-08-30');
    expect(facts).toContain('today=2026-08-30');
    expect(facts).toContain('cost=rent|amount=250000|every_months=1');
    expect(facts).toContain('next_due=2026-09-05');
    expect(facts).toContain('outstanding=120000');
    expect(facts).toContain('was=200000');
    expect(facts).not.toContain('TSh');
  });

  it('says none rather than inventing an empty list', () => {
    expect(obligationFacts([], '2026-08-30')).toBe('recurring_costs=none_recorded');
  });
});

describe('the reminder', () => {
  it('counts down, and says today on the day', () => {
    expect(obligationReminderReply(rent({ daysUntilDue: 5 }), 'sw')).toContain('siku *5*');
    expect(obligationReminderReply(rent({ daysUntilDue: 0 }), 'sw')).toContain('*leo*');
  });

  it('asks for what is left, not the whole amount, on a part-paid period', () => {
    const said = obligationReminderReply(
      rent({ daysUntilDue: 0, paidForCurrentPeriod: 80_000, outstanding: 120_000 }), 'sw');
    expect(said).toContain('TSh 120,000');
    expect(said).not.toContain('TSh 200,000');
  });
});

describe('what changing it keeps', () => {
  it('tells the shop the old figure survives', () => {
    const said = obligationSetReply('Kodi ya jengo', 250_000, 1, '2026-09-05', 200_000, 'sw');
    expect(said).toContain('Ilikuwa TSh 200,000');
    expect(said).toContain('kodi ya mwaka jana bado inajulikana');
  });

  it('says nothing about a previous figure on the first one', () => {
    const said = obligationSetReply('Kodi ya jengo', 200_000, 1, '2026-09-05', null, 'sw');
    expect(said).not.toContain('Ilikuwa');
    expect(said).toContain('Malipo yanayofuata: 2026-09-05');
  });
});

describe('the ledger rules it inherits', () => {
  it('supersedes rather than edits', () => {
    // "Mwenye nyumba amepandisha kodi" is a new fact from a date, not a
    // correction of an old one.
    expect(migration).toContain('set superseded_at = clock_timestamp()');
    expect(migration).not.toMatch(/update public\.recurring_obligations\s+set amount/);
  });

  it('records the period a payment BOUGHT, not only the day it left', () => {
    // Six months paid at once is one cash movement and six months of rent, and
    // a shop needs both readings.
    expect(migration).toContain('covers_from date not null');
    expect(migration).toContain('covers_to date not null');
    expect(migration).toContain("(v_obligation.period_months || ' months')::interval");
  });

  it('does not let a half payment silence the reminder', () => {
    expect(migration).toContain('if v_outstanding <= 0 then');
    expect(migration).toContain('-- payment must not make the reminder go quiet.');
  });

  it('stops a whole-shop cost at owner and accountant', () => {
    expect(migration).toContain("private.auth_role() = any (array['owner'::user_role, 'accountant'::user_role])");
  });
});

describe('the tools, and the authority they do not have', () => {
  const setter = ASSISTANT_TOOLS.find((tool) => tool.name === 'propose_recurring_cost');
  const reader = ASSISTANT_TOOLS.find((tool) => tool.name === 'get_recurring_costs');

  it('takes the figure as words plus a checkable reading', () => {
    const schema = setter?.input_schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toContain('amount_wording');
    expect(Object.keys(schema.properties)).toContain('amount_candidate');
    // Never a bare number the model chose.
    expect(Object.keys(schema.properties)).not.toContain('amount');
    expect(Object.keys(schema.properties)).not.toContain('period_months');
  });

  it('accepts the phrasings the owner actually named', () => {
    expect(setter?.description).toMatch(/kila miezi mitatu/);
    expect(setter?.description).toMatch(/amepandisha kodi/);
    expect(setter?.description).toMatch(/kwa mwaka/);
  });

  it('says a raise is kept rather than overwritten', () => {
    expect(setter?.description).toMatch(/kept as a NEW fact/i);
  });

  it('warns that these are not daily records', () => {
    // Asking get_business_summary about rent answers a different question.
    expect(reader?.description).toMatch(/NOT daily records/i);
    expect(reader?.description).toMatch(/nalipa kodi lini/);
  });
});
