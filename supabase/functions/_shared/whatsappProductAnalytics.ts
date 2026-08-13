import type { Lang } from './whatsappIntent.ts';

export type ProductRankBy = 'quantity' | 'revenue' | 'margin';
export type ProductPeriod = 'today' | 'week' | 'month' | 'year';

export type ProductAnalyticsRequest = {
  rankBy: ProductRankBy;
  period: ProductPeriod;
  compareNames: string[];
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

export function parseProductAnalyticsRequest(text: string | null | undefined): ProductAnalyticsRequest | null {
  const value = clean(text ?? '');
  if (!value) return null;
  const asksProduct = /(?:\b(?:bidhaa|bidha|product|products)\b.*\b(?:gani|which|inauza|inauzika|selling|sold|faida|profit|revenue|mapato)\b)|(?:\b(?:inauza zaidi|inauza sana|inauza ngapi|inauzika sana|best selling|top)\b)/.test(value);
  const asksProfit = /\b(faida|margin|profit|earn)\b/.test(value);
  const asksRevenue = /\b(mapato|revenue|money|fedha nyingi|pesa nyingi)\b/.test(value);
  // A bare "faida ya leo" is a period profit question, not a product ranking.
  // Product analytics only claims messages that explicitly mention products or
  // selling; this prevents it from stealing the future profit-intent route.
  if (!asksProduct) return null;

  const period: ProductPeriod = /\b(leo|today)\b/.test(value)
    ? 'today'
    : /\b(wiki|week)\b/.test(value)
      ? 'week'
      : /\b(mwezi|month)\b/.test(value)
        ? 'month'
        : /\b(mwaka|year)\b/.test(value) ? 'year' : 'month';
  const rankBy: ProductRankBy = asksProfit ? 'margin' : asksRevenue ? 'revenue' : 'quantity';
  const compareMatch = value.match(/^(.+?)\s+(?:au|or)\s+(.+?)(?:\s+(?:ipi|which|inauza|sells|inauzika)\b|\s*$)/u);
  const namedProductMatch = value.match(/^(.+?)\s+(?:inauza|inauzika)\s+(?:ngapi|sana|zaidi|vipi)\b/u);
  const namedProduct = namedProductMatch?.[1].trim();
  const isGenericProductPhrase = Boolean(namedProduct && /^(?:bidhaa|bidha|product|products|kitu)\s+(?:gani|which)\b/.test(namedProduct));
  const compareNames = compareMatch
    ? [clean(compareMatch[1]), clean(compareMatch[2])].filter(Boolean).slice(0, 2)
    : namedProduct && !isGenericProductPhrase ? [clean(namedProduct)] : [];
  return { rankBy, period, compareNames };
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
    const product = line.description.trim();
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
  const periodLabel = lang === 'sw'
    ? { today: 'leo', week: 'wiki hii', month: 'mwezi huu', year: 'mwaka huu' }[request.period]
    : { today: 'today', week: 'this week', month: 'this month', year: 'this year' }[request.period];
  if (items.length === 0) {
    return lang === 'sw'
      ? 'Bado hujaandika mauzo yenye majina ya bidhaa katika kipindi hiki. Taja bidhaa na kiasi ili Risip iweze kuonyesha kinachouza zaidi.'
      : 'I do not have itemised product sales for this period yet. Include product names and quantities so Risip can rank what sells most.';
  }
  const ranked = rankProducts(items, request.rankBy, request.compareNames);
  if (ranked.length === 0 && request.rankBy === 'margin') {
    const missing = items.filter((item) => !item.costed).map((item) => item.product).slice(0, 5).join(', ');
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
    ? `Kwa ${periodLabel}, nimepanga bidhaa kwa ${basis}:\n${rows.join('\n')}\n\nHii ni ${basis}, si kipimo kingine.`
    : `For ${periodLabel}, I ranked products by ${basis}:\n${rows.join('\n')}\n\nThis is ranked by ${basis}, not another measure.`;
}
