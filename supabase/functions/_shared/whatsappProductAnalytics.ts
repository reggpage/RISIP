import type { Lang } from './whatsappIntent.ts';
import { resolveDateRange } from './whatsappDateRange.ts';

export type ProductRankBy = 'quantity' | 'revenue' | 'margin';
export type ProductPeriod = 'today' | 'week' | 'month' | 'year';

export type ProductAnalyticsRequest = {
  rankBy: ProductRankBy;
  period: ProductPeriod;
  compareNames: string[];
  /** Exact server-resolved window for jana/juzi/specific dates. */
  range?: { from: string; to: string; sw: string; en: string } | null;
};

export type ProductAnalyticsContext = {
  kind: 'product_analytics_context';
  request: ProductAnalyticsRequest;
  focusNames: string[];
};

export type ProductSaleLine = {
  description: string;
  quantity: number;
  lineTotal: number;
  occurredAt: string;
};

export type ProductCostPoint = {
  productKey: string;
  unitCost: number;
  effectiveFrom: string;
};

export type ProductAggregate = {
  product: string;
  quantity: number;
  revenue: number;
  margin: number | null;
  costed: boolean;
};

const clean = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

export function parseProductAnalyticsRequest(text: string | null | undefined, now = new Date()): ProductAnalyticsRequest | null {
  const value = clean(text ?? '');
  if (!value) return null;
  // MEASURED FAILURE: "Bidhaa gani zimeisha" — which products have RUN OUT —
  // was answered with a ranking of which products sold most. Both questions
  // start "bidhaa gani", and this parser saw its own words first. What is
  // finished is a stock question and belongs to the shelf, not to a league
  // table of sales.
  if (/\b(?:zimeisha|zilizoisha|zimekwisha|kimeisha|out of stock)\b/.test(value)) return null;
  const asksProduct = /(?:\b(?:bidhaa|bidha|product|products)\b.*\b(?:gani|which|zote|inauza|inauzika|imeuzwa|iliuzwa|ninazouza|ninauza|selling|sold|faida|profit|revenue|mapato)\b)|(?:\b(?:inauza zaidi|inauza sana|inauza ngapi|imeuzw\w* ngap\w*|iliuzwa ngapi|(?:ina|kina)uzika sana|nini (?:kiliuza|iliuza|kiliuzwa|iliyouzwa) (?:zaidi|sana)|best selling|(?:what |wht )?sold (?:the )?most|top)\b)/.test(value);
  // MEASURED FAILURE: "nini kimeuzika leo" — what sold today — was answered
  // with the day's cash summary, because this parser only recognised the
  // question when it carried the word "bidhaa". A shopkeeper asking what moved
  // says "nini", not "bidhaa gani".
  const asksWhatSold = /^(?:nini|vitu gani|what)(?:\s+na\s+nini)?\s+(?:ki|zi|vi)?(?:me|li)uz\w*/i.test(value);
  const asksProfit = /\b(faida|margin|profit|earn)\b/.test(value);
  const asksRevenue = /\b(mapato|revenue|money|fedha nyingi|pesa nyingi)\b/.test(value);
  // A bare "faida ya leo" is a period profit question, not a product ranking.
  // Product analytics only claims messages that explicitly mention products or
  // selling; this prevents it from stealing the future profit-intent route.
  if (!asksProduct && !asksWhatSold) return null;

  const period: ProductPeriod = /\b(leo|today)\b/.test(value)
    ? 'today'
    : /\b(wiki|week)\b/.test(value)
      ? 'week'
      : /\b(mwezi|month)\b/.test(value)
        ? 'month'
        : /\b(mwaka|year)\b/.test(value) ? 'year' : 'month';
  const rankBy: ProductRankBy = asksProfit ? 'margin' : asksRevenue ? 'revenue' : 'quantity';
  const compareMatch = value.match(/^(.+?)\s+(?:au|or)\s+(.+?)(?:\s+(?:ipi|which|inauza|sells|inauzika)\b|\s*$)/u);
  const namedProductMatch = value.match(/^(.+?)\s+(?:inauza|inauzika|imeuzwa|iliuzwa|sold)\s+(?:ngapi|sana|zaidi|vipi|most)\b/u);
  const namedProduct = namedProductMatch?.[1].trim();
  const isGenericProductPhrase = Boolean(namedProduct && /^(?:bidhaa|bidha|product|products|kitu|what|which)\b/.test(namedProduct));
  const compareNames = compareMatch
    ? [clean(compareMatch[1]), clean(compareMatch[2])].filter(Boolean).slice(0, 2)
    : namedProduct && !isGenericProductPhrase ? [clean(namedProduct)] : [];
  const resolved = resolveDateRange(text ?? '', now);
  const range = resolved ? {
    from: resolved.from.toISOString(), to: resolved.to.toISOString(), sw: resolved.sw, en: resolved.en,
  } : null;
  return { rankBy, period, compareNames, ...(range ? { range } : {}) };
}

export function parseProductAnalyticsFollowUp(
  text: string | null | undefined,
  context: ProductAnalyticsContext | null | undefined,
  now = new Date(),
): ProductAnalyticsRequest | null {
  if (!context || context.kind !== 'product_analytics_context' || context.focusNames.length === 0) return null;
  const value = clean(text ?? '');
  if (!value) return null;
  const period: ProductPeriod = /\b(leo|today)\b/.test(value)
    ? 'today'
    : /\b(wiki|week)\b/.test(value)
      ? 'week'
      : /\b(mwezi|month)\b/.test(value)
        ? 'month'
        : /\b(mwaka|year)\b/.test(value) ? 'year' : context.request.period;
  const asksRevenue = /^(?:na\s+)?(?:jumla|jumla yake|jumla yao|mapato|mapato yake|mapato yao|revenue|total|total revenue|how much money)(?:\s+(?:ni|is|je))?\??$/.test(value);
  const asksMargin = /^(?:na\s+)?(?:faida|faida yake|faida yao|profit|margin|what about profit)(?:\s+(?:ni|is|je))?\??$/.test(value);
  const asksQuantity = /^(?:na\s+)?(?:ngapi|idadi|idadi yake|imeuzwa ngapi|inauza ngapi|quantity|how many)(?:\s+(?:leo|today|je))?\??$/.test(value);
  const changesPeriodOnly = /^(?:na\s+)?(?:leo|today|wiki hii|this week|mwezi huu|this month|mwaka huu|this year)(?:\s+je)?\??$/.test(value);
  if (!asksRevenue && !asksMargin && !asksQuantity && !changesPeriodOnly) return null;
  const resolved = resolveDateRange(text ?? '', now);
  const range = resolved ? {
    from: resolved.from.toISOString(), to: resolved.to.toISOString(), sw: resolved.sw, en: resolved.en,
  } : context.request.range ?? null;
  return {
    rankBy: asksRevenue ? 'revenue' : asksMargin ? 'margin' : asksQuantity ? 'quantity' : context.request.rankBy,
    period,
    compareNames: context.focusNames.slice(0, 2),
    ...(range ? { range } : {}),
  };
}

function darParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

/** Return UTC instant for midnight in the business timezone (Tanzania, UTC+3). */
function darMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day) - 3 * 60 * 60 * 1000);
}

export function periodStart(period: ProductPeriod, now = new Date()): Date {
  const parts = darParts(now);
  const start = darMidnight(parts.year, parts.month, parts.day);
  if (period === 'today') return start;
  if (period === 'week') {
    const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const mondayOffset = (localDate.getUTCDay() + 6) % 7;
    localDate.setUTCDate(localDate.getUTCDate() - mondayOffset);
    return darMidnight(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate());
  }
  if (period === 'month') {
    return darMidnight(parts.year, parts.month, 1);
  }
  return darMidnight(parts.year, 1, 1);
}

function currentCost(description: string, occurredAt: string, costs: ProductCostPoint[]): number | null {
  const key = clean(description);
  const saleTime = new Date(occurredAt).getTime();
  const eligible = costs
    .filter((cost) => cost.productKey === key && new Date(cost.effectiveFrom).getTime() <= saleTime)
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  return eligible[0]?.unitCost ?? null;
}

export function aggregateProducts(lines: ProductSaleLine[], costs: ProductCostPoint[]): ProductAggregate[] {
  const byProduct = new Map<string, ProductAggregate>();
  for (const line of lines) {
    const product = line.description.trim().replace(/^[\s\-–—•*]+/u, '').trim();
    if (!product || line.quantity <= 0 || line.lineTotal <= 0) continue;
    const key = clean(product);
    const unitCost = currentCost(product, line.occurredAt, costs);
    const existing = byProduct.get(key) ?? { product, quantity: 0, revenue: 0, margin: 0, costed: true };
    existing.quantity += line.quantity;
    existing.revenue += line.lineTotal;
    if (unitCost === null) {
      existing.costed = false;
      existing.margin = null;
    } else if (existing.costed) {
      existing.margin = (existing.margin ?? 0) + line.lineTotal - line.quantity * unitCost;
    }
    byProduct.set(key, existing);
  }
  return Array.from(byProduct.values());
}

export function rankProducts(items: ProductAggregate[], rankBy: ProductRankBy, compareNames: string[] = []): ProductAggregate[] {
  const filtered = compareNames.length > 0
    ? items.filter((item) => compareNames.some((name) => clean(item.product) === clean(name) || clean(item.product).includes(clean(name))))
    : items;
  return filtered
    .filter((item) => rankBy !== 'margin' || item.costed)
    .sort((a, b) => {
      const aValue = rankBy === 'quantity' ? a.quantity : rankBy === 'revenue' ? a.revenue : (a.margin ?? -Infinity);
      const bValue = rankBy === 'quantity' ? b.quantity : rankBy === 'revenue' ? b.revenue : (b.margin ?? -Infinity);
      return bValue - aValue || b.revenue - a.revenue || a.product.localeCompare(b.product);
    });
}

export function productAnalyticsReply(
  request: ProductAnalyticsRequest,
  items: ProductAggregate[],
  lang: Lang,
): string {
  const periodLabel = request.range
    ? (lang === 'sw' ? request.range.sw : request.range.en)
    : lang === 'sw'
      ? { today: 'leo', week: 'wiki hii', month: 'mwezi huu', year: 'mwaka huu' }[request.period]
      : { today: 'today', week: 'this week', month: 'this month', year: 'this year' }[request.period];
  if (items.length === 0) {
    return lang === 'sw'
      ? 'Bado hujaandika mauzo yenye majina ya bidhaa katika kipindi hiki. Taja bidhaa na kiasi ili Risip iweze kuonyesha kinachouza zaidi.'
      : 'I do not have itemised product sales for this period yet. Include product names and quantities so Risip can rank what sells most.';
  }
  const ranked = rankProducts(items, request.rankBy, request.compareNames);
  // Products with no buying cost cannot be ranked by margin. They used to be
  // dropped out of the ranking without a word, and when EVERY product lacked one
  // the whole question was refused — "bidhaa gani inafaida kubwa?" answered with
  // a list of five things to go and do. Both are the same mistake: all or
  // nothing, where some is the honest answer.
  const uncosted = request.rankBy === 'margin'
    ? items.filter((item) => !item.costed).map((item) => item.product)
    : [];
  const uncostedNote = uncosted.length === 0 ? '' : (lang === 'sw'
    ? `\n\n_Hazipo kwenye hesabu hii (hazina bei ya kununua): ${uncosted.slice(0, 6).join(', ')}`
      + `${uncosted.length > 6 ? ` na nyingine ${uncosted.length - 6}` : ''}._`
    : `\n\n_Left out of this ranking, no buying cost: ${uncosted.slice(0, 6).join(', ')}`
      + `${uncosted.length > 6 ? ` and ${uncosted.length - 6} more` : ''}._`);

  if (ranked.length === 0 && request.rankBy === 'margin') {
    const missing = uncosted.slice(0, 5).join(', ');
    return lang === 'sw'
      ? `Siwezi kukadiria faida bado kwa sababu hakuna bei ya kununua iliyowekwa kwa ${missing || 'bidhaa hizi'}. Tuma mfano: “unga unanigharimu 900 kwa kilo”.`
      : `I cannot estimate margin yet because no buying cost is recorded for ${missing || 'these products'}. Send for example: “cost of flour is 900 per kilo”.`;
  }
  if (ranked.length === 0) {
    return lang === 'sw' ? 'Sikupata bidhaa ulizotaja katika kipindi hiki.' : 'I could not find the named products in this period.';
  }
  const basis = request.rankBy === 'quantity'
    ? (lang === 'sw' ? 'idadi ya bidhaa' : 'quantity sold')
    : request.rankBy === 'revenue'
      ? (lang === 'sw' ? 'mapato' : 'revenue')
      : (lang === 'sw' ? 'faida ya makisio' : 'estimated margin');
  const rows = ranked.slice(0, 5).map((item, index) => {
    const value = request.rankBy === 'quantity'
      ? `${item.quantity} ${lang === 'sw' ? 'vipande/vitengo' : 'units'}`
      : request.rankBy === 'revenue'
        ? `TSh ${Math.round(item.revenue).toLocaleString('en-US')}`
        : `TSh ${Math.round(item.margin ?? 0).toLocaleString('en-US')}`;
    return `${index + 1}. ${item.product} — ${value}`;
  });
  return lang === 'sw'
    ? `Kwa ${periodLabel}, nimepanga bidhaa kwa ${basis}:\n${rows.join('\n')}\n\nHii ni ${basis}, si kipimo kingine.${uncostedNote}`
    : `For ${periodLabel}, I ranked products by ${basis}:\n${rows.join('\n')}\n\nThis is ranked by ${basis}, not another measure.${uncostedNote}`;
}
