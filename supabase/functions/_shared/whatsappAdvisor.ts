// Risip as a business adviser, not a filing cabinet.
//
// The owner's complaint, in their words: Risip could tell you what happened but
// not what to DO about it. It would report sales of 2,393,250 and expenses of
// 25,700 and call that a healthy month, while two products were being sold
// below what they cost to buy and six had run to zero without anybody saying so.
//
// Everything here is assembled from figures the database already verified. This
// module does no arithmetic on money it was not given, invents no product, and
// names nothing it cannot show a number for. What it adds is ORDER: the facts
// that change a decision, first, and the one thing to do tomorrow morning, last.
//
// The brief is built deterministically so it works with the model unavailable,
// out of budget, or refusing. When the model IS available it receives this same
// payload as a tool result and writes it in its own voice — same numbers,
// warmer words. It can never reach past what is here.

import type { Lang } from './whatsappIntent.ts';

export type AdvisorProduct = {
  name: string;
  quantity: number;
  revenue: number;
  margin: number | null;
};

export type AdvisorShelfItem = {
  name: string;
  onHand: number;
  unit: string | null;
};

export type AdvisorPayload = {
  businessName: string;
  /** "wiki hii", "mwezi huu" — the window every figure below belongs to. */
  periodLabel: string;
  revenue: number;
  expenses: number;
  debtIssued: number;
  customerPayments: number;
  /** Ranked by revenue, best first. */
  topMovers: AdvisorProduct[];
  /** Every product sold below its buying cost. Never truncated. */
  belowCost: AdvisorProduct[];
  /** Counted, on the shelf, and not sold once in this period. */
  deadStock: AdvisorShelfItem[];
  /** Counted and at or below zero. */
  outOfStock: string[];
  /** Counted, above zero, and down to the last few. */
  runningLow: AdvisorShelfItem[];
  /** Products with sales but no buying cost, so their margin is unknown. */
  uncosted: string[];
  outstandingDebt: number;
  topDebtors: Array<{ name: string; amount: number }>;
};

const money = (value: number) =>
  `${value < 0 ? '−' : ''}TSh ${Math.abs(Math.round(value)).toLocaleString('en-US')}`;

const list = (names: string[], limit = 4) => {
  const shown = names.slice(0, limit).join(', ');
  return names.length > limit ? `${shown} (+${names.length - limit})` : shown;
};

/**
 * "Nipe ushauri", "biashara yangu ikoje", "nifanye nini kesho".
 *
 * Deliberately narrow. This is an expensive, wide-ranging answer, and a
 * shopkeeper who asked "daftari ziko ngapi" wants a number, not a consultation.
 */
export function parseAdvisorRequest(text: string | null | undefined): boolean {
  const said = String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!said || said.length > 120) return false;
  return /\b(?:nipe\s+ushauri|ushauri|nishauri|unanishauri|nishaurije|mchanganuo|nifanye\s+nini|nianzie\s+wapi|biashara\s+(?:yangu\s+)?(?:ikoje|inaendeleaje|iko\s*je)|advice|advise\s+me|what\s+should\s+i\s+do|how\s+is\s+my\s+business)\b/
    .test(said);
}

/**
 * The three sections the owner asked for, in the order that matters.
 *
 * A loss goes above a record month, because a record month with a loss inside
 * it is still leaking money, and the leak is the part somebody can close
 * tomorrow. Nothing is padded: a section with nothing to say is left out
 * entirely rather than filled with "hakuna mabadiliko".
 */
export function advisorBrief(payload: AdvisorPayload, lang: Lang): string {
  const sw = lang === 'sw';
  const out: string[] = [];

  // 📊 What the numbers say.
  const stats: string[] = [];
  stats.push(sw
    ? `• Mauzo ${payload.periodLabel}: *${money(payload.revenue)}*`
    : `• Sales ${payload.periodLabel}: *${money(payload.revenue)}*`);
  if (payload.expenses > 0) {
    stats.push(sw ? `• Matumizi: ${money(payload.expenses)}` : `• Expenses: ${money(payload.expenses)}`);
  }
  if (payload.topMovers.length > 0) {
    const king = payload.topMovers[0];
    stats.push(sw
      ? `• Mfalme wa mauzo: *${king.name}* — ${money(king.revenue)}`
      : `• Top seller: *${king.name}* — ${money(king.revenue)}`);
  }
  if (payload.belowCost.length > 0) {
    const total = payload.belowCost.reduce((sum, item) => sum + (item.margin ?? 0), 0);
    stats.push(sw
      ? `• ⚠️ Unauza chini ya gharama: *${list(payload.belowCost.map((item) => item.name))}* — ${money(total)}`
      : `• ⚠️ Selling below cost: *${list(payload.belowCost.map((item) => item.name))}* — ${money(total)}`);
  }
  if (payload.outOfStock.length > 0) {
    stats.push(sw
      ? `• Zimeisha: ${list(payload.outOfStock)}`
      : `• Out of stock: ${list(payload.outOfStock)}`);
  }
  if (payload.outstandingDebt > 0) {
    stats.push(sw
      ? `• Unadaiwa mtaani: ${money(payload.outstandingDebt)}`
      : `• Owed to you: ${money(payload.outstandingDebt)}`);
  }
  out.push(sw ? `📊 *Tathmini ya takwimu*\n${stats.join('\n')}` : `📊 *The numbers*\n${stats.join('\n')}`);

  // 💡 What to do about it. Two or three, never a lecture.
  const advice: string[] = [];
  if (payload.belowCost.length > 0) {
    const worst = payload.belowCost[0];
    advice.push(sw
      ? `*Ziba mtaji unaovuja.* ${worst.name} inakuletea ${money(worst.margin ?? 0)}. `
        + `Pandisha bei au tafuta muuzaji mwingine — kila unayouza unapoteza.`
      : `*Stop the leak.* ${worst.name} is running at ${money(worst.margin ?? 0)}. `
        + `Raise the price or find another supplier — every one you sell loses money.`);
  }
  if (payload.outOfStock.length > 0) {
    advice.push(sw
      ? `*Rudisha mzigo uliokwisha.* ${list(payload.outOfStock)} zimefika sifuri — `
        + `kila siku bila hizo ni mteja anayeenda duka la jirani.`
      : `*Restock what is finished.* ${list(payload.outOfStock)} are at zero — `
        + `every day without them is a customer walking to the next shop.`);
  }
  if (payload.deadStock.length > 0) {
    advice.push(sw
      ? `*Mtaji umelala.* ${list(payload.deadStock.map((item) => item.name))} hazijatoka ${payload.periodLabel}. `
        + `Usiongeze stoko hapo; geuza mtaji kwenda kwenye zinazouza.`
      : `*Capital asleep.* ${list(payload.deadStock.map((item) => item.name))} did not move ${payload.periodLabel}. `
        + `Do not restock those; move the capital to what sells.`);
  }
  if (payload.topDebtors.length > 0) {
    const first = payload.topDebtors[0];
    advice.push(sw
      ? `*Fuatilia deni.* ${first.name} anadaiwa ${money(first.amount)}. Hiyo ni mtaji wako uliolala mtaani.`
      : `*Chase the debt.* ${first.name} owes ${money(first.amount)}. That is your capital sitting outside.`);
  }
  if (payload.uncosted.length > 0 && advice.length < 3) {
    advice.push(sw
      ? `*Weka bei ya kununua.* ${list(payload.uncosted)} hazina gharama ya kununua, `
        + `kwa hiyo siwezi kukuambia faida yake. Tuma: "${payload.uncosted[0]} nimenunua kwa 500 kila moja".`
      : `*Set the buying cost.* ${list(payload.uncosted)} have no cost recorded, `
        + `so I cannot tell you their margin. Send: "${payload.uncosted[0]} nimenunua kwa 500 kila moja".`);
  }
  if (advice.length === 0) {
    advice.push(sw
      ? '*Endelea hivyo hivyo.* Hakuna bidhaa inayouzwa chini ya gharama, hakuna iliyoisha, na hakuna deni lililokwama.'
      : '*Keep going.* Nothing is selling below cost, nothing has run out, and no debt is stuck.');
  }
  out.push((sw ? '💡 *Ushauri wa MD*\n' : '💡 *What to do*\n')
    + advice.slice(0, 3).map((line, at) => `${at + 1}. ${line}`).join('\n'));

  // 🚀 One thing, tomorrow morning.
  const tomorrow = payload.belowCost.length > 0
    ? (sw
      ? `Kabla hujafungua, panga bei mpya ya *${payload.belowCost[0].name}*. Ndiyo inayokula faida yako kimya kimya.`
      : `Before you open, set a new price for *${payload.belowCost[0].name}*. It is the one quietly eating your profit.`)
    : payload.outOfStock.length > 0
      ? (sw
        ? `Asubuhi nunua *${payload.outOfStock[0]}* kwanza — imeisha kabisa na wateja wanaiuliza.`
        : `First thing, buy *${payload.outOfStock[0]}* — it is at zero and customers are asking.`)
      : payload.topDebtors.length > 0
        ? (sw
          ? `Mpigie *${payload.topDebtors[0].name}* asubuhi kuhusu ${money(payload.topDebtors[0].amount)}.`
          : `Call *${payload.topDebtors[0].name}* in the morning about ${money(payload.topDebtors[0].amount)}.`)
        : payload.topMovers.length > 0
          ? (sw
            ? `Hakikisha *${payload.topMovers[0].name}* haiishi — ndiyo inayokuingizia zaidi.`
            : `Make sure *${payload.topMovers[0].name}* does not run out — it earns you the most.`)
          : (sw
            ? 'Hesabu stoko ya bidhaa tano unazouza zaidi, ili nikuambie faida halisi.'
            : 'Count the stock of your five best sellers, so I can show you the real margin.');
  out.push((sw ? '🚀 *Kazi ya kesho asubuhi*\n' : '🚀 *Tomorrow morning*\n') + tomorrow);

  return out.join('\n\n');
}

/**
 * The same payload, flattened for the model.
 *
 * Handed over as a tool result so the model can write the adviser's voice
 * without ever reaching past a verified figure. Every line is a fact with a
 * number attached; there is nothing here to extrapolate from.
 */
export function advisorEvidence(payload: AdvisorPayload): string {
  const rows: string[] = [
    `business=${payload.businessName}`,
    `period=${payload.periodLabel}`,
    `revenue=${Math.round(payload.revenue)}`,
    `expenses=${Math.round(payload.expenses)}`,
    `debt_issued=${Math.round(payload.debtIssued)}`,
    `customer_payments=${Math.round(payload.customerPayments)}`,
    `outstanding_debt=${Math.round(payload.outstandingDebt)}`,
  ];
  for (const item of payload.topMovers) {
    rows.push(`top_mover=${item.name}|qty=${item.quantity}|revenue=${Math.round(item.revenue)}`
      + `|margin=${item.margin === null ? 'unknown' : Math.round(item.margin)}`);
  }
  for (const item of payload.belowCost) {
    rows.push(`below_cost=${item.name}|qty=${item.quantity}|revenue=${Math.round(item.revenue)}`
      + `|margin=${Math.round(item.margin ?? 0)}`);
  }
  for (const item of payload.deadStock) rows.push(`dead_stock=${item.name}|on_hand=${item.onHand}`);
  for (const name of payload.outOfStock) rows.push(`out_of_stock=${name}`);
  for (const item of payload.runningLow) rows.push(`running_low=${item.name}|on_hand=${item.onHand}`);
  for (const name of payload.uncosted) rows.push(`no_buying_cost=${name}`);
  for (const debtor of payload.topDebtors) rows.push(`debtor=${debtor.name}|amount=${Math.round(debtor.amount)}`);
  return rows.join('\n');
}

/**
 * How to speak when handing this back.
 *
 * The voice is the owner's own brief: a trusted MD who talks like a trader, not
 * a bank. The constraints are the important half — a charming adviser who
 * invents a number is worse than a dull one who does not.
 */
export const ADVISOR_VOICE = `ADVISER MODE (get_business_advice)
- Speak as a trusted MD who talks like a Tanzanian trader: warm, direct, respectful. "Bosi wangu", "mtaji", "stoko", "mzunguko wa mzigo", "faida halisi". Never academic.
- Use exactly these three sections, in this order, with these headers:
  📊 *Tathmini ya takwimu* — what the figures show, as bullets, boldest fact first.
  💡 *Ushauri wa MD* — two or three numbered actions, each tied to a figure above.
  🚀 *Kazi ya kesho asubuhi* — ONE thing to do before opening tomorrow.
- A LOSS OUTRANKS A RECORD MONTH. If any product is below cost, it leads, whatever the sales figure says.
- Every number must come from the tool result. Do not add, subtract, project, or estimate beyond it. If a figure is absent, say it is not recorded yet and say what to send to record it.
- Emojis mark the sections and nothing else. Never put one on a loss.
- Short lines. This is read one-handed behind a counter.`;
