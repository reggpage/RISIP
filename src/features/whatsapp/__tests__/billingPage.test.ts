import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { billingBanner, daysUntil, type Subscription } from '@/features/billing/useBilling';
import { sw } from '@/i18n/sw';
import { swahiliOverrides } from '@/i18n/swahili_overrides';

// WHAT A SHOP SEES ON ITS OWN BILLING PAGE.
//
// There is no jsdom in this project, so a React render test is not available.
// That is not a reason to ship a page unverified: the decisions worth testing
// are not "did a div appear" but "which of five states does a shop see, and is
// there Swahili for it". Both are pure, and both are below.

const base: Subscription = {
  id: 's1',
  plan: 'kati',
  cycle: 'monthly',
  status: 'active',
  trial_ends_at: null,
  current_period_start: '2026-09-03',
  current_period_end: '2026-10-03',
  grace_until: null,
};

const inDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('which banner a shop sees', () => {
  it('shows NOTHING to a shop that has paid', () => {
    // The most important case. A page that warns a paid-up shop about money is
    // a page it learns to ignore.
    expect(billingBanner(base)).toEqual({ kind: 'none' });
  });

  it('shows nothing to a shop with no plan at all', () => {
    // Every company that existed before billing did is in this state.
    expect(billingBanner(null)).toEqual({ kind: 'none' });
  });

  it('shows nothing to a cancelled shop', () => {
    // It asked to stop. It has not been cut off mid-period, so a banner would
    // be an argument it did not start.
    expect(billingBanner({ ...base, status: 'cancelled' })).toEqual({ kind: 'none' });
  });

  it('counts the trial days down', () => {
    expect(billingBanner({ ...base, status: 'trialing', trial_ends_at: inDays(4) }))
      .toEqual({ kind: 'trial', daysLeft: 4 });
  });

  it('counts the grace days down when payment is late', () => {
    expect(billingBanner({ ...base, status: 'past_due', grace_until: inDays(2) }))
      .toEqual({ kind: 'overdue', daysLeft: 2 });
  });

  it('says nothing about days when there is no grace date', () => {
    // Null, not zero. Zero would render "last day" to somebody whose grace was
    // never set, which is a threat we cannot back up.
    expect(billingBanner({ ...base, status: 'past_due', grace_until: null }))
      .toEqual({ kind: 'overdue', daysLeft: null });
  });

  it('shows the suspension without a day count, because there is none left', () => {
    expect(billingBanner({ ...base, status: 'suspended', grace_until: inDays(-5) }))
      .toEqual({ kind: 'suspended' });
  });
});

describe('counting days', () => {
  it('is zero for today', () => {
    expect(daysUntil(new Date().toISOString().slice(0, 10))).toBe(0);
  });

  it('never goes negative, because "minus two days left" is not a sentence', () => {
    expect(daysUntil(inDays(-9))).toBe(0);
  });

  it('is null for a date that is not one', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil('')).toBeNull();
    expect(daysUntil('not-a-date')).toBeNull();
  });

  it('reads a full timestamp as its day', () => {
    expect(daysUntil(`${inDays(3)}T23:59:59Z`)).toBe(3);
  });
});

describe('the words exist, in both languages', () => {
  const english = sw.billing as Record<string, unknown>;
  const swahili = (swahiliOverrides as Record<string, Record<string, unknown>>).billing;

  it('has a Swahili translation for every English key', () => {
    // A missing key falls back to English silently. On a page about somebody's
    // money, half-English is worse than the fallback is designed for.
    const missing = Object.keys(english).filter((key) => !(key in swahili));
    expect(missing).toEqual([]);
  });

  it('translates every status a subscription can hold', () => {
    const statuses = ['trialing', 'active', 'past_due', 'suspended', 'cancelled'];
    for (const status of statuses) {
      expect((swahili.status as Record<string, string>)[status]).toBeTruthy();
    }
  });

  it('translates every state an invoice can hold', () => {
    for (const status of ['paid', 'open', 'failed', 'void']) {
      expect((swahili.invoiceStatus as Record<string, string>)[status]).toBeTruthy();
    }
  });

  it('says the same thing about counting as the WhatsApp copy does', () => {
    // The allowance counts messages the shop SENDS. If the page said otherwise
    // a shopkeeper would work out his own total and find it did not match.
    expect(String(swahili.usageNote)).toContain('Majibu ya Risip hayahesabiwi');
  });
});

describe('the page cannot change anything', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/routes/billing/BillingPage.tsx'), 'utf8');
  const hook = readFileSync(
    resolve(process.cwd(), 'src/features/billing/useBilling.ts'), 'utf8');

  it('never writes, updates or calls a paying function', () => {
    // Only a signed webhook may say a period was paid for. A button here that
    // could grant a month would be a second way to grant one, and the second
    // way is always the one nobody tests.
    for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', 'functions.invoke']) {
      expect(page).not.toContain(forbidden);
      expect(hook).not.toContain(forbidden);
    }
  });

  it('is reachable by the owner alone', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const at = app.indexOf('path="/billing"');
    expect(at).toBeGreaterThan(-1);
    expect(app.slice(at, at + 220)).toContain("allowed={['owner']}");
  });
});
