import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  businessSummaryFacts,
  calculateBusinessSummary,
} from '../../../../supabase/functions/_shared/whatsappReadTools';
import { buchaReportFacts } from '../../../../supabase/functions/_shared/whatsappBuchaReports';
import {
  enforceResolvedDateLabel,
  findFalseDateCaveat,
} from '../../../../supabase/functions/_shared/whatsappAssistant';
import { resolveDateRange } from '../../../../supabase/functions/_shared/whatsappDateRange';

// THE MODEL WAS TELLING THE TRUTH.
//
// MEASURED, on the owner's own number. He asked "Jana walifunga na shingapi"
// four times — 08:07, 09:20, 09:27, 09:53 — and every answer ended with some
// form of "Tarehe kamili ya jana haikutolewa na mfumo". Two of those came ten
// minutes AFTER a deploy that was supposed to have fixed it (v234 went out at
// 09:43:28; the commit was 09:43:05).
//
// Everyone read that sentence as the model lying, and four separate fixes were
// aimed at making it stop saying it: a prompt rule that says NEVER say the
// system did not provide the date, a caveat detector, a regex that strips the
// sentence, and a corrective round. All four are still in the codebase and all
// four are correct. None of them could ever have worked.
//
// The date genuinely was not in the evidence. get_business_summary resolves to
// ai_business_summary_facts, which is a member of snapshotTools, so EVERY
// summary — butchery or bookshop — is answered by buchaReportFacts. That
// function emitted `period=jana` and no date at all. businessSummaryFacts, the
// one that does emit period_dates and period_date_label, and the one every
// existing test exercised, is not reached on this path.
//
// So the model was handed "jana" with no date, said so honestly, and the guards
// no-opped exactly as designed: enforceResolvedDateLabel returns the answer
// untouched when there is no label to enforce, and findFalseDateCaveat returns
// nothing when the evidence contains neither field. Telemetry agrees —
// tool_rounds=1 on every one of those messages, meaning no correction ever
// fired.
//
// The lesson is the assertion below: supply the fact, do not argue with the
// model about a fact it does not have. And test the path production takes, not
// the one that reads best.

const snapshot = {
  sales: { total: 105_000, cash_sales: 105_000, credit_sales: 0, by_payment_method: {} },
  expenses: 0,
  customer_payments: 0,
  profit: {},
} as never;

const empty = calculateBusinessSummary([]);

// The Swahili long month for a resolved day word, computed the way the label
// itself is, so this test does not rot every time the wall clock crosses into
// a new month. "jana" on 2 Sep is Septemba; on 1 Sep it is Agosti; the test
// must accept whichever is true today.
const resolvedMonth = (said: string) => {
  const range = resolveDateRange(said);
  if (!range) throw new Error(`resolveDateRange returned null for "${said}"`);
  return new Intl.DateTimeFormat('sw-TZ', { month: 'long', timeZone: 'Africa/Dar_es_Salaam' })
    .format(new Date(range.from));
};

describe('every summary the assistant can receive carries its date', () => {
  // The invariant that was missing. Two builders answer the same question and
  // only one of them had the date; nothing anywhere required both to.
  const builders: Array<[string, (range: ReturnType<typeof resolveDateRange>) => string]> = [
    ['businessSummaryFacts', (range) => businessSummaryFacts(empty, 'today', 'sw', range)],
    ['buchaReportFacts', (range) => buchaReportFacts(snapshot, 'today', 'sw', range)],
  ];

  for (const [name, build] of builders) {
    it(`${name} states the exact day for "jana"`, () => {
      const facts = build(resolveDateRange('jana'));
      expect(facts).toMatch(/^period_dates=2026-\d{2}-\d{2}$/m);
      expect(facts).toMatch(/^period_date_label=.+\d{4}$/m);
    });

    it(`${name} states the exact day for "juzi"`, () => {
      const facts = build(resolveDateRange('juzi'));
      expect(facts).toMatch(/^period_dates=\d{4}-\d{2}-\d{2}$/m);
      expect(facts).toMatch(/^period_date_label=.+$/m);
    });

    it(`${name} states a date even when no period was named`, () => {
      const facts = build(null);
      expect(facts).toMatch(/^period_dates=/m);
      expect(facts).toMatch(/^period_date_label=/m);
    });
  }

  it('gives the two builders the SAME date for the same day', () => {
    // They answer the same question. A shop must not get one date from a
    // summary and another from the same summary on a different code path.
    const range = resolveDateRange('jana');
    const a = businessSummaryFacts(empty, 'today', 'sw', range)
      .match(/^period_dates=(.+)$/m)?.[1];
    const b = buchaReportFacts(snapshot, 'today', 'sw', range)
      .match(/^period_dates=(.+)$/m)?.[1];
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });
});

describe('the exact sentences the owner was shown, through the real path', () => {
  const throughRealPath = (said: string, live: string) => {
    const facts = buchaReportFacts(snapshot, 'today', 'sw', resolveDateRange(said));
    const evidence = [`${said} walifunga na shingapi`, facts];
    return { cleaned: enforceResolvedDateLabel(live, evidence), evidence };
  };

  it('no longer ends with "haikutolewa na mfumo" for jana', () => {
    const { cleaned, evidence } = throughRealPath(
      'jana',
      'Jana: mauzo TSh 105,000, faida ghafi TSh 84,250. Tarehe kamili ya "jana" haikutolewa na mfumo katika matokeo haya.',
    );
    expect(cleaned).not.toMatch(/haikutolewa|haikuwepo|haikupatikana/i);
    expect(cleaned).toContain(resolvedMonth('jana'));
    expect(findFalseDateCaveat(cleaned, evidence)).toHaveLength(0);
  });

  it('no longer ends with "haikutolewa na mfumo" for juzi', () => {
    const { cleaned } = throughRealPath(
      'juzi',
      'Juzi: mauzo TSh 0, faida ghafi TSh 0. Tarehe kamili ya "juzi" haikutolewa na mfumo katika matokeo haya.',
    );
    expect(cleaned).not.toMatch(/haikutolewa|haikuwepo|haikupatikana/i);
    expect(cleaned).toContain(resolvedMonth('juzi'));
  });

  it('handles the parenthesised form the first two replies used', () => {
    const { cleaned } = throughRealPath(
      'jana',
      'Jana, mauzo yalikuwa TSh 105,000, faida ghafi TSh 84,250. (Tarehe kamili haikutolewa na mfumo.)',
    );
    expect(cleaned).not.toContain('(Tarehe');
    expect(cleaned).toContain(resolvedMonth('jana'));
  });
});

describe('the path production actually takes', () => {
  const webhook = readFileSync(
    resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

  it('routes every business summary through the snapshot builder', () => {
    // This is the fact that made the older tests meaningless: they all called
    // businessSummaryFacts, which this branch bypasses.
    const set = webhook.slice(
      webhook.indexOf('const snapshotTools = new Set(['),
      webhook.indexOf('const snapshotTools = new Set([') + 260,
    );
    expect(set).toContain("'ai_business_summary_facts'");
    expect(webhook).toContain('return buchaReportFacts(');
  });
});
