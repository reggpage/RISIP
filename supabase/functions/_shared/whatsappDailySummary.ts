import type { Lang } from './whatsappIntent.ts';

export type DailySummaryItem = {
  name: string;
  quantity: number;
  unitPrice: number | null;
  total: number;
};

export type DailySummaryAlert = { name: string; quantity: number };

export type DailySummaryInput = {
  businessName: string;
  dateLabel: string;
  /** Whether the requested business date is the shop's current local date. */
  isToday?: boolean;
  sales: number;
  cogs: number;
  expenses: number;
  profit: number;
  salesItems: DailySummaryItem[];
  expenseItems: DailySummaryItem[];
  outOfStock: DailySummaryAlert[];
  lowStock: DailySummaryAlert[];
  records: number;
};

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;
const qty = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

function itemLine(item: DailySummaryItem): string {
  const price = item.unitPrice === null ? '' : ` × ${money(item.unitPrice)}`;
  return `• ${item.name} ${qty(item.quantity)}${price} = *${money(item.total)}*`;
}

/** The human-readable summary used by the daily report and by its tests. */
export function formatDailySummary(input: DailySummaryInput, lang: Lang): string {
  const sw = lang === 'sw';
  const isToday = input.isToday !== false;
  const title = isToday
    ? (sw ? '*Muhtasiri wa leo*' : '*Today’s summary*')
    : (sw ? `*Muhtasiri wa ${input.dateLabel}*` : `*Summary for ${input.dateLabel}*`);
  const subtitle = isToday
    ? (sw ? 'Hii ni taarifa ya leo katika biashara yako.' : 'This is today’s report for your business.')
    : (sw ? `Hii ni taarifa ya ${input.dateLabel} katika biashara yako.` : `This is the report for ${input.dateLabel} in your business.`);
  const profitLabel = isToday
    ? (sw ? 'Faida ya leo' : 'Today’s profit')
    : (sw ? 'Faida ya siku' : 'Day profit');
  const analysis = input.records === 0
    ? (sw ? 'Hakuna rekodi iliyothibitishwa kwa siku hii.' : 'There are no confirmed records for this day.')
    : input.profit > 0
      ? (sw ? 'Biashara imefanya faida baada ya gharama na matumizi yaliyorekodiwa.' : 'The business made a profit after recorded costs and expenses.')
      : input.profit < 0
        ? (sw ? 'Siku imefungwa kwa hasara; kagua gharama za bidhaa na matumizi.' : 'The day ended at a loss; review product costs and expenses.')
        : (sw ? 'Mauzo na gharama vimekaribiana; endelea kufuatilia bidhaa zenye margin nzuri.' : 'Sales and costs were close; keep watching products with a stronger margin.');

  const lines: string[] = [
    title,
    subtitle,
    '',
    '━━━━━━━━━━━━━━━━━━',
    sw ? `🏪 *Biashara:* ${input.businessName}` : `🏪 *Business:* ${input.businessName}`,
    sw ? `📅 *Tarehe:* ${input.dateLabel}` : `📅 *Date:* ${input.dateLabel}`,
    '━━━━━━━━━━━━━━━━━━',
    '',
    sw ? '*🛒 Mauzo yaliyorekodiwa*' : '*🛒 Recorded sales*',
  ];

  if (input.salesItems.length > 0) lines.push(...input.salesItems.slice(0, 40).map(itemLine));
  else lines.push(sw ? '• Hakuna mauzo yaliyorekodiwa.' : '• No sales were recorded.');
  lines.push(sw ? `*Jumla ya mauzo: ${money(input.sales)}*` : `*Total sales: ${money(input.sales)}*`);
  lines.push('', sw ? '*💸 Matumizi*' : '*💸 Expenses*');
  if (input.expenseItems.length > 0) lines.push(...input.expenseItems.slice(0, 20).map(itemLine));
  else lines.push(sw ? '• Hakuna matumizi yaliyorekodiwa.' : '• No expenses were recorded.');
  lines.push(sw ? `*Jumla ya matumizi: ${money(input.expenses)}*` : `*Total expenses: ${money(input.expenses)}*`);
  lines.push('', sw ? `📦 Gharama za bidhaa zilizouzwa: ${money(input.cogs)}` : `📦 Cost of goods sold: ${money(input.cogs)}`);
  lines.push(sw ? `📈 *${profitLabel}: ${money(input.profit)}*` : `📈 *${profitLabel}: ${money(input.profit)}*`);

  if (input.outOfStock.length > 0 || input.lowStock.length > 0) {
    lines.push('', sw ? '*⚠️ Bidhaa za kuangalia*' : '*⚠️ Stock to watch*');
    for (const item of input.outOfStock.slice(0, 15)) {
      lines.push(sw ? `• *${item.name}* — imeisha` : `• *${item.name}* — out of stock`);
    }
    for (const item of input.lowStock.slice(0, 15)) {
      lines.push(sw ? `• *${item.name}* — inakaribia kuisha (${qty(item.quantity)})` : `• *${item.name}* — running low (${qty(item.quantity)})`);
    }
  }

  lines.push('', sw ? '*🤖 Uchambuzi wa siku*' : '*🤖 Day analysis*', `• ${analysis}`);
  lines.push(sw ? `• Rekodi zilizothibitishwa: ${input.records}` : `• Confirmed records: ${input.records}`);
  return lines.join('\n');
}
