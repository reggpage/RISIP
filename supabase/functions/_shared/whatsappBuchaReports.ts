import type { ReadPeriod, ReadToolName } from './whatsappReadTools.ts';
import { periodLabel, type ResolvedRange } from './whatsappReadTools.ts';

export type BuchaReportingSnapshot = {
  sales?: { total?: number; cash_sales?: number; credit_sales?: number; by_payment_method?: Record<string, number> };
  expenses?: number;
  customer_payments?: number;
  supplier_payments?: number;
  profit?: { sales?: number; expenses?: number; cogs?: number; gross_profit?: number; estimated_profit?: number; coverage?: number; products_missing_cost?: string[]; unvalued_stock_losses?: number };
  customer_receivables?: Array<{ party_name: string; outstanding: number }>;
  supplier_payables?: Array<{ supplier_name: string; outstanding: number }>;
  stock?: Array<{ product_name: string; unit?: string | null; on_hand: number }>;
  stock_loss?: { amount?: number; quantity?: number; unvalued_events?: number; valuation_complete?: boolean };
  owner_use?: { amount?: number; quantity?: number; events?: number };
  whole_animals?: { count?: number; total?: number; pending_breakdown?: number; breakdown_outputs?: number };
};

function money(value: unknown): string {
  return `TSh ${Math.round(Number(value ?? 0)).toLocaleString('en-US')}`;
}

/**
 * The snapshot as evidence rather than as a paragraph.
 *
 * MEASURED. Asked "Biashara inaendaje so far", the shop got the fixed monthly
 * ledger block below — same headings, same five lines, same closing sentence,
 * whatever had been asked. The figures were right and the answer was not: the
 * question was about how the business is DOING, and a printout is not an
 * assessment.
 *
 * The model reads this and writes the answer. The paragraph stays as the outage
 * reply, where a fixed layout beats silence.
 */
export function buchaReportFacts(
  snapshot: BuchaReportingSnapshot,
  period: ReadPeriod,
  lang: 'sw' | 'en',
  range?: ResolvedRange | null,
): string {
  const sales = snapshot.sales ?? {};
  const methods = sales.by_payment_method ?? {};
  const profit = snapshot.profit ?? {};
  const lines = [
    `period=${periodLabel(period, lang, range)}`,
    `total_sales=${Number(sales.total ?? 0)}`,
    `sales_not_on_credit=${Number(sales.cash_sales ?? 0)}`,
    `credit_sales=${Number(sales.credit_sales ?? 0)}`,
    `expenses=${Number(snapshot.expenses ?? 0)}`,
    `customer_payments=${Number(snapshot.customer_payments ?? 0)}`,
    `payment_method_cash=${Number(methods.cash ?? 0)}`,
    `payment_method_mobile_money=${Number(methods.mobile_money ?? 0)}`,
    `payment_method_bank=${Number(methods.bank ?? 0)}`,
    `payment_method_not_stated=${Number(methods.unstated ?? 0)}`,
  ];
  if (profit.estimated_profit !== undefined) {
    lines.push(`estimated_profit=${Number(profit.estimated_profit ?? 0)}`);
    lines.push(`cogs=${Number(profit.cogs ?? 0)}`);
    lines.push(`gross_profit=${Number(profit.gross_profit ?? Number(profit.sales ?? 0) - Number(profit.cogs ?? 0))}`);
    lines.push(`cost_coverage=${Number(profit.coverage ?? 0)}`);
  }
  // Said plainly, because the two were conflated on the owner's own screen.
  lines.push('note=sales_not_on_credit means settled at the moment of sale. It does NOT mean the payment method was cash. Payment method is a separate field and payment_method_not_stated is usually the largest of them; never report unstated as cash.');
  lines.push('note=these are confirmed records only.');
  return lines.join('\n');
}

export function buildBuchaReportReply(
  snapshot: BuchaReportingSnapshot,
  tool: ReadToolName,
  period: ReadPeriod,
  lang: 'sw' | 'en',
  range?: ResolvedRange | null,
): string {
  const label = periodLabel(period, lang, range);
  if (tool === 'ai_debtors') {
    const rows = (snapshot.customer_receivables ?? []).slice(0, 10);
    if (rows.length === 0) return lang === 'sw' ? 'Sina rekodi ya wateja wanaokudai kwa sasa.' : 'No confirmed customer receivables are open right now.';
    return lang === 'sw'
      ? `Wateja wanaokudai:\n${rows.map((row, i) => `${i + 1}. ${row.party_name} — ${money(row.outstanding)}`).join('\n')}\n\nJumla: ${money(rows.reduce((sum, row) => sum + Number(row.outstanding), 0))}`
      : `Customers who owe you:\n${rows.map((row, i) => `${i + 1}. ${row.party_name} — ${money(row.outstanding)}`).join('\n')}\n\nTotal: ${money(rows.reduce((sum, row) => sum + Number(row.outstanding), 0))}`;
  }
  if (tool === 'ai_business_summary') {
    const sales = snapshot.sales ?? {};
    const methods = sales.by_payment_method ?? {};
    return lang === 'sw'
      ? `Muhtasari wa ${label}:\nMauzo yote: ${money(sales.total)}\n  Yaliyolipwa: ${money(sales.cash_sales)} · Mkopo: ${money(sales.credit_sales)}\n  Njia iliyorekodiwa: cash ${money(methods.cash)} · mobile ${money(methods.mobile_money)} · bank ${money(methods.bank)} · haijarekodiwa ${money(methods.unstated)}\nMatumizi: ${money(snapshot.expenses)}\nMalipo ya wateja: ${money(snapshot.customer_payments)}\n\nHizi ni namba za rekodi zilizothibitishwa.`
      : `Summary for ${label}:\nTotal sales: ${money(sales.total)}\n  Paid at the counter: ${money(sales.cash_sales)} · Credit: ${money(sales.credit_sales)}\n  Recorded method: cash ${money(methods.cash)} · mobile ${money(methods.mobile_money)} · bank ${money(methods.bank)} · not stated ${money(methods.unstated)}\nExpenses: ${money(snapshot.expenses)}\nCustomer payments: ${money(snapshot.customer_payments)}\n\nThese figures use confirmed records.`;
  }
  if (tool === 'daily_profit_estimate') {
    const profit = snapshot.profit ?? {};
    const missing = (profit.products_missing_cost ?? []).filter(Boolean);
    const incomplete = missing.length > 0 || Number(profit.unvalued_stock_losses ?? 0) > 0;
    const note = incomplete
      ? (lang === 'sw' ? '\nMakisio hayajakamilika: kuna bidhaa/loss ambazo hazina valuation kamili.' : '\nEstimate is incomplete: some products/losses do not have complete valuation.')
      : '';
    return lang === 'sw'
      ? `Makisio ya faida ya ${label}:\nMauzo: ${money(profit.sales)}\nGharama za bidhaa zilizouzwa (COGS): ${money(profit.cogs)}\nFaida ghafi: ${money(profit.gross_profit ?? Number(profit.sales ?? 0) - Number(profit.cogs ?? 0))}\nMatumizi yaliyorekodiwa: ${money(profit.expenses)}\nFaida baada ya matumizi yaliyorekodiwa: ${money(profit.estimated_profit)}\nCoverage: ${Math.round(Number(profit.coverage ?? 0) * 100)}%${note}`
      : `Estimated profit for ${label}:\nSales: ${money(profit.sales)}\nCost of goods sold (COGS): ${money(profit.cogs)}\nGross profit: ${money(profit.gross_profit ?? Number(profit.sales ?? 0) - Number(profit.cogs ?? 0))}\nRecorded expenses: ${money(profit.expenses)}\nEstimated profit after recorded expenses: ${money(profit.estimated_profit)}\nCoverage: ${Math.round(Number(profit.coverage ?? 0) * 100)}%${note}`;
  }
  if (tool === 'ai_stock_loss') {
    const loss = snapshot.stock_loss ?? {};
    return lang === 'sw'
      ? `Potevu wa stock ${label}:\nKiasi: ${Number(loss.quantity ?? 0).toLocaleString('en-US')}\nThamani iliyojulikana: ${money(loss.amount)}\nMatukio yasiyo na valuation: ${loss.unvalued_events ?? 0}${loss.valuation_complete === false ? '\nThamani haijakamilika; sifanyi makisio.' : ''}`
      : `Stock loss for ${label}:\nQuantity: ${Number(loss.quantity ?? 0).toLocaleString('en-US')}\nKnown value: ${money(loss.amount)}\nUnvalued events: ${loss.unvalued_events ?? 0}${loss.valuation_complete === false ? '\nValuation is incomplete; no guess was made.' : ''}`;
  }
  if (tool === 'ai_owner_use') {
    const use = snapshot.owner_use ?? {};
    return lang === 'sw'
      ? `Stock iliyotumika na mwenye biashara ${label}:\nKiasi: ${Number(use.quantity ?? 0).toLocaleString('en-US')}\nThamani iliyorekodiwa: ${money(use.amount)}\nMatukio: ${use.events ?? 0}`
      : `Owner-use stock for ${label}:\nQuantity: ${Number(use.quantity ?? 0).toLocaleString('en-US')}\nRecorded value: ${money(use.amount)}\nEvents: ${use.events ?? 0}`;
  }
  if (tool === 'ai_whole_animals') {
    const animals = snapshot.whole_animals ?? {};
    return lang === 'sw'
      ? `Ng'ombe/animals ${label}:\nWalionunuliwa: ${animals.count ?? 0}\nGharama: ${money(animals.total)}\nBado hawajafanyiwa breakdown: ${animals.pending_breakdown ?? 0}\nOutputs za breakdown: ${Number(animals.breakdown_outputs ?? 0).toLocaleString('en-US')}`
      : `Whole animals for ${label}:\nPurchased: ${animals.count ?? 0}\nCost: ${money(animals.total)}\nAwaiting breakdown: ${animals.pending_breakdown ?? 0}\nBreakdown outputs: ${Number(animals.breakdown_outputs ?? 0).toLocaleString('en-US')}`;
  }
  return lang === 'sw' ? 'Sina report ya aina hiyo bado.' : 'That report is not available yet.';
}
