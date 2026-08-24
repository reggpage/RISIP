import { describe, expect, it } from 'vitest';
import { route } from '../../../../scripts/lib/route';
import {
  advisorBrief,
  advisorEvidence,
  parseAdvisorRequest,
  parseSalesTrendRequest,
  partOfDay,
  salesTrendReply,
  timeGreeting,
  type AdvisorPayload,
} from '../../../../supabase/functions/_shared/whatsappAdvisor';
import {
  parseProductAnalyticsRequest,
  productAnalyticsReply,
  rankProducts,
  type ProductAggregate,
} from '../../../../supabase/functions/_shared/whatsappProductAnalytics';

// The shop's real month, as the web app showed it: Velvet napkin sold four for
// eight hundred against a five-hundred cost, and Sodaa one for two hundred
// against three. Both flagged "Below cost" on screen; both invisible in
// WhatsApp until now.
const items: ProductAggregate[] = [
  { product: 'nguvu ya sala', quantity: 47, revenue: 542_300, margin: 102_300, costed: true },
  { product: 'daftari', quantity: 248, revenue: 328_000, margin: 80_000, costed: true },
  { product: 'Velvet napkin', quantity: 4, revenue: 800, margin: -1_200, costed: true },
  { product: 'Sodaa', quantity: 1, revenue: 200, margin: -100, costed: true },
  { product: 'Biscuit', quantity: 3, revenue: 4_500, margin: null, costed: false },
];

describe('a question about loss', () => {
  // MEASURED FAILURE: asked "Je kuna hasara ya biashara?", Risip compared
  // sales against expenses, found sales larger, and said there was no loss —
  // while the same data showed two products sold below what they cost.
  it('is a margin question, not a cash question', () => {
    for (const said of [
      'Je kuna hasara yoyote?',
      'Je kuna hasara ya biashara?',
      'bidhaa gani inaleta hasara',
      'nini kinauzwa chini ya gharama',
    ]) {
      const request = parseProductAnalyticsRequest(said);
      expect(request?.rankBy, said).toBe('margin');
      expect(request?.direction, said).toBe('worst');
      expect(route(said), said).toBe('product_analytics');
    }
  });

  it('still reads a profit question as the best end', () => {
    const request = parseProductAnalyticsRequest('bidhaa gani ina faida kubwa');
    expect(request?.rankBy).toBe('margin');
    expect(request?.direction).toBe('best');
  });

  it('ranks the worst first, not the best', () => {
    const worst = rankProducts(items, 'margin', [], 'worst');
    expect(worst.map((item) => item.product).slice(0, 2)).toEqual(['Velvet napkin', 'Sodaa']);
    const best = rankProducts(items, 'margin', [], 'best');
    expect(best[0].product).toBe('nguvu ya sala');
  });

  it('answers with the losses and their figures', () => {
    const request = parseProductAnalyticsRequest('Je kuna hasara yoyote?');
    const said = productAnalyticsReply(request!, items, 'sw');
    expect(said).toContain('Ndiyo');
    expect(said).toContain('Velvet napkin');
    expect(said).toContain('−TSh 1,200');
    expect(said).toContain('Sodaa');
    expect(said).toContain('−TSh 100');
    // The winners have no business in an answer about losses.
    expect(said).not.toContain('nguvu ya sala');
  });

  it('says so plainly when nothing is below cost', () => {
    const request = parseProductAnalyticsRequest('Je kuna hasara yoyote?');
    const healthy = items.filter((item) => (item.margin ?? 0) >= 0);
    expect(productAnalyticsReply(request!, healthy, 'sw')).toContain('Hakuna bidhaa inayouzwa chini ya gharama');
  });
});

const payload: AdvisorPayload = {
  businessName: 'St. Ritha bookshop',
  periodLabel: 'mwezi huu',
  revenue: 2_393_250,
  expenses: 25_700,
  debtIssued: 0,
  customerPayments: 0,
  topMovers: [{ name: 'nguvu ya sala', quantity: 47, revenue: 542_300, margin: 102_300 }],
  belowCost: [
    { name: 'Velvet napkin', quantity: 4, revenue: 800, margin: -1_200 },
    { name: 'Sodaa', quantity: 1, revenue: 200, margin: -100 },
  ],
  deadStock: [{ name: 'rosali ya maria', onHand: 12, unit: null }],
  outOfStock: ['Birika', 'daftari', 'punch'],
  runningLow: [{ name: 'kamusi', onHand: 2, unit: null }],
  uncosted: ['Biscuit'],
  outstandingDebt: 40_000,
  topDebtors: [{ name: 'Juma', amount: 25_000 }],
};

describe('the adviser', () => {
  it('answers only when advice was asked for', () => {
    for (const said of ['nipe ushauri', 'biashara yangu ikoje', 'nifanye nini', 'how is my business']) {
      expect(parseAdvisorRequest(said), said).toBe(true);
    }
    for (const said of ['daftari ziko ngapi', 'nimeuza daftari 5', 'mambo vip', 'faida ya leo']) {
      expect(parseAdvisorRequest(said), said).toBe(false);
    }
  });

  // 08:00 and 21:00 in Dar es Salaam. The server runs in Frankfurt, three
  // hours behind, which is exactly why this has to be pinned.
  const morning = new Date('2026-08-24T05:00:00Z');
  const night = new Date('2026-08-24T18:00:00Z');

  it('uses the three sections the owner asked for', () => {
    const brief = advisorBrief(payload, 'sw', morning);
    expect(brief).toContain('📊 *Tathmini ya takwimu*');
    expect(brief).toContain('💡 *Ushauri wa MD*');
    expect(brief).toContain('🚀 *');
  });

  // MEASURED FAILURE: "Kazi ya kesho asubuhi" was said at seven in the
  // morning. Tomorrow is a day away; the thing to do is today, before opening.
  it('says WHEN by the clock in the shop, not by a fixed phrase', () => {
    expect(advisorBrief(payload, 'sw', morning)).toContain('🚀 *Kabla hujafungua leo*');
    expect(advisorBrief(payload, 'sw', night)).toContain('🚀 *Kesho asubuhi*');
    expect(advisorBrief(payload, 'en', morning)).toContain('🚀 *Before you open today*');
  });

  it('greets by the clock in the shop', () => {
    expect(timeGreeting('sw', morning)).toBe('Habari za asubuhi');
    expect(timeGreeting('sw', new Date('2026-08-24T11:00:00Z'))).toBe('Habari za mchana');
    expect(timeGreeting('sw', new Date('2026-08-24T15:00:00Z'))).toBe('Habari za jioni');
    expect(timeGreeting('en', night)).toBe('Good evening');
    expect(partOfDay(morning)).toBe('asubuhi');
  });

  // A record month with a leak in it is still leaking. The loss has to reach
  // the owner before the congratulations do.
  it('leads the advice with the money being lost', () => {
    const brief = advisorBrief(payload, 'sw', morning);
    expect(brief).toContain('Unauza chini ya gharama');
    expect(brief.indexOf('Ziba mtaji unaovuja')).toBeLessThan(brief.indexOf('Rudisha mzigo'));
    expect(brief).toContain('Velvet napkin');
  });

  it('gives at most three actions and exactly one thing to do', () => {
    const brief = advisorBrief(payload, 'sw', morning);
    expect(brief.match(/^\d\. /gm)?.length).toBeLessThanOrEqual(3);
    const tomorrow = brief.split('🚀 *Kabla hujafungua leo*\n')[1];
    expect(tomorrow.split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('has something honest to say about a shop with nothing wrong', () => {
    const clean: AdvisorPayload = {
      ...payload, belowCost: [], deadStock: [], outOfStock: [], uncosted: [],
      outstandingDebt: 0, topDebtors: [],
    };
    const brief = advisorBrief(clean, 'sw', morning);
    expect(brief).toContain('Endelea hivyo hivyo');
    expect(brief).toContain('nguvu ya sala');
  });

  // Every number the model is allowed to use, and no way to reach past them.
  it('hands the model figures rather than prose', () => {
    const evidence = advisorEvidence(payload);
    expect(evidence).toContain('revenue=2393250');
    expect(evidence).toContain('below_cost=Velvet napkin|qty=4|revenue=800|margin=-1200');
    expect(evidence).toContain('out_of_stock=punch');
    expect(evidence).toContain('debtor=Juma|amount=25000');
    expect(evidence).toContain('no_buying_cost=Biscuit');
  });
});

describe('what a shopkeeper must never receive', () => {
  // MEASURED FAILURE, MINE, on the owner's live number: when the model ran out
  // of tool rounds the fallback sent the raw tool content — key=value lines
  // followed by the whole ADVISER MODE prompt. Risip's own instructions arrived
  // as a WhatsApp message. Nothing in a tool result is written for a person
  // unless the tool says so.
  it('keeps instructions out of the tool result entirely', () => {
    const evidence = advisorEvidence(payload);
    expect(evidence).not.toContain('ADVISER MODE');
    expect(evidence).not.toContain('ANSWER THE QUESTION');
    expect(evidence).not.toMatch(/^[A-Z][A-Z ]{8,}$/m);
  });

  it('has a human rendering ready for when the model cannot answer', () => {
    const brief = advisorBrief(payload, 'sw', new Date('2026-08-24T05:00:00Z'));
    expect(brief).toContain('📊');
    expect(brief).not.toContain('=');
    expect(brief).not.toContain('ADVISER MODE');
  });
});

describe('why sales moved', () => {
  // The most useful question a shopkeeper asks, and the one Risip could not
  // touch: every read tool answered about ONE window, so "are sales falling"
  // had nothing to compare against and the model was left to reassure.
  it('recognises the question in the ways it gets asked', () => {
    for (const said of [
      'kwa nini mauzo yanashuka',
      'mbona mauzo yameshuka',
      'mauzo yanapungua',
      'why are sales down',
      'linganisha na wiki iliyopita',
    ]) {
      expect(parseSalesTrendRequest(said), said).toBe(true);
    }
    for (const said of ['nipe ushauri', 'daftari ziko ngapi', 'nimeuza daftari 5', 'faida ya leo']) {
      expect(parseSalesTrendRequest(said), said).toBe(false);
    }
  });

  const trend = {
    periodLabel: 'wiki hii',
    previousLabel: 'wiki iliyopita',
    revenue: 400_000,
    previousRevenue: 500_000,
    fell: [
      { name: 'daftari', before: 200_000, after: 90_000, delta: -110_000 },
      { name: 'kalamu', before: 40_000, after: 0, delta: -40_000 },
    ],
    rose: [{ name: 'Biblia', before: 0, after: 50_000, delta: 50_000 }],
    stopped: ['kalamu'],
  };

  it('gives the direction, the size and the products behind it', () => {
    const said = salesTrendReply(trend, 'sw');
    expect(said).toContain('yameshuka');
    expect(said).toContain('20%');
    expect(said).toContain('TSh 400,000');
    expect(said).toContain('TSh 500,000');
    expect(said).toContain('daftari');
    // A product that STOPPED is a different fact from one that fell.
    expect(said).toContain('Hazikuuzwa kabisa');
  });

  it('shows the risers when the move was upward', () => {
    const up = { ...trend, revenue: 600_000, fell: [], rose: trend.rose };
    const said = salesTrendReply(up, 'sw');
    expect(said).toContain('yamepanda');
    expect(said).toContain('Biblia');
  });

  // Dividing by a period that had no sales is not a percentage, it is an error
  // with a number printed on it.
  it('refuses to invent a percentage out of nothing', () => {
    const fresh = { ...trend, previousRevenue: 0, fell: [], rose: [] };
    const said = salesTrendReply(fresh, 'sw');
    expect(said).not.toContain('%');
    expect(said).toContain('siwezi kusema');
    const empty = { ...fresh, revenue: 0 };
    expect(salesTrendReply(empty, 'sw')).toContain('sina cha kulinganisha');
  });
});
