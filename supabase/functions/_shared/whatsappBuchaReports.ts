import type { ReadPeriod, ReadToolName } from './whatsappReadTools.ts';
import { periodDateLabel, periodDates, periodLabel } from './whatsappReadTools.ts';
// ResolvedRange lives in whatsappDateRange; whatsappReadTools only imports it.
import type { ResolvedRange } from './whatsappDateRange.ts';

export type BuchaReportingSnapshot = {
  sales?: {
    total?: number; settled_sales?: number; cash_sales?: number; credit_sales?: number;
    by_payment_method?: Record<string, number>;
    items?: Array<{ product_name: string; unit?: string | null; quantity: number; total: number; average_unit_price?: number }>;
  };
  expenses?: number;
  customer_payments?: number;
  supplier_payments?: number;
  profit?: { sales?: number; expenses?: number; cogs?: number; gross_profit?: number; estimated_profit?: number; coverage?: number; products_missing_cost?: string[]; unvalued_stock_losses?: number; valuation_complete?: boolean; known_margin_after_expenses?: number };
  customer_receivables?: Array<{ party_name: string; outstanding: number }>;
  supplier_payables?: Array<{ supplier_name: string; outstanding: number }>;
  stock?: Array<{ product_name: string; unit?: string | null; on_hand: number }>;
  stock_loss?: { amount?: number; quantity?: number; unvalued_events?: number; valuation_complete?: boolean; details?: ReportDetail[] };
  owner_use?: { amount?: number; quantity?: number; events?: number; details?: ReportDetail[] };
  whole_animals?: {
    count?: number; total?: number; pending_breakdown?: number; breakdown_outputs?: number;
    allocation_incomplete?: number;
    procurements?: Array<{
      animal_type: string; animal_count: number; purchase_total: number; breakdown_status: 'confirmed' | 'pending';
      breakdowns?: Array<{ cost_allocation_status: 'incomplete' | 'allocated'; outputs?: Array<{ product_name: string; quantity: number; unit: string }> }>;
    }>;
  };
};

type ReportDetail = { product_name: string; quantity: number; unit?: string | null; value?: number; reason?: string | null };

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
    // THE DATE. Missing here for as long as this function has existed, and it
    // is the whole of the "tarehe kamili haikutolewa na mfumo" bug.
    //
    // MEASURED: the owner asked "Jana walifunga na shingapi" four times and got
    // that sentence every time. Everyone, including me, read it as the model
    // lying. It was not. ai_business_summary_facts is inside snapshotTools, so
    // EVERY summary — butchery or bookshop — comes through here, and the well
    // tested businessSummaryFacts that does emit the date is never reached on
    // this path. The model was handed period=jana and no date, said so
    // honestly, and was then fought by three layers built to delete a true
    // sentence: a prompt rule, a caveat detector, and a regex that rewrites the
    // answer. All three no-op correctly when there is no date to enforce, which
    // is why four fixes to them changed nothing.
    //
    // Supply the fact. Do not argue with the model about a fact it does not
    // have.
    `period_dates=${periodDates(period, range)}`,
    `period_date_label=${periodDateLabel(period, lang, range)}`,
    `total_sales=${Number(sales.total ?? 0)}`,
    `settled_sales=${Number(sales.settled_sales ?? 0)}`,
    `credit_sales=${Number(sales.credit_sales ?? 0)}`,
    `expenses=${Number(snapshot.expenses ?? 0)}`,
    `customer_payments=${Number(snapshot.customer_payments ?? 0)}`,
    `payment_method_cash=${Number(methods.cash ?? 0)}`,
    `payment_method_mobile_money=${Number(methods.mobile_money ?? 0)}`,
    `payment_method_bank=${Number(methods.bank ?? 0)}`,
    `payment_method_not_stated=${Number(methods.unstated ?? 0)}`,
    `customer_receivables_total=${(snapshot.customer_receivables ?? []).reduce((sum, row) => sum + Number(row.outstanding ?? 0), 0)}`,
    `supplier_payables_total=${(snapshot.supplier_payables ?? []).reduce((sum, row) => sum + Number(row.outstanding ?? 0), 0)}`,
    `stock_loss_value=${Number(snapshot.stock_loss?.amount ?? 0)}`,
    `owner_use_value=${Number(snapshot.owner_use?.amount ?? 0)}`,
    `whole_animals_purchased=${Number(snapshot.whole_animals?.count ?? 0)}`,
    `whole_animals_pending_breakdown=${Number(snapshot.whole_animals?.pending_breakdown ?? 0)}`,
  ];
  if (profit.estimated_profit !== undefined) {
    lines.push(`estimated_profit=${Number(profit.estimated_profit ?? 0)}`);
    lines.push(`cogs=${Number(profit.cogs ?? 0)}`);
    lines.push(`gross_profit=${Number(profit.gross_profit ?? Number(profit.sales ?? 0) - Number(profit.cogs ?? 0))}`);
    lines.push(`cost_coverage=${Number(profit.coverage ?? 0)}`);
  }
  // Said plainly, because the two were conflated on the owner's own screen.
  lines.push('note=settled_sales means not sold on credit. cash_sales means only records whose stored payment method is cash. Never report unstated as cash.');
  lines.push(`note=profit valuation is ${profit.valuation_complete === false ? 'incomplete; state the coverage and missing costs' : 'complete for the stored data'}.`);
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
    if (rows.length === 0) return lang === 'sw' ? 'Hakuna deni la mteja lililo wazi kwenye rekodi zilizothibitishwa.' : 'No confirmed customer receivables are open right now.';
    return lang === 'sw'
      ? `Madeni ya wateja kwa biashara:\n${rows.map((row, i) => `${i + 1}. ${row.party_name} — ${money(row.outstanding)}`).join('\n')}\n\nJumla: ${money(rows.reduce((sum, row) => sum + Number(row.outstanding), 0))}`
      : `Customers who owe you:\n${rows.map((row, i) => `${i + 1}. ${row.party_name} — ${money(row.outstanding)}`).join('\n')}\n\nTotal: ${money(rows.reduce((sum, row) => sum + Number(row.outstanding), 0))}`;
  }
  if (tool === 'ai_business_summary') {
    const sales = snapshot.sales ?? {};
    const methods = sales.by_payment_method ?? {};
    return lang === 'sw'
      ? `Muhtasari wa ${label}:\nMauzo yote: ${money(sales.total)}\n  Yaliyolipwa wakati wa mauzo: ${money(sales.settled_sales)} · Mkopo: ${money(sales.credit_sales)}\n  Njia iliyorekodiwa: cash ${money(methods.cash)} · mobile ${money(methods.mobile_money)} · bank ${money(methods.bank)} · haijatajwa ${money(methods.unstated)}\nMatumizi: ${money(snapshot.expenses)}\nMalipo ya wateja: ${money(snapshot.customer_payments)}\nFaida inayokadiriwa: ${money(snapshot.profit?.estimated_profit)} (${Math.round(Number(snapshot.profit?.coverage ?? 0) * 100)}% ya mauzo yana gharama inayojulikana)\n\nHizi ni namba za rekodi zilizothibitishwa.`
      : `Summary for ${label}:\nTotal sales: ${money(sales.total)}\n  Settled at sale: ${money(sales.settled_sales)} · Credit: ${money(sales.credit_sales)}\n  Recorded method: cash ${money(methods.cash)} · mobile ${money(methods.mobile_money)} · bank ${money(methods.bank)} · not stated ${money(methods.unstated)}\nExpenses: ${money(snapshot.expenses)}\nCustomer payments: ${money(snapshot.customer_payments)}\nEstimated profit: ${money(snapshot.profit?.estimated_profit)} (${Math.round(Number(snapshot.profit?.coverage ?? 0) * 100)}% cost coverage)\n\nThese figures use confirmed records.`;
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
    const details = (loss.details ?? []).slice(0, 10).map((row) => `• ${row.product_name}: ${Number(row.quantity).toLocaleString('en-US')}${row.unit ? ` ${row.unit}` : ''}${row.reason ? ` — ${row.reason}` : ''}`).join('\n');
    return lang === 'sw'
      ? `Potevu wa stock ${label}:\n${details || '• Hakuna bidhaa iliyorekodiwa'}\nThamani iliyojulikana: ${money(loss.amount)}\nMatukio yasiyo na valuation: ${loss.unvalued_events ?? 0}${loss.valuation_complete === false ? '\nThamani haijakamilika; sijakisia sehemu iliyokosekana.' : ''}`
      : `Stock loss for ${label}:\n${details || '• No recorded items'}\nKnown value: ${money(loss.amount)}\nUnvalued events: ${loss.unvalued_events ?? 0}${loss.valuation_complete === false ? '\nValuation is incomplete; the missing value was not guessed.' : ''}`;
  }
  if (tool === 'ai_owner_use') {
    const use = snapshot.owner_use ?? {};
    return lang === 'sw'
      ? `Stock iliyotumika na mwenye biashara ${label}:\nKiasi: ${Number(use.quantity ?? 0).toLocaleString('en-US')}\nThamani iliyorekodiwa: ${money(use.amount)}\nMatukio: ${use.events ?? 0}`
      : `Owner-use stock for ${label}:\nQuantity: ${Number(use.quantity ?? 0).toLocaleString('en-US')}\nRecorded value: ${money(use.amount)}\nEvents: ${use.events ?? 0}`;
  }
  if (tool === 'ai_whole_animals') {
    const animals = snapshot.whole_animals ?? {};
    const details = (animals.procurements ?? []).slice(0, 10).map((row) => {
      const outputs = (row.breakdowns ?? []).flatMap((breakdown) => breakdown.outputs ?? [])
        .map((output) => `${output.product_name} ${Number(output.quantity).toLocaleString('en-US')} ${output.unit}`).join(', ');
      return `• ${row.animal_type} × ${row.animal_count}: ${outputs || (lang === 'sw' ? 'breakdown bado' : 'breakdown pending')}`;
    }).join('\n');
    return lang === 'sw'
      ? `Wanyama wazima ${label}:\nWalionunuliwa: ${animals.count ?? 0}\nGharama: ${money(animals.total)}\nBado hawajafanyiwa breakdown: ${animals.pending_breakdown ?? 0}\n${details}${Number(animals.allocation_incomplete ?? 0) > 0 ? `\n\nBreakdown ${animals.allocation_incomplete} hazijagawa gharama kwenye outputs; faida ya kila output haijakamilika.` : ''}`
      : `Whole animals for ${label}:\nPurchased: ${animals.count ?? 0}\nCost: ${money(animals.total)}\nAwaiting breakdown: ${animals.pending_breakdown ?? 0}\n${details}${Number(animals.allocation_incomplete ?? 0) > 0 ? `\n\n${animals.allocation_incomplete} breakdown(s) have incomplete output cost allocation.` : ''}`;
  }
  return lang === 'sw' ? 'Sina report ya aina hiyo bado.' : 'That report is not available yet.';
}
