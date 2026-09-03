import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  billingDateLabel,
  billingDueSoon,
  billingOverdue,
  billingPaid,
  billingSuspended,
  parseBillingAnswer,
} from '../../../../supabase/functions/_shared/billingMessages';

// THE ONE MESSAGE THAT ASKS FOR SOMETHING.
//
// Everything else Risip sends tells a shopkeeper what happened. A bill asks
// him to hand money over, so it has to be shorter and plainer than the rest,
// and it must never be the thing that makes him feel his books are hostage.
//
// The rule that shapes all of it: say what has NOT stopped before saying what
// has.

const notice = {
  businessName: 'St. Ritha bookshop',
  planName: 'Kati',
  amountTzs: 39999,
  periodStart: '2026-10-03',
};

describe('the bill', () => {
  const said = billingDueSoon(notice, 'sw');

  it('carries the four facts and nothing else', () => {
    expect(said).toContain('St. Ritha bookshop');
    expect(said).toContain('Kati');
    expect(said).toContain('TSh 39,999');
    expect(said).toContain('3 Oktoba 2026');
  });

  it('says exactly what to type', () => {
    expect(said).toContain('Jibu *1* kulipa sasa');
    expect(said).toContain('*PLAN*');
  });

  it('promises nothing has been charged yet', () => {
    expect(said).toContain('Ombi la malipo litafika kwenye simu yako');
  });

  it('never mentions grace, because nothing is late', () => {
    expect(said).not.toContain('siku');
    expect(said).not.toContain('imesimama');
  });
});

describe('the late bill', () => {
  it('counts the days rather than saying "soon"', () => {
    const said = billingOverdue({ ...notice, graceDaysLeft: 2 }, 'sw');
    expect(said).toContain('siku *2* zaidi');
  });

  it('says plainly when today is the last one', () => {
    const said = billingOverdue({ ...notice, graceDaysLeft: 0 }, 'sw');
    expect(said).toContain('Leo ni siku ya mwisho');
    expect(said).not.toContain('*0*');
  });

  it('never claims anything has stopped, because it has not', () => {
    expect(billingOverdue({ ...notice, graceDaysLeft: 1 }, 'sw'))
      .not.toContain('imesimama');
  });
});

describe('the suspension', () => {
  const said = billingSuspended(notice, 'sw');

  it('says what has NOT stopped first', () => {
    const safe = said.indexOf('Rekodi zako zote zipo salama');
    const stopped = said.indexOf('Kilichosimama');
    expect(safe).toBeGreaterThan(-1);
    expect(safe).toBeLessThan(stopped);
  });

  it('promises the books are readable', () => {
    expect(said).toContain('unaweza kuziona wakati wowote');
  });

  it('offers the way back in the same breath', () => {
    expect(said).toContain('Jibu *1* kulipa');
    expect(said).toContain('unaendelea papo hapo');
  });
});

describe('the receipt', () => {
  it('names the date the shop has bought up to', () => {
    expect(billingPaid(notice, '2026-11-03', 'sw'))
      .toContain('hadi *3 Novemba 2026*');
  });
});

describe('dates a shopkeeper reads', () => {
  it('is written the way a person says it', () => {
    expect(billingDateLabel('2026-10-03', 'sw')).toBe('3 Oktoba 2026');
  });

  it('hands back anything it cannot read rather than inventing a date', () => {
    expect(billingDateLabel('', 'sw')).toBe('');
    expect(billingDateLabel('not-a-date', 'sw')).toBe('not-a-date');
  });
});

describe('the reply to a bill', () => {
  it('reads the one character the message asked for', () => {
    expect(parseBillingAnswer('1')).toBe('pay');
    expect(parseBillingAnswer('lipa')).toBe('pay');
    expect(parseBillingAnswer('NDIYO')).toBe('pay');
  });

  it('reads the two escapes', () => {
    expect(parseBillingAnswer('PLAN')).toBe('plan');
    expect(parseBillingAnswer('ghairi')).toBe('cancel');
  });

  it('is not fooled by punctuation or spacing', () => {
    expect(parseBillingAnswer(' 1. ')).toBe('pay');
    expect(parseBillingAnswer('*1*')).toBe('pay');
  });

  it('refuses a SENTENCE, so it reaches the model instead', () => {
    // The owner's standing rule: the parser takes one-word commands and
    // confirmations, the model takes language. A shopkeeper asking why the
    // bill is what it is must not be read as agreeing to pay it.
    expect(parseBillingAnswer('kwa nini bili ni kubwa hivi?')).toBeNull();
    expect(parseBillingAnswer('nitalipa kesho')).toBeNull();
    expect(parseBillingAnswer('lipa kesho')).toBeNull();
    expect(parseBillingAnswer('nimeuza soda 5')).toBeNull();
    expect(parseBillingAnswer('')).toBeNull();
  });
});

describe('the sender knows the new kinds', () => {
  const shared = readFileSync(
    resolve(process.cwd(), 'supabase/functions/_shared/whatsappNotifications.ts'), 'utf8');

  it('routes all three billing kinds to their own words', () => {
    for (const kind of ['billing_due', 'billing_overdue', 'billing_suspended']) {
      expect(shared).toContain(`case '${kind}':`);
    }
  });

  it('leaves the close reminder exactly as it was', () => {
    // NEGATIVE CONTROL on the wiring: a billing branch that swallowed the
    // existing reminder would be invisible until somebody's day did not close.
    expect(shared).toContain('billingBody(claim) ?? closeReminderReply(name, recorded, claim.lang)');
  });

  it('records why billing rides the existing queue', () => {
    expect(shared).toContain('a second delivery path for');
  });
});
