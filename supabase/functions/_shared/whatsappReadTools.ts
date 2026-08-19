// A1 read-only tools for the WhatsApp assistant.
//
// This module is deliberately database-free. The edge function owns tenant
// scoping and querying; these pure calculations make it possible to test the
// arithmetic without a service-role client and keep the assistant from ever
// treating a model response as an accounting source.

import { type ResolvedRange, resolveDateRange } from './whatsappDateRange.ts';

export type ReadToolName =
  | 'ai_business_summary'
  | 'ai_debtors'
  | 'daily_profit_estimate'
  | 'ai_debtor_detail'
  | 'ai_my_receipts'
  | 'ai_petty_cash_balance'
  | 'ai_owed_to_me'
  | 'ai_my_businesses'
  | 'ai_pending_approvals';

export type ReadPeriod = 'today' | 'week' | 'month' | 'year';

export type ReadRequest = {
  tool: ReadToolName;
  period: ReadPeriod;
  status?: string | null;
  partyName?: string | null;
  /**
   * A real window when the person named one ("juzi", "wiki iliyopita",
   * "tarehe 7 Mei 2025"). `period` stays for the four coarse defaults, so
   * nothing that already worked has to change.
   */
  range?: ResolvedRange | null;
};

export type ReadDailyRow = {
  kind: string;
  status: string;
  amount: number;
  partyName?: string | null;
  occurredAt?: string | null;
};

export type ReadDailyLine = {
  description: string;
  quantity: number;
  lineTotal: number;
  occurredAt: string;
};

export type ReadProductCost = {
  productKey: string;
  unitCost: number;
  effectiveFrom: string;
};

export type BusinessSummary = {
  sales: number;
  expenses: number;
  debtIssued: number;
  customerPayments: number;
  stockPurchases: number;
  cashMovement: number;
};

export type Debtor = {
  partyName: string;
  issued: number;
  paid: number;
  balance: number;
};

export type ProfitEstimate = {
  sales: number;
  expenses: number;
  cogs: number;
  costedSales: number;
  coverage: number;
  estimatedProfit: number;
  productsMissingCost: string[];
};

export type ReceiptSummary = {
  id: string;
  status: string;
  amount: number | null;
  vendor: string | null;
  createdAt: string;
};

export type ReceiptDetail = ReceiptSummary & {
  tin: string | null;
  vrn: string | null;
  receiptNumber: string | null;
  verificationCode: string | null;
  receiptDate: string | null;
  receiptTime: string | null;
  taxAmount: number | null;
  category: string | null;
  paymentMethod: string | null;
  lowConfidenceFields: string[];
};

export type InvoiceDetail = {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  status: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  taxAmount: number;
  lineItems: string[];
  createdAt: string;
};

export type BusinessMembership = {
  companyId: string;
  companyName: string;
  role: string;
};

function normalise(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function parsePeriod(text: string): ReadPeriod {
  if (hasAny(text, ['mwaka', 'year', 'annual'])) return 'year';
  if (hasAny(text, ['mwezi', 'month', 'monthly'])) return 'month';
  if (hasAny(text, ['wiki', 'week', 'weekly'])) return 'week';
  return 'today';
}

/** Deterministic routing for A1. No AI is consulted to choose a read tool. */
export function parseReadRequest(input: string | null | undefined, now = new Date()): ReadRequest | null {
  const text = normalise(String(input ?? ''));
  if (!text) return null;
  const period = parsePeriod(text);
  // The person's own words about time win over the four coarse buckets.
  const range = resolveDateRange(String(input ?? ''), now);
  const withRange = (request: Omit<ReadRequest, 'range'>): ReadRequest => ({ ...request, range });

  if (hasAny(text, ['ninaidai risip', 'risip inanidai', 'my reimbursement', 'reimbursements yangu', 'risip owe', 'risip owes', 'owe me', 'nirudishiwe'])) {
    return withRange({ tool: 'ai_owed_to_me', period });
  }
  if (hasAny(text, ['biashara zangu', 'my businesses', 'switch business', 'badili biashara'])) {
    return withRange({ tool: 'ai_my_businesses', period });
  }
  if (hasAny(text, ['pending approval', 'awaiting approval', 'risiti za kuapprove', 'risiti zinazosubiri', 'zinazosubiri kuangaliwa'])) {
    return withRange({ tool: 'ai_pending_approvals', period });
  }
  if (hasAny(text, ['petty cash', 'salio la cash', 'cash balance', 'salio langu la pesa'])) {
    return withRange({ tool: 'ai_petty_cash_balance', period });
  }
  if (hasAny(text, ['risiti zangu', 'my receipts', 'receipt status', 'status ya risiti', 'my confirmed receipts', 'my pending receipts', 'risiti zilizothibitishwa', 'risiti zangu za'])) {
    const status = hasAny(text, ['confirmed', 'imethibitishwa'])
      ? 'confirmed'
      : hasAny(text, ['pending', 'inasubiri', 'submitted']) ? 'submitted' : null;
    return withRange({ tool: 'ai_my_receipts', period, status });
  }
  const detailMatch = text.match(/^deni la ([a-z][a-z ]{1,60}?) (?:ni|lina|imebakia|imebaki)\b/)
    ?? text.match(/^([a-z][a-z ]{1,60}?) anadaiwa(?: kiasi gani| kiasi| nini)?\b/)
    // "Juma ana siku ngapi hajalipa?" is a question about ONE debtor and was
    // going to the model, because the pattern knew only two phrasings of it.
    ?? text.match(/^([a-z][a-z ]{1,60}?) (?:ana siku ngapi|hajalipa|amechelewa|anadaiwa tangu)\b/);
  const detailName = detailMatch?.[1].trim();
  if (detailName && !['nani', 'who', 'which'].includes(detailName)) {
    return withRange({ tool: 'ai_debtor_detail', period, partyName: detailName });
  }
  if (hasAny(text, ['nani anadaiwa', 'nani ananidai', 'nani ananidwa', 'ananidwa pesa', 'wanaonidai', 'onyesha wadeni', 'list ya madeni', 'who owes me', 'hajanilipa', 'nina madeni', 'madeni yangu', 'madeni ya'])) {
    return withRange({ tool: 'ai_debtors', period });
  }
  if (hasAny(text, ['faida', 'profit', 'margin', 'biashara inalipa', 'gharama zimezidi', 'nimepoteza pesa', 'nimepata hasara', 'hasara', 'lost money', 'losing money'])) {
    return withRange({ tool: 'daily_profit_estimate', period });
  }
  if (hasAny(text, ['muhtasari', 'summary', 'imekuwaje', 'what happened', 'mauzo ya leo', 'mauzo ya wiki', 'mauzo ya mwezi', 'sales today', 'business summary', 'cash movement', 'mzunguko wa pesa', 'spend trend', 'matumizi ya wiki', 'nimepata kiasi gani', 'nimeingiza kiasi gani'])) {
    return withRange({ tool: 'ai_business_summary', period });
  }
  return null;
}

function money(value: number, lang: 'sw' | 'en'): string {
  const currency = lang === 'sw' ? 'TSh' : 'TSh';
  return `${currency} ${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * What to call the window in the reply.
 *
 * A named range says its own name ("juzi", "tarehe 7 Mei 2025"), so a figure is
 * never labelled with the wrong day — reporting Tuesday's takings under the word
 * "leo" would be worse than refusing.
 */
export function periodLabel(period: ReadPeriod, lang: 'sw' | 'en', range?: ResolvedRange | null): string {
  if (range) return lang === 'sw' ? range.sw : range.en;
  const labels = lang === 'sw'
    ? { today: 'leo', week: 'wiki hii', month: 'mwezi huu', year: 'mwaka huu' }
    : { today: 'today', week: 'this week', month: 'this month', year: 'this year' };
  return labels[period];
}

export function calculateBusinessSummary(rows: ReadDailyRow[]): BusinessSummary {
  const confirmed = rows.filter((row) => row.status === 'confirmed');
  const total = (kind: string) => confirmed
    .filter((row) => row.kind === kind)
    .reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
  const sales = total('sale');
  const expenses = total('expense');
  const debtIssued = total('debt_issued');
  const customerPayments = total('customer_payment');
  const stockPurchases = total('stock_purchase');
  return {
    sales,
    expenses,
    debtIssued,
    customerPayments,
    stockPurchases,
    cashMovement: sales + customerPayments - expenses - stockPurchases,
  };
}

export function calculateDebtors(rows: ReadDailyRow[]): Debtor[] {
  const byParty = new Map<string, Debtor>();
  for (const row of rows) {
    if (row.status !== 'confirmed') continue;
    const partyName = String(row.partyName ?? '').trim();
    if (!partyName) continue;
    const key = normalise(partyName);
    if (!key) continue;
    const current = byParty.get(key) ?? { partyName, issued: 0, paid: 0, balance: 0 };
    if (row.kind === 'debt_issued') current.issued += Math.max(0, Number(row.amount) || 0);
    if (row.kind === 'customer_payment') current.paid += Math.max(0, Number(row.amount) || 0);
    current.balance = current.issued - current.paid;
    byParty.set(key, current);
  }
  return [...byParty.values()]
    .filter((debtor) => debtor.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.partyName.localeCompare(b.partyName));
}

export function calculateProfitEstimate(
  rows: ReadDailyRow[],
  lines: ReadDailyLine[],
  costs: ReadProductCost[],
): ProfitEstimate {
  const confirmed = rows.filter((row) => row.status === 'confirmed');
  const sales = confirmed.filter((row) => row.kind === 'sale').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenses = confirmed.filter((row) => row.kind === 'expense').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const findCost = (line: ReadDailyLine): number | null => {
    const key = normalise(line.description);
    const saleTime = new Date(line.occurredAt).getTime();
    const match = costs
      .filter((cost) => normalise(cost.productKey) === key && new Date(cost.effectiveFrom).getTime() <= saleTime)
      .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
    return match ? Number(match.unitCost) : null;
  };
  let cogs = 0;
  let costedSales = 0;
  const missing = new Set<string>();
  for (const line of lines) {
    if (line.quantity <= 0 || line.lineTotal <= 0) continue;
    const unitCost = findCost(line);
    if (unitCost === null) {
      missing.add(line.description.trim());
      continue;
    }
    cogs += line.quantity * unitCost;
    costedSales += line.lineTotal;
  }
  return {
    sales,
    expenses,
    cogs: Math.round(cogs * 100) / 100,
    costedSales: Math.round(costedSales * 100) / 100,
    coverage: sales > 0 ? Math.round((costedSales / sales) * 10000) / 10000 : 0,
    estimatedProfit: Math.round((sales - cogs - expenses) * 100) / 100,
    productsMissingCost: [...missing].sort(),
  };
}

export function buildBusinessSummaryReply(summary: BusinessSummary, period: ReadPeriod, lang: 'sw' | 'en', range?: ResolvedRange | null): string {
  const label = periodLabel(period, lang, range);
  if (lang === 'sw') {
    return `Muhtasari wa ${label}:\nMauzo: ${money(summary.sales, lang)}\nMatumizi ya rekodi za siku: ${money(summary.expenses, lang)}\nMalipo ya wateja: ${money(summary.customerPayments, lang)}\nDeni lililotolewa: ${money(summary.debtIssued, lang)} (si fedha iliyopokelewa)\nMabadiliko ya fedha yanayokadiriwa: ${money(summary.cashMovement, lang)}\n\nHaya ni rekodi za siku; gharama za risiti zinaonyeshwa kando.`;
  }
  return `Summary for ${label}:\nSales: ${money(summary.sales, lang)}\nDaily-record expenses: ${money(summary.expenses, lang)}\nCustomer payments: ${money(summary.customerPayments, lang)}\nDebt issued: ${money(summary.debtIssued, lang)} (not cash received)\nEstimated cash movement: ${money(summary.cashMovement, lang)}\n\nThese are daily records; receipt expenses are shown separately.`;
}

export function buildDebtorsReply(debtors: Debtor[], lang: 'sw' | 'en'): string {
  if (debtors.length === 0) {
    return lang === 'sw' ? 'Sina rekodi ya deni lililofunguka kwa sasa.' : 'I have no confirmed open customer debts right now.';
  }
  const rows = debtors.slice(0, 10).map((debtor, index) => `${index + 1}. ${debtor.partyName} — ${money(debtor.balance, lang)}`);
  const total = debtors.reduce((sum, debtor) => sum + debtor.balance, 0);
  return lang === 'sw'
    ? `Wateja wanaokudai:\n${rows.join('\n')}\n\nJumla iliyo wazi: ${money(total, lang)}`
    : `Customers who owe you:\n${rows.join('\n')}\n\nTotal outstanding: ${money(total, lang)}`;
}

export function buildDebtorDetailReply(debtor: Debtor | null, partyName: string, lang: 'sw' | 'en'): string {
  if (!debtor) return lang === 'sw' ? `Sina rekodi ya deni la ${partyName}.` : `I have no confirmed debt record for ${partyName}.`;
  if (debtor.balance <= 0) return lang === 'sw' ? `${partyName} hana deni lililo wazi kwa sasa.` : `${partyName} has no open balance right now.`;
  return lang === 'sw'
    ? `${partyName} anadaiwa ${money(debtor.balance, lang)}. Jumla ya deni: ${money(debtor.issued, lang)}; amelipa: ${money(debtor.paid, lang)}.`
    : `${partyName} owes ${money(debtor.balance, lang)}. Issued: ${money(debtor.issued, lang)}; paid: ${money(debtor.paid, lang)}.`;
}

export function buildProfitReply(profit: ProfitEstimate, period: ReadPeriod, lang: 'sw' | 'en', range?: ResolvedRange | null): string {
  const label = periodLabel(period, lang, range);
  if (profit.sales <= 0) {
    return lang === 'sw' ? `Sina mauzo yaliyothibitishwa ya ${label} ya kukadiria faida.` : `I have no confirmed sales for ${label} to estimate profit.`;
  }
  const coverage = Math.round(profit.coverage * 100);
  const missing = profit.productsMissingCost.length > 0
    ? (lang === 'sw'
      ? `\nBei za kununua hazijarekodiwa kwa: ${profit.productsMissingCost.join(', ')}. Hivyo hii ni makisio yenye taarifa pungufu.`
      : `\nBuying costs are missing for: ${profit.productsMissingCost.join(', ')}. This estimate is therefore incomplete.`)
    : '';
  return lang === 'sw'
    ? `Makisio ya faida ya ${label}:\nMauzo: ${money(profit.sales, lang)}\nCOGS iliyokadiriwa: ${money(profit.cogs, lang)}\nMatumizi: ${money(profit.expenses, lang)}\nFaida inayokadiriwa: ${money(profit.estimatedProfit, lang)}\nCoverage ya mauzo: ${coverage}%${missing}`
    : `Estimated profit for ${label}:\nSales: ${money(profit.sales, lang)}\nEstimated COGS: ${money(profit.cogs, lang)}\nExpenses: ${money(profit.expenses, lang)}\nEstimated profit: ${money(profit.estimatedProfit, lang)}\nSales coverage: ${coverage}%${missing}`;
}

/**
 * A receipt that is not yet confirmed is waiting for the person to finish
 * something, so it gets the deep link that takes them straight to it. The id was
 * always fetched and never shown, which is why the assistant used to say it
 * could not send a link — it had none to send, though one exists.
 *
 * `/receipts?receipt=<id>` is the ordinary authenticated view. It carries no
 * bypass token, so it is safe in a chat: it only opens for someone already
 * entitled to see that receipt.
 */
export function buildReceiptsReply(
  receipts: ReceiptSummary[],
  lang: 'sw' | 'en',
  appUrl?: string | null,
): string {
  if (receipts.length === 0) return lang === 'sw' ? 'Sina risiti zako zilizoonekana kwa sasa.' : 'I could not find your receipts right now.';
  const base = String(appUrl ?? '').replace(/\/+$/, '');
  const rows = receipts.slice(0, 10).map((receipt, index) => {
    const amount = receipt.amount === null ? '-' : money(receipt.amount, lang);
    const head = `${index + 1}. ${receipt.vendor || (lang === 'sw' ? 'Risiti' : 'Receipt')} — ${amount} — ${receipt.status}`;
    // Every receipt, not just the unfinished ones. Asked for a link to a
    // confirmed receipt, the assistant answered "risiti hii haina link ya moja
    // kwa moja" and offered the whole list instead — which is not the receipt
    // the person asked for.
    return base ? `${head}\n   ${base}/receipts?receipt=${receipt.id}` : head;
  });
  const heading = lang === 'sw' ? 'Risiti zako za karibuni:' : 'Your recent receipts:';
  const all = base
    ? (lang === 'sw' ? `\n\nZote: ${base}/receipts` : `\n\nAll of them: ${base}/receipts`)
    : '';
  return `${heading}\n${rows.join('\n')}${all}`;
}

function shown(value: string | null | undefined, lang: 'sw' | 'en'): string {
  return value?.trim() || (lang === 'sw' ? 'haipo kwenye rekodi' : 'not available in the record');
}

/** Exact server evidence for one receipt; absent fields are stated, never guessed. */
export function buildReceiptDetailReply(
  receipt: ReceiptDetail | null,
  lang: 'sw' | 'en',
  appUrl?: string | null,
): string {
  if (!receipt) return lang === 'sw'
    ? 'Sikuweza kupata risiti hiyo katika rekodi unazoruhusiwa kuona.'
    : 'I could not find that receipt among the records you are allowed to view.';
  const base = String(appUrl ?? '').replace(/\/+$/, '');
  const link = base ? `\n${base}/receipts?receipt=${receipt.id}` : '';
  const uncertain = receipt.lowConfidenceFields.length > 0
    ? (lang === 'sw'
      ? `\nTahadhari: AI haikuwa na uhakika wa ${receipt.lowConfidenceFields.join(', ')}; hakiki picha ya risiti.`
      : `\nCaution: AI had low confidence in ${receipt.lowConfidenceFields.join(', ')}; verify the receipt image.`)
    : '';
  if (lang === 'sw') {
    return `Maelezo ya risiti:\n`
      + `Muuzaji: ${shown(receipt.vendor, lang)}\n`
      + `Namba ya risiti: ${shown(receipt.receiptNumber, lang)}\n`
      + `TIN: ${shown(receipt.tin, lang)}\n`
      + `VRN: ${shown(receipt.vrn, lang)}\n`
      + `Kodi ya uthibitisho: ${shown(receipt.verificationCode, lang)}\n`
      + `Tarehe: ${shown(receipt.receiptDate, lang)}${receipt.receiptTime ? ` ${receipt.receiptTime}` : ''}\n`
      + `Jumla: ${receipt.amount === null ? shown(null, lang) : money(receipt.amount, lang)}\n`
      + `VAT/kodi: ${receipt.taxAmount === null ? shown(null, lang) : money(receipt.taxAmount, lang)}\n`
      + `Kategoria: ${shown(receipt.category, lang)}\n`
      + `Njia ya malipo: ${shown(receipt.paymentMethod, lang)}\n`
      + `Hali: ${receipt.status}${uncertain}${link}`;
  }
  return `Receipt details:\n`
    + `Vendor: ${shown(receipt.vendor, lang)}\n`
    + `Receipt number: ${shown(receipt.receiptNumber, lang)}\n`
    + `TIN: ${shown(receipt.tin, lang)}\n`
    + `VRN: ${shown(receipt.vrn, lang)}\n`
    + `Verification code: ${shown(receipt.verificationCode, lang)}\n`
    + `Date: ${shown(receipt.receiptDate, lang)}${receipt.receiptTime ? ` ${receipt.receiptTime}` : ''}\n`
    + `Total: ${receipt.amount === null ? shown(null, lang) : money(receipt.amount, lang)}\n`
    + `VAT/tax: ${receipt.taxAmount === null ? shown(null, lang) : money(receipt.taxAmount, lang)}\n`
    + `Category: ${shown(receipt.category, lang)}\n`
    + `Payment method: ${shown(receipt.paymentMethod, lang)}\n`
    + `Status: ${receipt.status}${uncertain}${link}`;
}

/** Finance-only invoice evidence. Public tokens are deliberately never returned. */
export function buildInvoiceDetailReply(
  invoice: InvoiceDetail | null,
  lang: 'sw' | 'en',
  appUrl?: string | null,
): string {
  if (!invoice) return lang === 'sw'
    ? 'Sikuweza kupata invoice hiyo katika biashara hii.'
    : 'I could not find that invoice in this business.';
  const base = String(appUrl ?? '').replace(/\/+$/, '');
  const lines = invoice.lineItems.length > 0
    ? `\n${lang === 'sw' ? 'Vipengele' : 'Line items'}:\n${invoice.lineItems.slice(0, 20).map((line) => `- ${line}`).join('\n')}`
    : '';
  const link = base ? `\n${base}/invoices` : '';
  if (lang === 'sw') {
    return `Maelezo ya invoice:\nNamba: ${shown(invoice.invoiceNumber, lang)}\nMteja: ${shown(invoice.clientName, lang)}\n`
      + `Kipindi: ${invoice.periodStart} hadi ${invoice.periodEnd}\nJumla: ${money(invoice.totalAmount, lang)}\n`
      + `VAT/kodi: ${money(invoice.taxAmount, lang)}\nHali: ${invoice.status}${lines}${link}`;
  }
  return `Invoice details:\nNumber: ${shown(invoice.invoiceNumber, lang)}\nClient: ${shown(invoice.clientName, lang)}\n`
    + `Period: ${invoice.periodStart} to ${invoice.periodEnd}\nTotal: ${money(invoice.totalAmount, lang)}\n`
    + `VAT/tax: ${money(invoice.taxAmount, lang)}\nStatus: ${invoice.status}${lines}${link}`;
}

export function buildPettyCashReply(balance: number | null, lang: 'sw' | 'en'): string {
  if (balance === null) return lang === 'sw' ? 'Huna petty cash account iliyopatikana katika biashara hii.' : 'No petty-cash account was found for you in this business.';
  return lang === 'sw' ? `Salio lako la petty cash ni ${money(balance, lang)}.` : `Your petty-cash balance is ${money(balance, lang)}.`;
}

export function buildOwedToMeReply(amount: number, count: number, lang: 'sw' | 'en'): string {
  return lang === 'sw'
    ? `Risip inakudai ${money(amount, lang)} kwa risiti ${count} za matumizi ya pesa zako ambazo bado hazijalipwa.`
    : `Risip owes you ${money(amount, lang)} across ${count} personal-expense receipts that have not been reimbursed.`;
}

export function buildBusinessesReply(businesses: BusinessMembership[], lang: 'sw' | 'en'): string {
  if (businesses.length === 0) return lang === 'sw' ? 'Huna biashara zilizounganishwa.' : 'You have no linked businesses.';
  const rows = businesses.map((business, index) => `${index + 1}. ${business.companyName} — ${business.role}`);
  return lang === 'sw' ? `Biashara zako:\n${rows.join('\n')}` : `Your businesses:\n${rows.join('\n')}`;
}

export function buildPendingApprovalsReply(count: number, lang: 'sw' | 'en'): string {
  return lang === 'sw'
    ? `Kuna risiti ${count} zinazosubiri hatua ya finance.`
    : `There are ${count} receipts waiting for a finance decision.`;
}
