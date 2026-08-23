/**
 * Ask Risip a few hundred questions it has never seen, built out of the shop's
 * own database, and write down every one it gets wrong.
 *
 *   npx vite-node scripts/interrogate.ts
 *   npx vite-node scripts/interrogate.ts --seed 7 --company "St. Ritha bookshop"
 *
 * WHY THIS EXISTS
 *
 * Every eval file in this repo was written by somebody who already knew what
 * the parser does. That is useful, and it is also why bugs survive: the question
 * gets phrased the way the code expects. This harness has no such knowledge. It
 * reads the catalogue, the prices, the costs, the counts and the confirmed
 * records, invents questions out of those real names and real numbers the way a
 * shopkeeper would ask them, shuffles the topics together, mistypes some of
 * them, and checks each answer against arithmetic done separately from the
 * thing being tested.
 *
 * WHAT IT CAN AND CANNOT SEE
 *
 * It runs the real routing chain and the real reply builders — the same modules
 * the deployed webhook imports, not copies. For read questions it runs the real
 * database queries too, so the answer it prints is the answer the shop would
 * receive. What it cannot do is call the model: the Anthropic key lives only in
 * Edge Function secrets and stays there. A question that falls through to
 * `conversational_ai` is therefore reported as exactly that — not judged, but
 * NAMED, because a question about money that reaches the model is a question
 * being improvised instead of computed, and that is the finding, not a gap in
 * the harness.
 *
 * READ-ONLY. Selects and read RPCs. It writes nothing to the database.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { computedAmount, recordKind, route } from './lib/route.ts';
import {
  bandFor,
  changesSince,
  displayScore,
  score,
  summaryLine,
  type Change,
  type RunRecord,
  type TopicScore,
} from './lib/grade.ts';
import {
  buildBusinessSummaryReply,
  buildDebtorsReply,
  buildProfitReply,
  calculateBusinessSummary,
  calculateDebtors,
  calculateProfitEstimate,
  parseReadRequest,
  type ReadDailyLine,
  type ReadDailyRow,
  type ReadProductCost,
} from '../supabase/functions/_shared/whatsappReadTools.ts';
import {
  outOfStockReply,
  parseOutOfStockQuestion,
  parseStockQuestion,
  stockListReply,
  stockReply,
  type StockRow,
} from '../supabase/functions/_shared/whatsappStock.ts';
import {
  parseQuantityOnlySale,
  priceLine,
  quantitySaleConfirmation,
  type PricedLine,
} from '../supabase/functions/_shared/whatsappQuantitySale.ts';
import {
  needsBandChoice,
  priceBandQuestion,
  type PriceBandChoice,
} from '../supabase/functions/_shared/whatsappPriceBand.ts';
import { productKey } from '../supabase/functions/_shared/whatsappProductNames.ts';
import {
  parseSellingPriceQuestion,
  sellingPriceReply,
} from '../supabase/functions/_shared/whatsappSellingPriceQuestion.ts';
import {
  nearestCatalogueName,
  normalizeProductReadResolution,
} from '../supabase/functions/_shared/whatsappProductResolver.ts';

// --------------------------------------------------------------- connection

/**
 * The environment, from the process first and the file second.
 *
 * CI has no .env.local and must never have one — the service-role key lives in
 * the runner's secret store and is passed in as an environment variable. A
 * developer's machine has the file and no exported variables. Both work, and
 * neither puts the key anywhere it can be committed.
 */
function env(): { url: string; key: string } {
  let fromFile = (_name: string): string => '';
  try {
    const text = readFileSync(resolvePath(process.cwd(), '.env.local'), 'utf8');
    fromFile = (name: string) => {
      const line = text.split(/\r?\n/).find((row) => row.startsWith(name + '='));
      return line ? line.slice(name.length + 1).trim() : '';
    };
  } catch {
    // No file. In CI that is the normal case, not an error.
  }
  const read = (...names: string[]) => {
    for (const name of names) {
      const value = process.env[name];
      if (value) return value.trim();
    }
    for (const name of names) {
      const value = fromFile(name);
      if (value) return value;
    }
    return '';
  };
  const url = read('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = read('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, '
      + 'or put VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  return { url, key };
}

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf('--' + name);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

// ------------------------------------------------------------------- the shop

type Product = {
  key: string;
  name: string;
  retail: number | null;
  wholesale: number | null;
  minQty: number | null;
  cost: number | null;
  onHand: number;
  hasCount: boolean;
  /**
   * Sold by a measure — lita, nusu, robo — so "nimeuza mafuta 9" has no answer
   * until the measure is named. Risip asks; a question generated from this
   * product would be judging the harness, not Risip.
   */
  portioned: boolean;
};

type Shop = {
  companyId: string;
  companyName: string;
  profileId: string;
  products: Product[];
  stock: StockRow[];
  rows: ReadDailyRow[];
  lines: ReadDailyLine[];
  costs: ReadProductCost[];
  parties: string[];
  suspect: string[];
};

/**
 * Names that are not really products.
 *
 * "jumla" priced at two shillings is not something the shop sells — it is a
 * price-band word that a bug recorded as a product. Building questions out of it
 * would test the harness, not Risip. They are listed at the end instead, because
 * catalogue damage is itself a finding.
 */
function looksLikeDamage(product: Product): boolean {
  if (product.name.length > 28) return true;
  if (/^(jumla|rejareja|retail|wholesale|mauzo|manunuzi)$/i.test(product.name.trim())) return true;
  if ((product.retail ?? 0) > 0 && (product.retail ?? 0) < 50) return true;
  return false;
}

async function loadShop(db: SupabaseClient, wanted: string): Promise<Shop> {
  const { data: companies } = await db.from('companies').select('id, name');
  const company = (companies ?? []).find((row: { name: string }) =>
    row.name.toLowerCase().includes(wanted.toLowerCase()));
  if (!company) throw new Error('no company matching ' + JSON.stringify(wanted));
  const companyId = String(company.id);

  const { data: members } = await db.from('company_members')
    .select('profile_id, role').eq('company_id', companyId).is('deactivated_at', null);
  const owner = (members ?? []).find((row: { role: string }) => row.role === 'owner') ?? (members ?? [])[0];
  if (!owner) throw new Error('that company has no members');

  const [{ data: prices }, { data: rawCosts }, { data: stockRows }, { data: catalogue }] = await Promise.all([
    db.from('product_selling_prices')
      .select('product_key, product_name, retail_price, wholesale_price, wholesale_min_qty, sale_unit_key, effective_from')
      .eq('company_id', companyId).order('effective_from', { ascending: true }).limit(5000),
    db.from('product_costs').select('product_key, unit_cost, effective_from')
      .eq('company_id', companyId).order('effective_from', { ascending: true }).limit(5000),
    db.rpc('wa_stock_on_hand', { p_company_id: companyId, p_product: null }),
    db.rpc('company_product_names', { p_company_id: companyId }),
  ]);

  const latestPrice = new Map<string, Record<string, unknown>>();
  const portioned = new Set<string>();
  for (const row of (prices ?? []) as Array<Record<string, unknown>>) {
    // wa_product_pricing reads only the rows with no sale unit. A product whose
    // prices all carry one is sold by measure, and the plain price list has
    // nothing to say about it.
    if (row.sale_unit_key) { portioned.add(String(row.product_key)); continue; }
    latestPrice.set(String(row.product_key), row);
  }
  const latestCost = new Map<string, number>();
  for (const row of (rawCosts ?? []) as Array<Record<string, unknown>>) {
    latestCost.set(String(row.product_key), Number(row.unit_cost));
  }

  const stock: StockRow[] = ((stockRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    productName: String(row.product_name ?? ''),
    unit: row.unit ? String(row.unit) : null,
    measured: Boolean(row.measured),
    onHand: Number(row.on_hand ?? 0),
    hasCount: Boolean(row.has_count),
    countedAt: row.counted_at ? String(row.counted_at) : null,
    boughtSince: Number(row.bought_since ?? 0),
    soldSince: Number(row.sold_since ?? 0),
    incompletePurchases: Boolean(row.incomplete_purchases),
  }));
  const stockByKey = new Map(stock.map((row) => [productKey(row.productName), row]));

  const names = new Map<string, string>();
  for (const row of (catalogue ?? []) as Array<Record<string, unknown>>) {
    const name = String(row.product_name ?? '').trim();
    if (name) names.set(productKey(name), name);
  }
  for (const [key, row] of latestPrice) names.set(key, String(row.product_name ?? key));

  const all: Product[] = [...names.entries()].map(([key, name]) => {
    const price = latestPrice.get(key);
    const counted = stockByKey.get(key);
    return {
      key,
      name,
      retail: price?.retail_price == null ? null : Number(price.retail_price),
      wholesale: price?.wholesale_price == null ? null : Number(price.wholesale_price),
      minQty: price?.wholesale_min_qty == null ? null : Number(price.wholesale_min_qty),
      cost: latestCost.get(key) ?? null,
      onHand: counted?.onHand ?? 0,
      hasCount: counted?.hasCount ?? false,
      portioned: portioned.has(key),
    };
  });

  const { data: dailyRows } = await db.from('daily_records')
    .select('id, kind, status, amount, party_name, occurred_at')
    .eq('company_id', companyId).eq('status', 'confirmed')
    .order('occurred_at', { ascending: true }).limit(10000);
  const rows: ReadDailyRow[] = ((dailyRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    kind: String(row.kind),
    status: String(row.status),
    amount: Number(row.amount),
    partyName: row.party_name ? String(row.party_name) : null,
    occurredAt: String(row.occurred_at),
  }));
  const ids = ((dailyRows ?? []) as Array<{ id: string }>).map((row) => row.id);
  const { data: rawLines } = ids.length > 0
    ? await db.from('daily_record_lines')
      .select('daily_record_id, description, quantity, line_total').in('daily_record_id', ids).limit(20000)
    : { data: [] as Array<Record<string, unknown>> };
  const occurredById = new Map(((dailyRows ?? []) as Array<{ id: string; occurred_at: string }>)
    .map((row) => [row.id, row.occurred_at]));
  const lines: ReadDailyLine[] = ((rawLines ?? []) as Array<Record<string, unknown>>).map((line) => ({
    description: String(line.description),
    quantity: Number(line.quantity),
    lineTotal: Number(line.line_total),
    occurredAt: occurredById.get(String(line.daily_record_id)) ?? new Date().toISOString(),
  }));

  return {
    companyId,
    companyName: String(company.name),
    profileId: String(owner.profile_id),
    products: all.filter((product) => !looksLikeDamage(product)),
    suspect: all.filter(looksLikeDamage).map((product) => product.name),
    stock,
    rows,
    lines,
    costs: ((rawCosts ?? []) as Array<Record<string, unknown>>).map((cost) => ({
      productKey: String(cost.product_key),
      unitCost: Number(cost.unit_cost),
      effectiveFrom: String(cost.effective_from),
    })),
    parties: [...new Set(rows.map((row) => row.partyName).filter((name): name is string => Boolean(name)))],
  };
}

// ------------------------------------------------------- how questions are made

/** Seeded so a run can be repeated exactly, and a failure re-found. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Dice = () => number;
const pick = <T,>(dice: Dice, items: T[]): T => items[Math.floor(dice() * items.length) % items.length];
const chance = (dice: Dice, p: number) => dice() < p;

/**
 * How a phone actually mangles a message.
 *
 * Not noise for its own sake: every mutation here is one somebody has really
 * sent — a swap of neighbouring letters, a dropped vowel, no capitals at all,
 * a missing question mark, a double space where a thumb hit twice.
 */
function mistype(dice: Dice, text: string): string {
  // Split KEEPING the separators. Rejoining on a plain space used to weld a
  // twenty-line till roll into one line — "mauzo ya leo\nmkoba wa shule 2"
  // became "mauzo ya leomkoba wa shule 2", which is not a typo anybody makes
  // and left the harness marking its own damage as a defect in Risip.
  const parts = text.split(/(\s+)/);
  const wordAt = (min: number) =>
    parts.findIndex((part, at) => at % 2 === 0 && part.length >= min);
  const kind = Math.floor(dice() * 5);

  if (kind === 0) {
    const at = wordAt(5);
    if (at < 0) return text;
    const word = parts[at];
    const i = 1 + Math.floor(dice() * (word.length - 2));
    parts[at] = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    return parts.join('');
  }
  if (kind === 1) {
    const at = wordAt(6);
    if (at < 0) return text;
    const word = parts[at];
    const i = 1 + Math.floor(dice() * (word.length - 2));
    parts[at] = word.slice(0, i) + word.slice(i + 1);
    return parts.join('');
  }
  if (kind === 2) return text.toUpperCase();
  if (kind === 3) return text.replace(/[?.,]/g, '');
  // A thumb hitting the space bar twice. Only a real space, never a newline.
  return text.replace(/ /, '  ');
}

// ------------------------------------------------------------- the question bank

type Ask = {
  topic: string;
  said: string;
  /** Routes that would be a correct reading. Empty means "nothing computes this". */
  want: string[];
  /** The number the answer has to contain, worked out without the parser. */
  wantAmount?: number;
  /** The ledger fact the message states. */
  wantKind?: string;
  /** True when the right behaviour is a question back, not a total. */
  wantsBandQuestion?: boolean;
  /** What the database says, in words, for the report. */
  truth: string;
  /** Set when the answer has to come from the database, not from a parser. */
  execute?: boolean;
  /**
   * Routes that would be actively WRONG, whatever else happens.
   *
   * For messages where the valuable assertion is a negative: "sijauza chochote
   * leo" — I sold nothing today — must never become a sale, and a string of
   * emoji must never become a price. `want` says what good looks like; this
   * says what unacceptable looks like, and the two are not the same test.
   */
  forbid?: string[];
};

const SALE_VERB = ['nimeuza', 'niliuza', 'nimeuza leo', 'nimeuza', 'tumeuza'];
const ASK_STOCK = [
  (name: string) => `${name} ziko ngapi?`,
  (name: string) => `nina ${name} ngapi`,
  (name: string) => `stock ya ${name}`,
  (name: string) => `zimebaki ${name} ngapi`,
  (name: string) => `${name} zipo ngapi dukani`,
];
const ASK_PRICE = [
  (name: string) => `${name} ni bei gani?`,
  (name: string) => `nauza ${name} ngapi`,
  (name: string) => `bei ya ${name} ni ngapi`,
];

function buildAsks(shop: Shop, dice: Dice, count: number): Ask[] {
  const priced = shop.products.filter((product) => (product.retail ?? 0) > 0 && !product.portioned);
  const twoPrice = priced.filter((product) =>
    (product.wholesale ?? 0) > 0 && product.wholesale !== product.retail);
  const onePrice = priced.filter((product) => !(product.wholesale ?? 0) || product.wholesale === product.retail);
  const counted = shop.stock.filter((row) => row.hasCount);
  const asks: Ask[] = [];

  const make: Array<() => Ask | null> = [
    // A sale with no price named. The shop's own price list decides the money,
    // and where there are two prices the only right answer is a question.
    () => {
      const product = pick(dice, priced);
      const quantity = 1 + Math.floor(dice() * 12);
      const two = (product.wholesale ?? 0) > 0 && product.wholesale !== product.retail;
      return {
        topic: 'mauzo (bei kutoka kwenye orodha)',
        said: `${pick(dice, SALE_VERB)} ${product.name} ${quantity}`,
        want: ['quantity_sale'],
        wantsBandQuestion: two,
        wantAmount: two ? undefined : quantity * (product.retail as number),
        truth: two
          ? `${product.name}: rejareja ${product.retail}, jumla ${product.wholesale} — lazima aulizwe`
          : `${product.name} ${quantity} x ${product.retail}`,
      };
    },
    // A sale that names its own money. Nothing to look up, so the total is
    // arithmetic and any other number is wrong.
    () => {
      const product = pick(dice, priced);
      const quantity = 1 + Math.floor(dice() * 6);
      const total = quantity * (product.retail as number);
      return {
        topic: 'mauzo (bei imetajwa)',
        said: `nimeuza ${product.name} ${quantity} kwa ${total}`,
        want: ['daily_record', 'daily_record_parsed', 'quantity_sale'],
        wantAmount: total,
        wantKind: 'sale',
        truth: `${total} imetajwa kwenye ujumbe wenyewe`,
      };
    },
    // Several products on one line, the way a day's takings get typed.
    () => {
      const chosen = [pick(dice, onePrice.length > 1 ? onePrice : priced), pick(dice, priced), pick(dice, priced)]
        .filter((product, at, list) => list.findIndex((other) => other.key === product.key) === at);
      const parts = chosen.map((product) => `${product.name} ${1 + Math.floor(dice() * 5)}`);
      return {
        topic: 'mauzo ya mstari mmoja',
        said: `nimeuza ${parts.join(', ')}`,
        want: ['quantity_sale'],
        truth: `bidhaa ${chosen.length} kwenye ujumbe mmoja`,
      };
    },
    // Buying stock. The money is stated; the direction is the whole point.
    () => {
      const product = pick(dice, priced);
      const quantity = 5 + Math.floor(dice() * 40);
      const spent = quantity * Math.max(100, Math.round((product.cost ?? (product.retail as number) * 0.8) / 50) * 50);
      return {
        topic: 'manunuzi',
        said: `nimenunua ${product.name} ${quantity} kwa ${spent}`,
        want: ['daily_record', 'daily_record_parsed'],
        wantAmount: spent,
        wantKind: 'stock_purchase',
        truth: `manunuzi ya ${spent}`,
      };
    },
    () => {
      const what = pick(dice, ['umeme', 'maji', 'kodi ya duka', 'usafiri', 'mshahara wa kijana', 'bando']);
      const spent = pick(dice, [2000, 5000, 12000, 20000, 35000, 50000]);
      return {
        topic: 'matumizi',
        said: `${pick(dice, ['nimelipa', 'nimetumia'])} ${what} ${spent}`,
        want: ['daily_record', 'daily_record_parsed', 'bare_expense'],
        wantAmount: spent,
        wantKind: 'expense',
        truth: `matumizi ya ${spent}`,
      };
    },
  ];

  // Debts and payments. Same shape, opposite direction, and a name in front.
  make.push(() => {
    const who = shop.parties.length > 0 && chance(dice, 0.6)
      ? pick(dice, shop.parties)
      : pick(dice, ['Juma', 'Mama Asha', 'Mzee Bakari', 'Neema', 'Kaka Salum']);
    const owed = pick(dice, [3000, 7500, 12000, 25000, 40000]);
    return {
      topic: 'madeni',
      said: `${who} amechukua ${pick(dice, priced).name} kwa ${owed} deni`,
      want: ['daily_record', 'daily_record_parsed'],
      wantAmount: owed,
      wantKind: 'debt_issued',
      truth: `deni la ${owed} kwa ${who}`,
    };
  });
  make.push(() => {
    const who = shop.parties.length > 0 ? pick(dice, shop.parties) : 'Juma';
    const paid = pick(dice, [2000, 5000, 10000, 20000]);
    return {
      topic: 'malipo ya deni',
      said: `${who} amelipa deni ${paid}`,
      want: ['daily_record', 'daily_record_parsed'],
      wantAmount: paid,
      wantKind: 'customer_payment',
      truth: `malipo ya ${paid} kutoka ${who}`,
    };
  });

  // Counting the shelf, and asking about it. Both are arithmetic over the
  // shop's own numbers and neither should ever reach the model.
  make.push(() => {
    const row = counted.length > 0 ? pick(dice, counted) : null;
    if (!row) return null;
    return {
      topic: 'kuuliza stoko',
      said: pick(dice, ASK_STOCK)(row.productName),
      want: ['stock_question'],
      wantAmount: Math.max(0, Math.round(row.onHand)),
      truth: `${row.productName}: ${row.onHand} zilizopo`,
      execute: true,
    };
  });
  make.push(() => {
    const product = pick(dice, shop.products);
    const quantity = 5 + Math.floor(dice() * 90);
    return {
      topic: 'kuhesabu stoko',
      said: `${pick(dice, ['nimehesabu', 'nina', 'zimebaki'])} ${product.name} ${quantity}`,
      want: ['stock_count', 'stock_count_batch'],
      truth: `hesabu mpya: ${quantity}`,
    };
  });
  make.push(() => ({
    topic: 'zilizoisha',
    said: pick(dice, ['bidhaa gani zimeisha?', 'nini kimeisha dukani', 'zipi zimekwisha']),
    want: ['stock_question'],
    truth: `${shop.stock.filter((row) => row.hasCount && row.onHand <= 0).length} zimeisha`,
    execute: true,
  }));
  make.push(() => ({
    topic: 'orodha ya stoko',
    said: pick(dice, ['stock yangu ikoje', 'nionyeshe zilizopo', 'nina nini dukani']),
    want: ['stock_question'],
    truth: `${counted.length} bidhaa zimehesabiwa`,
    execute: true,
  }));

  // The money questions. Every number here is computed from daily_records by
  // this file, not by the thing being tested.
  make.push(() => ({
    topic: 'muhtasari wa siku',
    said: pick(dice, ['leo nimeuza kiasi gani?', 'mauzo ya leo ni ngapi', 'nimeingiza pesa ngapi leo']),
    want: ['ai_business_summary'],
    truth: 'jumla ya mauzo yaliyothibitishwa leo',
    execute: true,
  }));
  make.push(() => ({
    topic: 'faida',
    said: pick(dice, ['faida ya leo ni ngapi?', 'nimepata faida gani wiki hii', 'faida ya mwezi huu']),
    want: ['daily_profit_estimate'],
    truth: 'faida inayokadiriwa kutoka kwa gharama zilizosajiliwa',
    execute: true,
  }));
  make.push(() => ({
    topic: 'wanaodaiwa',
    said: pick(dice, ['nani ananidai?', 'madeni yangu yakoje', 'orodha ya wanaodaiwa']),
    want: ['ai_debtors'],
    truth: 'jumla ya madeni yasiyolipwa',
    execute: true,
  }));
  make.push(() => ({
    topic: 'bidhaa zinazouza',
    said: pick(dice, [
      'bidhaa gani inauza zaidi?', 'nini kimeuzika leo', 'bidhaa gani ina faida kubwa',
      'ni bidhaa gani zimeuzwa wiki hii',
    ]),
    want: ['product_analytics'],
    truth: `${shop.lines.length} mistari ya mauzo yenye majina`,
  }));

  make.push(() => {
    const product = pick(dice, priced);
    return {
      topic: 'bei ya bidhaa',
      said: pick(dice, ASK_PRICE)(product.name),
      want: ['selling_price_question'],
      wantAmount: product.retail as number,
      truth: `rejareja ${product.retail}${product.wholesale ? `, jumla ${product.wholesale}` : ''}`,
      execute: true,
    };
  });

  // Setting a price, and setting a cost. Writes, so a misread is permanent.
  make.push(() => {
    const product = pick(dice, priced);
    const price = Math.round((product.retail as number) * (1 + dice() * 0.3) / 50) * 50;
    return {
      topic: 'kuweka bei',
      said: `bei ya ${product.name} rejareja ${price}`,
      want: ['selling_price', 'selling_price_batch'],
      truth: `bei mpya ya rejareja ${price}`,
    };
  });
  make.push(() => {
    const product = pick(dice, priced);
    const cost = Math.round((product.retail as number) * 0.7 / 50) * 50;
    return {
      topic: 'gharama ya kununua',
      said: `${product.name} nimenunua kwa ${cost} kila moja`,
      want: ['product_cost', 'product_cost_batch', 'daily_record', 'daily_record_parsed'],
      truth: `gharama ${cost} kwa kila moja`,
    };
  });

  // Two subjects in one message. Nobody sends a clean single instruction all
  // day; the sale is the half that must not be lost.
  make.push(() => {
    const product = pick(dice, priced);
    const other = pick(dice, counted.length > 0 ? counted.map((row) => row.productName) : [product.name]);
    return {
      topic: 'mada mbili kwenye ujumbe mmoja',
      said: `nimeuza ${product.name} ${1 + Math.floor(dice() * 4)} halafu niambie ${other} ziko ngapi`,
      want: ['quantity_sale', 'daily_record', 'daily_record_parsed'],
      truth: 'mauzo kwanza, kisha swali la stoko',
    };
  });

  // Ordinary talk. Here the model IS the right answer, and a parser claiming it
  // would be the bug.
  make.push(() => ({
    topic: 'maongezi ya kawaida',
    said: pick(dice, [
      'mambo vip', 'asante sana', 'habari za asubuhi', 'risip inafanya nini',
      'naweza kukuuliza kitu', 'poa', 'nisaidie kuelewa hii app',
    ]),
    want: ['conversational_ai'],
    truth: 'hakuna hesabu inayohitajika',
  }));

  addChaos(make, shop, dice);

  while (asks.length < count) {
    const built = pick(dice, make)();
    if (!built) continue;
    // A third of everything goes out the way a thumb really sends it.
    asks.push(chance(dice, 0.33) ? { ...built, said: mistype(dice, built.said) } : built);
  }
  return asks;
}

// ------------------------------------------------------------------- the chaos
//
// The templates above ask reasonably. These do not.
//
// Everything here came from watching how the messages that actually break
// things are shaped: money said in words rather than digits, a till roll
// twenty lines long, a sentence that says nothing was sold, a thumb that hit
// the emoji key. The point is not to be difficult for its own sake — each of
// these has a right answer that can be checked, and several of them found
// defects the polite templates never touched.
//
// MONEY IN WORDS is the one that mattered most. "Nimelipa umeme elfu ishirini"
// was recorded as **TSh 20**. It parsed, it confirmed, and nobody was asked to
// look at it. That is how a shop's books quietly stop being true.

/** How money is said out loud, and what it is worth. */
const SPOKEN_MONEY: Array<[string, number]> = [
  ['elfu tano', 5_000],
  ['elfu kumi', 10_000],
  ['elfu ishirini', 20_000],
  ['elfu hamsini', 50_000],
  ['laki mbili', 200_000],
  ['mia tano', 500],
  ['elfu saba na mia tano', 7_500],
  ['elfu ishirini na tano', 25_000],
  ['milioni moja', 1_000_000],
];

/** The same amount, written the way a phone keypad writes it. */
const WRITTEN_MONEY: Array<[string, number]> = [
  ['12,500/=', 12_500],
  ['12500/-', 12_500],
  ['20k', 20_000],
  ['TSh 8,000', 8_000],
  ['35000', 35_000],
];

const NOTHING_HAPPENED = [
  'sijauza chochote leo',
  'hakuna kilichouzwa leo',
  'leo hakuna mauzo',
  'sijanunua kitu',
  'usirekodi hilo',
  'hapana sio hivyo',
];

const NOISE = ['😀😀😀', '?????', '.....', '👍', 'aaaaaaa', '...', '???'];

function addChaos(make: Array<() => Ask | null>, shop: Shop, dice: Dice): void {
  const priced = shop.products.filter((product) => (product.retail ?? 0) > 0 && !product.portioned);
  if (priced.length === 0) return;
  const counted = shop.stock.filter((row) => row.hasCount);

  // Money said in words. The amount is fixed by the phrase, not by the shop, so
  // the arithmetic is beyond argument.
  make.push(() => {
    const [phrase, amount] = pick(dice, SPOKEN_MONEY);
    const what = pick(dice, ['umeme', 'maji', 'kodi ya duka', 'usafiri', 'mshahara']);
    return {
      topic: 'fedha kwa maneno',
      said: `${pick(dice, ['nimelipa', 'nimetumia'])} ${what} ${phrase}`,
      want: ['daily_record', 'daily_record_parsed', 'bare_expense'],
      wantAmount: amount,
      wantKind: 'expense',
      truth: `"${phrase}" = ${amount}`,
    };
  });
  make.push(() => {
    const [phrase, amount] = pick(dice, SPOKEN_MONEY);
    const product = pick(dice, priced);
    return {
      topic: 'mauzo kwa fedha za maneno',
      said: `nimeuza ${product.name} kwa ${phrase}`,
      want: ['daily_record', 'daily_record_parsed'],
      wantAmount: amount,
      wantKind: 'sale',
      truth: `"${phrase}" = ${amount}`,
    };
  });

  // The same amount in the shorthand a keypad produces.
  make.push(() => {
    const [written, amount] = pick(dice, WRITTEN_MONEY);
    return {
      topic: 'fedha kwa mkato',
      said: `nimelipa ${pick(dice, ['umeme', 'bando', 'usafiri'])} ${written}`,
      want: ['daily_record', 'daily_record_parsed', 'bare_expense'],
      wantAmount: amount,
      wantKind: 'expense',
      truth: `"${written}" = ${amount}`,
    };
  });

  // A till roll. Twelve to twenty-two lines in one message, which is what a
  // Saturday looks like when somebody writes the day up at closing.
  make.push(() => {
    const howMany = 12 + Math.floor(dice() * 11);
    const chosen: Product[] = [];
    while (chosen.length < howMany && chosen.length < priced.length) {
      const product = pick(dice, priced);
      if (!chosen.some((seen) => seen.key === product.key)) chosen.push(product);
    }
    const lines = chosen.map((product) => `${product.name} ${1 + Math.floor(dice() * 9)}`);
    return {
      topic: 'orodha ndefu ya siku',
      said: `mauzo ya leo\n${lines.join('\n')}`,
      want: ['quantity_sale', 'daily_record_parsed', 'daily_record_batch'],
      truth: `mistari ${lines.length}`,
    };
  });

  // Nothing happened. The only wrong answer is a record.
  make.push(() => ({
    topic: 'hakuna kilichotokea',
    said: pick(dice, NOTHING_HAPPENED),
    want: ['conversational_ai'],
    forbid: [
      'daily_record', 'daily_record_parsed', 'daily_record_batch', 'quantity_sale',
      'bare_quantity_sale', 'bare_expense', 'stock_count', 'selling_price', 'product_cost',
    ],
    truth: 'hakuna rekodi inayotakiwa kuundwa',
  }));

  // A thumb on the wrong key. Nothing may be recorded and nothing may be priced.
  make.push(() => ({
    topic: 'kelele',
    said: pick(dice, NOISE),
    want: ['conversational_ai'],
    forbid: [
      'daily_record', 'daily_record_parsed', 'quantity_sale', 'bare_quantity_sale',
      'bare_expense', 'stock_count', 'selling_price', 'product_cost', 'selling_price_batch',
    ],
    truth: 'si ujumbe wa biashara',
  }));

  // Numbers at both ends of what a shop can mean.
  make.push(() => {
    const product = pick(dice, priced);
    const quantity = pick(dice, [0.5, 1.5, 2.5, 100, 500, 1000]);
    const two = (product.wholesale ?? 0) > 0 && product.wholesale !== product.retail;
    return {
      topic: 'idadi za mwisho kabisa',
      said: `nimeuza ${product.name} ${quantity}`,
      want: ['quantity_sale'],
      wantsBandQuestion: two,
      wantAmount: two ? undefined : quantity * (product.retail as number),
      truth: `${quantity} x ${product.retail}`,
    };
  });

  // A sale by a shop with two people in it. "Tumeuza" is not a variant; it is
  // what gets typed the moment somebody is employed.
  make.push(() => {
    const product = pick(dice, priced);
    const quantity = 1 + Math.floor(dice() * 6);
    const total = quantity * (product.retail as number);
    return {
      topic: 'wingi (tumeuza)',
      said: `${pick(dice, ['tumeuza', 'tuliuza'])} ${product.name} ${quantity} kwa ${total}`,
      want: ['daily_record', 'daily_record_parsed', 'quantity_sale'],
      wantAmount: total,
      wantKind: 'sale',
      truth: `${total} imetajwa kwenye ujumbe`,
    };
  });
  make.push(() => {
    const product = pick(dice, priced);
    const quantity = 5 + Math.floor(dice() * 30);
    const spent = quantity * Math.max(100, Math.round((product.cost ?? (product.retail as number) * 0.8) / 50) * 50);
    return {
      topic: 'wingi (tumenunua)',
      said: `tumenunua ${product.name} ${quantity} kwa ${spent}`,
      want: ['daily_record', 'daily_record_parsed'],
      wantAmount: spent,
      wantKind: 'stock_purchase',
      truth: `manunuzi ya ${spent}`,
    };
  });

  // Two languages in one sentence, which is how half of Dar es Salaam writes.
  make.push(() => {
    const product = pick(dice, priced);
    const quantity = 1 + Math.floor(dice() * 5);
    const two = (product.wholesale ?? 0) > 0 && product.wholesale !== product.retail;
    return {
      topic: 'lugha mbili kwenye sentensi moja',
      said: `nimeuza ${product.name} ${quantity} cash`,
      want: ['quantity_sale'],
      wantsBandQuestion: two,
      wantAmount: two ? undefined : quantity * (product.retail as number),
      truth: `${quantity} x ${product.retail}`,
    };
  });

  // A stock question with the place and the slang attached.
  make.push(() => {
    const row = counted.length > 0 ? pick(dice, counted) : null;
    if (!row) return null;
    return {
      topic: 'swali la stoko kwa mtaa',
      said: pick(dice, [
        `${row.productName} zipo?`,
        `nina ${row.productName} ngapi stoo`,
        `${row.productName} ziko ngapi store`,
        `zimebaki ${row.productName} ngapi dukani`,
      ]),
      want: ['stock_question'],
      wantAmount: Math.max(0, Math.round(row.onHand)),
      truth: `${row.productName}: ${row.onHand}`,
      execute: true,
    };
  });

  // Risip is a shillings-only product — see src/lib/format.ts, where TZS is the
  // only currency there is. So the edge case worth testing is not a second
  // currency; it is the currency PREFIX being typed in every form a Tanzanian
  // keyboard produces, next to a number that must survive it intact.
  make.push(() => {
    const amount = pick(dice, [3_500, 12_000, 45_000, 120_000]);
    const written = pick(dice, [
      `TSh ${amount.toLocaleString('en-US')}`,
      `Tsh${amount}`,
      `TZS ${amount}`,
      `sh ${amount}`,
      `${amount}/=`,
    ]);
    return {
      topic: 'alama ya shilingi',
      said: `nimelipa kodi ya duka ${written}`,
      want: ['daily_record', 'daily_record_parsed', 'bare_expense'],
      wantAmount: amount,
      wantKind: 'expense',
      truth: `${written} = ${amount}`,
    };
  });
}

// -------------------------------------------------------------- answering them


/**
 * Two lookups that cannot change while a run is in flight.
 *
 * The catalogue and the price list are read once per name and once per key,
 * not once per question. Without this a 2,400-question run made about five
 * thousand sequential round trips to Frankfurt and took forty minutes, which
 * is longer than the CI budget and long enough that nobody runs it by hand.
 * The harness is read-only, so a snapshot is not a shortcut — it is the same
 * answer, fetched once.
 */
const resolutionCache = new Map<string, unknown>();
const pricingCache = new Map<string, Record<string, unknown> | null>();

async function resolveOnce(db: SupabaseClient, shop: Shop, asked: string) {
  const key = asked.trim().toLocaleLowerCase('sw-TZ');
  if (!resolutionCache.has(key)) {
    const { data, error } = await db.rpc('wa_resolve_company_product_read', {
      p_profile_id: shop.profileId,
      p_company_id: shop.companyId,
      p_name: asked,
    });
    if (error) return { data: null, error };
    resolutionCache.set(key, data);
  }
  return { data: resolutionCache.get(key), error: null };
}

async function pricingOnce(db: SupabaseClient, shop: Shop, keys: string[]) {
  const missing = keys.filter((key) => !pricingCache.has(key));
  if (missing.length > 0) {
    const { data } = await db.rpc('wa_product_pricing', {
      p_company_id: shop.companyId,
      p_product_keys: missing,
    });
    for (const key of missing) pricingCache.set(key, null);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      pricingCache.set(String(row.product_key), row);
    }
  }
  return keys.map((key) => pricingCache.get(key) ?? null).filter(Boolean) as Array<Record<string, unknown>>;
}

/**
 * The webhook's own resolution, including the one-edit fallback it falls back
 * to when the database finds nothing. Mirrored here so the harness measures
 * what the shop would actually be told.
 */
function resolveName(shop: Shop, data: unknown, asked: string) {
  const resolution = normalizeProductReadResolution(data, asked);
  if (resolution.kind !== 'not_found') return resolution;
  const near = nearestCatalogueName(asked, shop.products.map((product) => product.name));
  if (!near) return resolution;
  return {
    kind: 'matched' as const,
    asked,
    match: { productKey: productKey(near), productName: near, matchKind: 'trigram' as const, matchScore: 0.99 },
  };
}

type Answer = { route: string; reply: string | null; note?: string };

/** The webhook's own read path, run for real against the shop's data. */
async function executeRead(db: SupabaseClient, shop: Shop, said: string): Promise<Answer | null> {
  // Asked first, in the webhook's own order: "bidhaa gani zimeisha" is never a
  // question about a product called "bidhaa".
  if (parseOutOfStockQuestion(said)) {
    return { route: 'stock_question', reply: outOfStockReply(shop.stock, 'sw') };
  }

  const priceAsk = parseSellingPriceQuestion(said);
  if (priceAsk) {
    const { data, error } = await resolveOnce(db, shop, priceAsk.product);
    if (error) return { route: 'selling_price_question', reply: null, note: 'RPC imeshindwa: ' + error.message };
    const resolution = resolveName(shop, data, priceAsk.product);
    if (resolution.kind !== 'matched') {
      return {
        route: 'selling_price_question',
        reply: sellingPriceReply(priceAsk.product, null, 'sw'),
        note: 'haikupatikana kwenye orodha: ' + JSON.stringify(priceAsk.product),
      };
    }
    const row = (await pricingOnce(db, shop, [resolution.match.productKey]))[0];
    return {
      route: 'selling_price_question',
      reply: sellingPriceReply(priceAsk.product, {
        productName: resolution.match.productName,
        retail: row?.retail_price == null ? null : Number(row.retail_price),
        wholesale: row?.wholesale_price == null ? null : Number(row.wholesale_price),
        wholesaleMinQty: row?.wholesale_min_qty == null ? null : Number(row.wholesale_min_qty),
        unitCost: row?.unit_cost == null ? null : Number(row.unit_cost),
      }, 'sw', true),
    };
  }
  const stockAsk = parseStockQuestion(said);
  if (stockAsk) {
    if (!stockAsk.product) {
      return { route: 'stock_question', reply: stockListReply(shop.stock, 'sw') };
    }
    const { data, error } = await resolveOnce(db, shop, stockAsk.product);
    // A lookup that FAILED is not a product the shop does not have. Letting the
    // two look alike here would have this harness report "Risip has forgotten
    // your duster" every time the network hiccupped.
    if (error) return { route: 'stock_question', reply: null, note: 'RPC imeshindwa: ' + error.message };
    const resolution = resolveName(shop, data, stockAsk.product);
    const matchedName = resolution.kind === 'matched' ? resolution.match.productName : '';
    if (!matchedName) {
      return {
        route: 'stock_question',
        reply: stockReply(null, stockAsk.product, 'sw'),
        note: `haikupatikana kwenye orodha: ${JSON.stringify(stockAsk.product)}`,
      };
    }
    const row = shop.stock.find((item) => productKey(item.productName) === productKey(matchedName)) ?? null;
    return { route: 'stock_question', reply: stockReply(row, matchedName, 'sw') };
  }

  const read = parseReadRequest(said);
  if (!read) return null;
  const window = periodWindow(read.period, read.range);
  const inWindow = shop.rows.filter((row) => {
    const at = new Date(String(row.occurredAt)).getTime();
    return at >= window.from && at < window.to;
  });
  if (read.tool === 'ai_business_summary') {
    return {
      route: read.tool,
      reply: buildBusinessSummaryReply(calculateBusinessSummary(inWindow), read.period, 'sw', read.range),
    };
  }
  if (read.tool === 'ai_debtors') {
    return { route: read.tool, reply: buildDebtorsReply(calculateDebtors(shop.rows), 'sw') };
  }
  if (read.tool === 'daily_profit_estimate') {
    const linesInWindow = shop.lines.filter((line) => {
      const at = new Date(String(line.occurredAt)).getTime();
      return at >= window.from && at < window.to;
    });
    return {
      route: read.tool,
      reply: buildProfitReply(
        calculateProfitEstimate(inWindow, linesInWindow, shop.costs), read.period, 'sw', read.range,
      ),
    };
  }
  return { route: read.tool, reply: null, note: 'chombo hakikuendeshwa hapa' };
}

function periodWindow(period: string, range: { from: Date; to: Date } | null | undefined) {
  if (range) return { from: range.from.getTime(), to: range.to.getTime() };
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - start.getDay());
  if (period === 'month') start.setDate(1);
  if (period === 'year') { start.setMonth(0); start.setDate(1); }
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return { from: start.getTime(), to: end.getTime() };
}

/**
 * Price a sale the way the webhook does: resolve each name against the shop's
 * own catalogue over the real RPC, then read the price list. Nothing here is a
 * copy of the catalogue — a name that the database cannot resolve fails here
 * exactly as it fails in production.
 */
async function executeSale(db: SupabaseClient, shop: Shop, said: string): Promise<Answer | null> {
  const sale = parseQuantityOnlySale(said);
  if (!sale) return null;
  const resolvedNames: Array<{ key: string; name: string; quantity: number; band: 'retail' | 'wholesale' | null }> = [];
  const unknown: string[] = [];
  for (const item of sale.items) {
    const { data, error } = await resolveOnce(db, shop, item.product);
    if (error) return { route: 'quantity_sale', reply: null, note: 'RPC imeshindwa: ' + error.message };
    const resolution = resolveName(shop, data, item.product);
    if (resolution.kind !== 'matched') { unknown.push(item.product); continue; }
    resolvedNames.push({
      key: resolution.match.productKey,
      name: resolution.match.productName,
      quantity: item.quantity,
      band: item.band ?? null,
    });
  }
  if (unknown.length > 0) {
    return {
      route: 'quantity_sale',
      reply: null,
      note: 'haijulikani kwenye orodha: ' + unknown.join(', '),
    };
  }
  const pricingRows = await pricingOnce(db, shop, resolvedNames.map((item) => item.key));
  const pricing = new Map<string, { retail: number | null; wholesale: number | null; wholesaleMinQty: number | null }>();
  for (const row of pricingRows) {
    pricing.set(String(row.product_key), {
      retail: row.retail_price == null ? null : Number(row.retail_price),
      wholesale: row.wholesale_price == null ? null : Number(row.wholesale_price),
      wholesaleMinQty: row.wholesale_min_qty == null ? null : Number(row.wholesale_min_qty),
    });
  }
  const open: PriceBandChoice[] = [];
  const lines: PricedLine[] = [];
  const missing: string[] = [];
  resolvedNames.forEach((item, at) => {
    const known = pricing.get(item.key) ?? { retail: null, wholesale: null, wholesaleMinQty: null };
    if (needsBandChoice(item.band, known, item.quantity)) {
      open.push({
        index: at,
        product: item.name,
        quantity: item.quantity,
        retail: known.retail as number,
        wholesale: known.wholesale as number,
      });
    }
    const line = priceLine({ product: item.name, quantity: item.quantity, band: item.band }, known);
    if (!line) { missing.push(item.name); return; }
    lines.push(line);
  });
  if (missing.length > 0) {
    return { route: 'quantity_sale', reply: null, note: 'hakuna bei: ' + missing.join(', ') };
  }
  if (open.length > 0) {
    return { route: 'quantity_sale', reply: priceBandQuestion(open, 'sw'), note: 'band_question' };
  }
  return { route: 'quantity_sale', reply: quantitySaleConfirmation(lines, 'sw', sale.expenses, []) };
}

// ------------------------------------------------------------------ the verdict

type Verdict = 'sawa' | 'njia' | 'namba' | 'model' | 'pengo' | 'haijulikani';

type Result = { ask: Ask; got: string; reply: string | null; note?: string; verdict: Verdict; why: string };

/** Does the answer actually say this number, however it was formatted? */
function statesAmount(reply: string | null, amount: number): boolean {
  if (!reply) return false;
  const digits = reply.replace(/[^0-9]/g, ' ');
  const rounded = Math.round(amount);
  return digits.split(/\s+/).some((token) => Number(token) === rounded)
    || reply.includes(rounded.toLocaleString('en-US'));
}

async function judge(db: SupabaseClient, shop: Shop, ask: Ask): Promise<Result> {
  const got = route(ask.said);
  let reply: string | null = null;
  let note: string | undefined;

  if (got === 'quantity_sale') {
    const priced = await executeSale(db, shop, ask.said);
    reply = priced?.reply ?? null;
    note = priced?.note;
  } else if (ask.execute || got.startsWith('ai_') || got === 'stock_question' || got === 'daily_profit_estimate') {
    const read = await executeRead(db, shop, ask.said);
    reply = read?.reply ?? null;
    note = read?.note;
  }

  const verdict = (kind: Verdict, why: string): Result => ({ ask, got, reply, note, verdict: kind, why });

  // A question nothing in the product computes. Not a failure of routing — a
  // missing capability, counted separately so it cannot hide among the passes.
  // Checked before anything else. A forbidden route is not a near miss to be
  // weighed against the rest of the answer — it is a message that should have
  // been left alone and was not.
  if (ask.forbid?.includes(got)) {
    return verdict('njia', 'hii haitakiwi kurekodiwa kabisa, lakini imekwenda ' + got);
  }
  if (ask.want.length === 0) {
    return verdict('pengo', 'hakuna chombo cha kujibu hili; kimeachiwa model');
  }
  if (!ask.want.includes(got)) {
    return got === 'conversational_ai'
      ? verdict('model', 'swali la hesabu limeachiwa model badala ya kuhesabiwa')
      : verdict('njia', 'ilitarajiwa ' + ask.want.join(' au ') + ', imekwenda ' + got);
  }
  if (ask.wantsBandQuestion) {
    return note === 'band_question'
      ? verdict('sawa', 'imeuliza bei ipi, kama inavyotakiwa')
      : verdict('namba', 'ina bei mbili lakini haikuuliza ni ipi');
  }
  if (ask.wantKind) {
    const kind = recordKind(ask.said);
    if (kind && kind !== ask.wantKind) {
      return verdict('namba', 'imerekodi ' + kind + ' badala ya ' + ask.wantKind);
    }
  }
  if (ask.wantAmount !== undefined) {
    const computed = computedAmount(ask.said);
    const stated = statesAmount(reply, ask.wantAmount)
      || (computed !== null && Math.round(computed) === Math.round(ask.wantAmount));
    if (!stated) {
      const saw = computed === null ? (reply ? 'jibu halina namba hiyo' : 'hakuna jibu') : String(computed);
      return verdict('namba', 'ilitarajiwa ' + ask.wantAmount + ', imepata ' + saw);
    }
  }
  if (!reply && ask.execute) return verdict('haijulikani', 'njia ni sahihi lakini jibu halikujengwa hapa');
  return verdict('sawa', 'njia sahihi' + (ask.wantAmount !== undefined ? ' na namba sahihi' : ''));
}

// ---------------------------------------------------------------------- report

const LABEL: Record<Verdict, string> = {
  sawa: 'SAWA',
  njia: 'NJIA MBAYA',
  namba: 'NAMBA MBAYA',
  model: 'IMEACHIWA MODEL',
  pengo: 'HAKUNA CHOMBO',
  haijulikani: 'HAIJAJUDGIWA',
};

function report(
  shop: Shop,
  results: Result[],
  seeds: number[],
  current: RunRecord,
  changes: Change[],
): string {
  const byVerdict = new Map<Verdict, Result[]>();
  for (const result of results) {
    byVerdict.set(result.verdict, [...(byVerdict.get(result.verdict) ?? []), result]);
  }
  const byTopic = new Map<string, { ok: number; total: number }>();
  for (const result of results) {
    const tally = byTopic.get(result.ask.topic) ?? { ok: 0, total: 0 };
    tally.total += 1;
    if (result.verdict === 'sawa') tally.ok += 1;
    byTopic.set(result.ask.topic, tally);
  }

  const out: string[] = [];
  out.push('# Risip — maswali ya kubahatisha kutoka kwenye database');
  out.push('');
  out.push('> **Risip AI Current Capability Score: ' + displayScore(current.score) + '% '
    + '| Grade: ' + current.grade + '**  ');
  out.push('> ' + bandFor(current.score).label);
  out.push('');
  out.push('Duka: **' + shop.companyName + '** · bidhaa ' + shop.products.length
    + ' · rekodi zilizothibitishwa ' + shop.rows.length
    + ' · seeds `' + seeds.join(', ') + '` · ' + current.at.slice(0, 16).replace('T', ' ') + ' UTC');
  out.push('');
  out.push('Maswali ' + results.length + ', yametengenezwa kutoka kwenye majina na namba halisi za duka.');
  out.push('');
  out.push('## Yaliyobadilika tangu run iliyopita');
  out.push('');
  if (changes.length === 0) {
    out.push('Hakuna mabadiliko.');
  } else {
    out.push('| Mada | Kabla | Sasa | |');
    out.push('| --- | ---: | ---: | --- |');
    for (const change of changes) {
      const mark = change.direction === 'regressed' ? '🔻 imeshuka'
        : change.direction === 'improved' ? '🔺 imepanda'
          : change.direction === 'new' ? '🆕 mpya' : '— imeondoka';
      out.push('| ' + change.topic + ' | ' + (change.before || '—') + ' | ' + (change.after || '—') + ' | ' + mark + ' |');
    }
  }
  out.push('');
  out.push('| Hukumu | Idadi |');
  out.push('| --- | ---: |');
  for (const verdict of ['sawa', 'njia', 'namba', 'model', 'pengo', 'haijulikani'] as Verdict[]) {
    out.push('| ' + LABEL[verdict] + ' | ' + (byVerdict.get(verdict)?.length ?? 0) + ' |');
  }
  out.push('');
  out.push('## Kwa mada');
  out.push('');
  out.push('| Mada | Sawa | Jumla |');
  out.push('| --- | ---: | ---: |');
  for (const [topic, tally] of [...byTopic.entries()].sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total)) {
    out.push('| ' + topic + ' | ' + tally.ok + ' | ' + tally.total + ' |');
  }

  for (const verdict of ['namba', 'njia', 'model', 'pengo', 'haijulikani'] as Verdict[]) {
    const rows = byVerdict.get(verdict) ?? [];
    if (rows.length === 0) continue;
    out.push('');
    out.push('## ' + LABEL[verdict] + ' (' + rows.length + ')');
    const seen = new Set<string>();
    for (const row of rows) {
      const fingerprint = row.ask.topic + '|' + row.why;
      if (seen.has(fingerprint) && seen.size > 40) continue;
      seen.add(fingerprint);
      out.push('');
      out.push('**' + row.ask.said.replace(/\n/g, ' / ') + '**');
      out.push('');
      out.push('- mada: ' + row.ask.topic);
      out.push('- database inasema: ' + row.ask.truth);
      out.push('- Risip: `' + row.got + '`' + (row.note ? ' — ' + row.note : ''));
      out.push('- tatizo: ' + row.why);
      if (row.reply) out.push('- jibu: ' + row.reply.split('\n')[0].slice(0, 160));
    }
  }

  if (shop.suspect.length > 0) {
    out.push('');
    out.push('## Uchafu kwenye orodha ya bidhaa (' + shop.suspect.length + ')');
    out.push('');
    out.push('Haya hayakutumika kutengeneza maswali kwa sababu si bidhaa halisi:');
    out.push('');
    for (const name of shop.suspect) out.push('- ' + name);
  }
  out.push('');
  return out.join('\n');
}

// -------------------------------------------------------------------- history

/**
 * Every run, kept, so the next one can say what MOVED.
 *
 * A score on its own is close to useless — nobody can tell 97.9 from 98.2 by
 * feel, and both look fine. What a person can act on is "the debtor questions
 * went from 100% to 74% overnight", and that needs yesterday's numbers to be
 * written down somewhere. This file is committed on purpose: it is the record.
 */
function loadHistory(path: string): RunRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
  } catch {
    return [];
  }
}

function shortCommit(): string | undefined {
  const value = process.env.GITHUB_SHA ?? '';
  return value ? value.slice(0, 7) : undefined;
}

/** "1,2,3" or a plain "10" meaning seeds one through ten. */
function seedList(raw: string): number[] {
  if (raw.includes(',')) {
    return raw.split(',').map((piece) => Number(piece.trim())).filter((seed) => Number.isFinite(seed));
  }
  const one = Number(raw);
  if (!Number.isFinite(one) || one < 1) return [1];
  return Array.from({ length: one }, (_unused, at) => at + 1);
}

// ------------------------------------------------------------------------ main

async function main() {
  const { url, key } = env();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const seeds = seedList(arg('seeds', arg('seed', '10')));
  const perSeed = Number(arg('count', '240'));
  const shop = await loadShop(db, arg('company', 'St. Ritha'));

  const results: Result[] = [];
  for (const seed of seeds) {
    const dice = rng(seed);
    for (const ask of buildAsks(shop, dice, perSeed)) results.push(await judge(db, shop, ask));
  }

  const tally = new Map<Verdict, number>();
  for (const result of results) tally.set(result.verdict, (tally.get(result.verdict) ?? 0) + 1);
  const correct = tally.get('sawa') ?? 0;
  const exact = score(correct, results.length);
  const band = bandFor(exact);

  const topics = new Map<string, TopicScore>();
  for (const result of results) {
    const row = topics.get(result.ask.topic) ?? { topic: result.ask.topic, ok: 0, total: 0 };
    row.total += 1;
    if (result.verdict === 'sawa') row.ok += 1;
    topics.set(result.ask.topic, row);
  }

  const current: RunRecord = {
    at: new Date().toISOString(),
    shop: shop.companyName,
    seeds,
    asked: results.length,
    correct,
    score: exact,
    grade: band.grade,
    topics: [...topics.values()].sort((a, b) => a.topic.localeCompare(b.topic)),
    ...(shortCommit() ? { commit: shortCommit() } : {}),
  };

  const historyPath = resolvePath(process.cwd(), arg('history', 'docs/interrogation-history.json'));
  const history = loadHistory(historyPath);
  const changes = changesSince(history[history.length - 1] ?? null, current);

  console.log('');
  console.log(shop.companyName + ' — ' + results.length + ' maswali, seeds ' + seeds.join(','));
  console.log('');
  for (const verdict of ['sawa', 'njia', 'namba', 'model', 'pengo', 'haijulikani'] as Verdict[]) {
    console.log('  ' + String(tally.get(verdict) ?? 0).padStart(5) + '  ' + LABEL[verdict]);
  }
  console.log('');
  const failures = results.filter((item) => item.verdict !== 'sawa');
  // One line per DISTINCT problem. Ten seeds produce the same failure ten times
  // over, and a log that repeats itself is a log nobody finishes reading.
  const seen = new Set<string>();
  for (const result of failures) {
    const fingerprint = result.ask.topic + '|' + result.why;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    console.log('  ' + result.ask.said.replace(/\n/g, ' / ').padEnd(52).slice(0, 52)
      + ' → ' + result.got.padEnd(22) + result.why);
  }
  if (failures.length > seen.size) {
    console.log('  (' + (failures.length - seen.size) + ' more, same shapes)');
  }

  const path = resolvePath(process.cwd(), arg('out', 'docs/ai-interrogation.md'));
  writeFileSync(path, report(shop, results, seeds, current, changes), 'utf8');

  if (arg('history', 'docs/interrogation-history.json') !== 'none') {
    // Kept short on purpose: this is a trend line, not an archive.
    writeFileSync(historyPath, JSON.stringify([...history, current].slice(-60), null, 2) + '\n', 'utf8');
  }

  console.log('');
  console.log(summaryLine(current, changes));
  console.log(band.label);
  console.log('Ripoti kamili: ' + path);

  // The gate. A failing grade must stop a deploy, and the only reliable way to
  // stop one is to fail the process.
  if (!band.deployable) {
    console.error('');
    console.error('Grade F — deployment blocked. Fix the failures above, or say why the bar is wrong.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
