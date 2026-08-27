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
  /**
   * Products whose PAST SALES came in below what they cost to buy.
   *
   * History, and true whatever happens next: those shillings are gone. It is
   * not a reason to act if the price has since been raised.
   */
  belowCost: AdvisorProduct[];
  /**
   * Products whose PRICE RIGHT NOW is below what they cost to buy.
   *
   * MEASURED FAILURE, the owner's own thread: they raised Velvet napkin from
   * 200 to 4,000 and Sodaa from 200 to 2,000, and the next brief still said
   * "Unauza chini ya gharama: Velvet napkin, Sodaa" and told them to go and set
   * a new price. The figure came from past sale lines — correct arithmetic,
   * wrong tense, and advice for a job already done.
   *
   * This is the one that means DO SOMETHING. The other is a fact about
   * yesterday.
   */
  priceBelowCost: Array<{ name: string; retail: number; cost: number }>;
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

export type PartOfDay = 'asubuhi' | 'mchana' | 'jioni' | 'usiku';

/**
 * What time it is where the shop is, not where the server is.
 *
 * Risip runs in Frankfurt and the shop is in Dar es Salaam, three hours ahead.
 * Nothing in the product knew that, so "kazi ya kesho asubuhi" was said at
 * seven in the morning — when tomorrow is a day away and the thing to do is
 * today, before opening. A greeting has the same problem in reverse: "habari
 * za jioni" at breakfast is the tell that nobody is really there.
 */
export function partOfDay(now = new Date()): PartOfDay {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', hour12: false,
  }).format(now));
  if (hour < 12) return 'asubuhi';
  if (hour < 16) return 'mchana';
  if (hour < 19) return 'jioni';
  return 'usiku';
}

/** The greeting a Tanzanian would actually open with at this hour. */
export function timeGreeting(lang: Lang, now = new Date()): string {
  const part = partOfDay(now);
  if (lang !== 'sw') {
    return { asubuhi: 'Good morning', mchana: 'Good afternoon', jioni: 'Good evening', usiku: 'Good evening' }[part];
  }
  return {
    asubuhi: 'Habari za asubuhi', mchana: 'Habari za mchana',
    jioni: 'Habari za jioni', usiku: 'Habari za usiku',
  }[part];
}

/**
 * When the one focused action should happen.
 *
 * Asked at seven in the morning, "kesho asubuhi" is a day late — the shop has
 * not opened yet and the thing can be done now. Asked at nine at night, it is
 * exactly right.
 */
export function actionWhen(lang: Lang, now = new Date()): string {
  // The owner asked for this to stop naming a time window at all: "toa hilo
  // neno kabla ya kufungua leo, sema kivingine na sio kabla ya muda flani."
  // They are right. Guessing when somebody opens their shop was never the
  // point — the point is that ONE thing matters more than the rest. So the
  // heading says that instead, and says it the same way whatever the hour.
  //
  // partOfDay stays, because greetings still need it.
  void partOfDay(now);
  return lang === 'sw' ? 'Anza na hili' : 'Start with this';
}

const list = (names: string[], limit = 4) => {
  const shown = names.slice(0, limit).join(', ');
  return names.length > limit ? `${shown} (+${names.length - limit})` : shown;
};

/**
 * "Nipe ushauri", "biashara yangu ikoje", "nifanye nini kesho".
 *
 * Deliberately narrow. This is an expensive, wide-ranging answer, and a
 * shopkeeper who asked "daftari ziko ngapi" wants a number, not a consultation.
 *
 * MEASURED FAILURE, one minute after two questions had been answered properly:
 * "leo mambo yakoje?" came back with the generic help menu. It is the same
 * question as "biashara yangu ikoje" in the words people actually use when they
 * are not being formal — and the shop had just watched Risip answer twice, so
 * being handed a list of topics read as Risip not understanding Swahili.
 *
 * The additions stay narrow in the same way: they are asking how things ARE,
 * never how much of something there is.
 */
export function parseAdvisorRequest(text: string | null | undefined): boolean {
  const said = String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!said || said.length > 120) return false;
  return /\b(?:nipe\s+ushauri|ushauri|nishauri|unanishauri|nishaurije|mchanganuo|nifanye\s+nini|nianzie\s+wapi|biashara\s+(?:yangu\s+)?(?:ikoje|inaendeleaje|iko\s*je)|advice|advise\s+me|what\s+should\s+i\s+do|how\s+is\s+my\s+business)\b/
    .test(said)
    // "mambo yakoje", "hali ikoje", "duka likoje", "vipi biashara", "kunaendeleaje"
    || /\b(?:mambo\s+(?:yakoje|yako\s*je|vipi)|hali\s+(?:ikoje|iko\s*je|yakoje)|duka\s+(?:likoje|liko\s*je|linaendeleaje)|kunaendeleaje|inaendeleaje|vipi\s+biashara|biashara\s+vipi|hows?\s+business|how\s+are\s+things)\b/
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
export function advisorBrief(payload: AdvisorPayload, lang: Lang, now = new Date()): string {
  const sw = lang === 'sw';
  const when = actionWhen(lang, now);
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
  // The price that is wrong NOW. This is the one to act on.
  if (payload.priceBelowCost.length > 0) {
    stats.push(sw
      ? `• ⚠️ Bei ya sasa iko chini ya gharama: *${list(payload.priceBelowCost.map((item) => item.name))}*`
      : `• ⚠️ Price is below cost right now: *${list(payload.priceBelowCost.map((item) => item.name))}*`);
  }
  // What already happened. Past tense, deliberately: if the price has since
  // been raised there is nothing left to do about these.
  if (payload.belowCost.length > 0) {
    const total = payload.belowCost.reduce((sum, item) => sum + (item.margin ?? 0), 0);
    const fixed = payload.priceBelowCost.length === 0;
    stats.push(sw
      ? `• ${fixed ? '' : '⚠️ '}Uliuza chini ya gharama ${payload.periodLabel}: *${list(payload.belowCost.map((item) => item.name))}* — ${money(total)}`
        + (fixed ? ' _(bei imeshapandishwa)_' : '')
      : `• ${fixed ? '' : '⚠️ '}Sold below cost ${payload.periodLabel}: *${list(payload.belowCost.map((item) => item.name))}* — ${money(total)}`
        + (fixed ? ' _(price has since been raised)_' : ''));
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
  // Only when the price is STILL wrong. Telling somebody to raise a price they
  // raised an hour ago is how an adviser stops being read.
  if (payload.priceBelowCost.length > 0) {
    const worst = payload.priceBelowCost[0];
    advice.push(sw
      ? `*Ziba mtaji unaovuja.* ${worst.name} unaiuza ${money(worst.retail)} na unainunua ${money(worst.cost)}. `
        + `Pandisha bei au tafuta muuzaji mwingine — kila unayouza unapoteza.`
      : `*Stop the leak.* ${worst.name} sells at ${money(worst.retail)} and costs ${money(worst.cost)}. `
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
  const tomorrow = payload.priceBelowCost.length > 0
    ? (sw
      ? `Panga bei mpya ya *${payload.priceBelowCost[0].name}*. Ndiyo inayokula faida yako kimya kimya.`
      : `Set a new price for *${payload.priceBelowCost[0].name}*. It is the one quietly eating your profit.`)
    : payload.outOfStock.length > 0
      ? (sw
        ? `Nunua *${payload.outOfStock[0]}* kwanza — imeisha kabisa na wateja wanaiuliza.`
        : `Buy *${payload.outOfStock[0]}* first — it is at zero and customers are asking.`)
      : payload.topDebtors.length > 0
        ? (sw
          ? `Mpigie *${payload.topDebtors[0].name}* kuhusu ${money(payload.topDebtors[0].amount)}.`
          : `Call *${payload.topDebtors[0].name}* about ${money(payload.topDebtors[0].amount)}.`)
        : payload.topMovers.length > 0
          ? (sw
            ? `Hakikisha *${payload.topMovers[0].name}* haiishi — ndiyo inayokuingizia zaidi.`
            : `Make sure *${payload.topMovers[0].name}* does not run out — it earns you the most.`)
          : (sw
            ? 'Hesabu stoko ya bidhaa tano unazouza zaidi, ili nikuambie faida halisi.'
            : 'Count the stock of your five best sellers, so I can show you the real margin.');
  // The heading says WHEN, worked out from the clock in Dar es Salaam. Asked
  // at seven in the morning, "kesho asubuhi" is a day late.
  out.push(`🚀 *${when}*\n${tomorrow}`);

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
    rows.push(`sold_below_cost_in_period=${item.name}|qty=${item.quantity}|revenue=${Math.round(item.revenue)}`
      + `|margin=${Math.round(item.margin ?? 0)}`);
  }
  for (const item of payload.priceBelowCost) {
    rows.push(`price_below_cost_now=${item.name}|retail=${Math.round(item.retail)}|cost=${Math.round(item.cost)}`);
  }
  if (payload.priceBelowCost.length === 0 && payload.belowCost.length > 0) {
    rows.push('note=every below-cost sale above is HISTORY; the current price is now above cost');
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
/**
 * The rules that decide what a good answer looks like, per category.
 *
 * The owner's own idea, and the right one: Haiku is a language model, so give
 * it the RULES and let it work out the answer, instead of handing it sentences
 * to recite. Code owns the arithmetic; these own the judgement.
 */
export const BUSINESS_RULES = `BUSINESS RULES

WHY SALES MOVED
- "Kwa nini mauzo yanashuka?" is a comparison, never an impression. Call
  get_sales_trend, which puts this period against the same length before it and
  names the products that account for the gap.
- Report the direction, then the size, then the products. No adjectives: a drop
  of nine per cent is nine per cent, not "slight" or "worrying".
- A product that sold before and has stopped is a different fact from one that
  fell. Say which.
- Never explain a fall with a reason the data cannot show. Weather, holidays and
  competitors are guesses; the products that moved are not.

A TARGET, AND THE GAP TO IT
- "Nipe mbinu za kufika mauzo ya milioni kumi" is arithmetic before it is
  advice. Work from the figures you were given: what has come in, how much of
  the period is gone, what the daily pace has been, and therefore what pace the
  rest of the period needs. State the gap as a number.
- Then say which products could close it — the ones already selling, by revenue,
  and what raising a below-cost price would add. Never invent a growth rate.
- If the target is out of reach at the current pace, say so plainly and say what
  pace would reach it. A shopkeeper can act on "you need 400,000 a day"; they
  cannot act on encouragement.

WHEN TO REORDER
- Stock is a question of DAYS, not units. A product selling six a day with
  twelve left has two days, and two days is the number worth saying.
- Anything already at zero outranks anything running low, and both outrank
  anything selling well.
- Never tell somebody to restock a product that has not moved this period. That
  is where their capital is already sleeping.

MIXED MEASURES
- A duka sells sugar by the kilo, oil by the litre and books one at a time.
  Never convert between weight, liquid and count, and never convert inside one
  without a figure the trader gave you: a gunia of rice is not a gunia of
  charcoal, and a debe is a different size in every trade.
- The unit belongs to the product beside it, not to the whole line.
- Fractions are ordinary: "kilo moja na nusu" is 1.5, "robo" is 0.25.
- Each selling portion carries its own price. Never derive one from another by
  dividing — a robo is almost never a quarter of the litre price, and that gap
  is the shop's living.
- If a line names a measure the product was never registered in, ask. Do not
  translate it yourself.`;

/**
 * What the adviser must be TRUE about — not what it must look like.
 *
 * This block used to contain both halves of a contradiction. Its first rule
 * said "Returning the same three-section block whatever was asked is what makes
 * an assistant feel like a machine, and the owner has said so." Three rules
 * later it said "Use exactly these three sections, in this order, with these
 * headers", and named them. The second rule won every time, because it was the
 * concrete one, and the owner went on receiving the same MD brief whether he
 * asked for a recap, a reason or a target.
 *
 * The headings are gone. Everything below is about the truth of the numbers and
 * the judgement behind them, which is what a shopkeeper is actually paying for.
 * How to lay the answer out is the model's decision, made per question.
 */
export const ADVISOR_VOICE = `ADVISER FACTS (get_business_advice)
- These figures are EVIDENCE, not an answer. Work out what matters for the
  question in front of you and say that. A request for the whole review, a
  request for the arithmetic of a target, and a question about why sales moved
  are three different answers from the same payload.
- A LOSS OUTRANKS A RECORD MONTH. If any product's CURRENT PRICE is below cost
  (price_below_cost_now), it leads, whatever the sales figure says.
- TWO DIFFERENT FACTS, TWO DIFFERENT TENSES. "sold_below_cost_in_period" is
  history — those shillings are gone and nothing can be done about them.
  "price_below_cost_now" is a price that is still wrong and still costing money
  on every sale. Never tell somebody to raise a price they have already raised:
  if the second list is empty, say the loss was made before the price was fixed
  and move on.
- Every number must come from the tool result. Do not add, subtract, project or
  estimate beyond it. If a figure is absent, say it is not recorded yet and say
  what to send to record it.
- Speak as a trusted MD who talks like a Tanzanian trader: warm, direct,
  respectful. Never academic. Short lines — this is read one-handed behind a
  counter.
- Never put an emoji on a loss.`;

// ------------------------------------------------------------ why it moved

export type TrendProduct = { name: string; before: number; after: number; delta: number };

export type SalesTrend = {
  periodLabel: string;
  previousLabel: string;
  revenue: number;
  previousRevenue: number;
  /** Products whose revenue fell the most, biggest drop first. */
  fell: TrendProduct[];
  /** Products whose revenue rose the most, biggest rise first. */
  rose: TrendProduct[];
  /** Sold in the previous period and not once in this one. */
  stopped: string[];
};

/**
 * "Kwa nini mauzo yanashuka?"
 *
 * The most useful question a shopkeeper asks and the one Risip could not touch:
 * every read tool answered about ONE window, so "are sales falling" had nothing
 * to compare against and the model was left to say something reassuring.
 *
 * A fall is not a feeling. It is this period against the one before it, and the
 * products that account for the difference.
 */
export function parseSalesTrendRequest(text: string | null | undefined): boolean {
  const said = String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!said || said.length > 140) return false;
  return /\b(?:kwa\s*nini|mbona|why)\b.*\b(?:mauzo|sales|biashara|inashuka|yanashuka|imeshuka)\b/.test(said)
    || /\bmauzo\b.*\b(?:yanashuka|yameshuka|yanapungua|yamepungua|yanapanda|yameongezeka)\b/.test(said)
    || /\bsales\b.*\b(?:down|dropping|falling|up|rising)\b/.test(said)
    || /\b(?:linganisha|compare)\b.*\b(?:wiki|mwezi|week|month)\b/.test(said);
}

/**
 * The comparison, in the order a trader reads it: the direction first, the size
 * of it second, and the products that caused it third. No adjectives — a drop
 * of nine per cent is not "worrying" or "slight", it is nine per cent.
 */
export function salesTrendReply(trend: SalesTrend, lang: Lang): string {
  const sw = lang === 'sw';
  const change = trend.revenue - trend.previousRevenue;
  const percent = trend.previousRevenue > 0
    ? Math.round((change / trend.previousRevenue) * 100)
    : null;

  if (trend.previousRevenue <= 0 && trend.revenue <= 0) {
    return sw
      ? `Sina mauzo yaliyothibitishwa ${trend.periodLabel} wala ${trend.previousLabel}, kwa hiyo sina cha kulinganisha.`
      : `I have no confirmed sales for ${trend.periodLabel} or ${trend.previousLabel}, so there is nothing to compare.`;
  }
  if (trend.previousRevenue <= 0) {
    return sw
      ? `${trend.periodLabel}: ${money(trend.revenue)}. ${trend.previousLabel} hakukuwa na mauzo yaliyothibitishwa, kwa hiyo bado siwezi kusema yanapanda au yanashuka.`
      : `${trend.periodLabel}: ${money(trend.revenue)}. There were no confirmed sales ${trend.previousLabel}, so I cannot yet say whether this is up or down.`;
  }

  const direction = change < 0
    ? (sw ? 'yameshuka' : 'are down')
    : change > 0 ? (sw ? 'yamepanda' : 'are up') : (sw ? 'hayajabadilika' : 'are flat');
  const size = percent === null ? '' : ` (${Math.abs(percent)}%)`;
  const head = sw
    ? `Mauzo ${direction}${size}: ${trend.periodLabel} ${money(trend.revenue)}, ${trend.previousLabel} ${money(trend.previousRevenue)}.`
    : `Sales ${direction}${size}: ${trend.periodLabel} ${money(trend.revenue)}, ${trend.previousLabel} ${money(trend.previousRevenue)}.`;

  const lines: string[] = [head];
  const movers = change < 0 ? trend.fell : trend.rose;
  if (movers.length > 0) {
    lines.push('');
    lines.push(sw
      ? (change < 0 ? 'Zilizoshusha zaidi:' : 'Zilizopandisha zaidi:')
      : (change < 0 ? 'Biggest falls:' : 'Biggest rises:'));
    for (const item of movers.slice(0, 4)) {
      lines.push(`• ${item.name}: ${money(item.before)} → ${money(item.after)}`);
    }
  }
  if (trend.stopped.length > 0) {
    lines.push('');
    lines.push(sw
      ? `Hazikuuzwa kabisa ${trend.periodLabel}: ${list(trend.stopped)}.`
      : `Did not sell at all ${trend.periodLabel}: ${list(trend.stopped)}.`);
  }
  return lines.join('\n');
}
