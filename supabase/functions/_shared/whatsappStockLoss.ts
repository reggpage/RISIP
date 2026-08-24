import type { Lang } from './whatsappIntent.ts';
import { UNITS } from './whatsappStock.ts';
import { normalizeNumberWords } from './whatsappDailyRecords.ts';

/**
 * Goods that left the shelf without being sold.
 *
 * Two facts, never one:
 *
 *   stock_loss   destroyed. Meat that spoiled, milk that soured. The shop is
 *                poorer by whatever it paid for them.
 *   owner_use    taken home. Nothing was destroyed and nothing was earned; the
 *                stock simply stopped being the shop's to sell.
 *
 * Both reduce stock. Only one is a loss, and the difference is not cosmetic —
 * a butcher who cannot tell "I threw it away" from "I took it home" cannot tell
 * waste from wages.
 */
export type StockLossReading =
  | {
    kind: 'stock_loss';
    product: string;
    quantity: number;
    unit: string | null;
    /** The trader's own word, kept verbatim: imeharibika, imeoza, imeibiwa. */
    reason: string;
  }
  | { kind: 'owner_use'; product: string; quantity: number; unit: string | null }
  /**
   * A word that MIGHT mean spoilage but is not ours to decide.
   *
   * "Mzoga" is the example the shop gave: in this butcher's yard it means
   * rotten meat, but the word plainly means a carcass, and in another shop it
   * may mean the whole animal that just arrived. Reading it as a loss would
   * delete stock the shop just bought; reading it as an arrival would create
   * stock that is rotting in a bin. Neither guess is survivable, so it asks.
   */
  | { kind: 'clarify_spoilage'; word: string; quantity: number; unit: string | null };

const clean = (value: string | null | undefined) =>
  String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * Destroyed, not sold. Deliberately generic Swahili rather than butcher words:
 * a chips vendor's potatoes rot the same way, and this parser has always been
 * shared. Nothing here changes how an existing vertical reads a message it
 * already understood — none of these sentences parsed at all before.
 */
const LOSS_VERBS = [
  'imeharibika', 'zimeharibika', 'yameharibika', 'limeharibika', 'kimeharibika', 'vimeharibika',
  'imeoza', 'zimeoza', 'yameoza', 'limeoza', 'kimeoza', 'vimeoza',
  'imemwagika', 'zimemwagika', 'yamemwagika',
  'imeibiwa', 'zimeibiwa', 'yameibiwa',
  'imepotea', 'zimepotea', 'yamepotea',
  'haifai', 'hazifai', 'hayafai', 'hakifai', 'havifai',
  'spoiled', 'expired', 'rotten', 'wasted',
].join('|');

/** "nimepoteza kilo 2 za nyama" — the verb leads instead of trailing. */
const LOSS_OPENERS = 'nimepoteza|tumepoteza|nimeharibikiwa|nimemwaga|tumemwaga|nimetupa|tumetupa';

/** Taken home. The destination is what makes it owner use, not the verb. */
const TAKE_VERBS = 'nimechukua|tumechukua|nimepeleka|tumepeleka|nimetoa|nimebeba';
const HOME_MARKERS = [
  'nyumbani',
  'kwa matumizi ya nyumbani', 'matumizi ya nyumbani', 'matumizi binafsi',
  'kwa ajili yangu', 'kwa ajili yetu', 'kwa matumizi yangu',
].join('|');

/**
 * Words that MIGHT be spoilage in one shop and something else entirely in the
 * next. Never mapped, only ever questioned. Teaching a shop's own meaning is
 * business vocabulary, and business vocabulary is not a dictionary we ship.
 */
const AMBIGUOUS_LOSS_WORDS = 'mzoga|mizoga';

const unit = `(?:${UNITS})`;
const qty = String.raw`([0-9]+(?:\.[0-9]+)?)`;

function reading(
  kind: 'stock_loss' | 'owner_use',
  product: string,
  quantity: string,
  measure: string | null,
  reason?: string,
): StockLossReading | null {
  const name = clean(product)
    // A trailing joiner is grammar, not part of the name: "kilo 4 ZA nyama".
    .replace(/^(?:za|ya|wa|la|ku|of)\s+/iu, '')
    .replace(/\s+(?:za|ya|wa|la)$/iu, '')
    .trim();
  const amount = Number(quantity);
  // A product name that is only a measure is not a product — the same rule the
  // arrival parser learned when "trei" became a product of its own.
  if (!name || name.length < 2 || /[0-9]/.test(name)) return null;
  if (new RegExp(`^${unit}$`, 'iu').test(name)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const measured = measure ? clean(measure).toLocaleLowerCase('sw-TZ') : null;
  return kind === 'stock_loss'
    ? { kind, product: name, quantity: amount, unit: measured, reason: reason ?? '' }
    : { kind, product: name, quantity: amount, unit: measured };
}

export function parseStockLoss(text: string | null | undefined): StockLossReading | null {
  const said = normalizeNumberWords(clean(text)).toLocaleLowerCase('sw-TZ');
  if (!said) return null;

  // ── ambiguous vocabulary, asked about rather than guessed ─────────────────
  // Both orders, read separately rather than juggling group numbers across two
  // patterns — an earlier version did juggle them, and "mzoga 4" with no
  // measure fell through as NaN and was silently ignored.
  const unitFirst = new RegExp(
    String.raw`^(${AMBIGUOUS_LOSS_WORDS})\s+(${unit})\s+${qty}\s*$`, 'iu',
  ).exec(said);
  const qtyFirst = new RegExp(
    String.raw`^(${AMBIGUOUS_LOSS_WORDS})\s+${qty}(?:\s+(${unit}))?\s*$`, 'iu',
  ).exec(said);
  if (unitFirst || qtyFirst) {
    const word = clean((unitFirst ?? qtyFirst)![1]);
    const quantity = Number(unitFirst ? unitFirst[3] : qtyFirst![2]);
    const measure = unitFirst ? unitFirst[2] : qtyFirst![3];
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      kind: 'clarify_spoilage',
      word,
      quantity,
      unit: measure ? clean(measure).toLocaleLowerCase('sw-TZ') : null,
    };
  }

  // ── owner use: the destination decides, not the verb ──────────────────────
  const home = new RegExp(`\\b(?:${HOME_MARKERS})\\b`, 'iu');
  if (home.test(said)) {
    const stripped = said
      .replace(new RegExp(`^(?:${TAKE_VERBS})\\s+`, 'iu'), '')
      .replace(home, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // "nyama kilo 2" or "kilo 2 za nyama" or "soseji 5"
    const withUnit = new RegExp(String.raw`^(.+?)\s+(${unit})\s+${qty}$`, 'iu').exec(stripped)
      ?? new RegExp(String.raw`^(.+?)\s+${qty}\s+(${unit})$`, 'iu').exec(stripped);
    if (withUnit) {
      const unitFirst = new RegExp(`^${unit}$`, 'iu').test(withUnit[2]);
      return reading('owner_use', withUnit[1], unitFirst ? withUnit[3] : withUnit[2],
        unitFirst ? withUnit[2] : withUnit[3]);
    }
    const unitLed = new RegExp(String.raw`^(${unit})\s+${qty}\s+(.+)$`, 'iu').exec(stripped);
    if (unitLed) return reading('owner_use', unitLed[3], unitLed[2], unitLed[1]);
    const bare = new RegExp(String.raw`^(.+?)\s+${qty}$`, 'iu').exec(stripped);
    if (bare) return reading('owner_use', bare[1], bare[2], null);
    return null;
  }

  // ── stock loss, verb trailing ─────────────────────────────────────────────
  const trailing = new RegExp(String.raw`^(.*?)\s+(${LOSS_VERBS})\b.*$`, 'iu').exec(said);
  if (trailing) {
    const body = clean(trailing[1]);
    const reason = clean(trailing[2]);
    const withUnit = new RegExp(String.raw`^(.+?)\s+(${unit})\s+${qty}$`, 'iu').exec(body)
      ?? new RegExp(String.raw`^(.+?)\s+${qty}\s+(${unit})$`, 'iu').exec(body);
    if (withUnit) {
      const unitFirst = new RegExp(`^${unit}$`, 'iu').test(withUnit[2]);
      return reading('stock_loss', withUnit[1], unitFirst ? withUnit[3] : withUnit[2],
        unitFirst ? withUnit[2] : withUnit[3], reason);
    }
    // "kilo 4 za nyama zimeharibika"
    const unitLed = new RegExp(String.raw`^(${unit})\s+${qty}\s+(.+)$`, 'iu').exec(body);
    if (unitLed) return reading('stock_loss', unitLed[3], unitLed[2], unitLed[1], reason);
    const bare = new RegExp(String.raw`^(.+?)\s+${qty}$`, 'iu').exec(body);
    if (bare) return reading('stock_loss', bare[1], bare[2], null, reason);
    return null;
  }

  // ── stock loss, verb leading ──────────────────────────────────────────────
  const leading = new RegExp(String.raw`^(${LOSS_OPENERS})\s+(.+)$`, 'iu').exec(said);
  if (leading) {
    const body = clean(leading[2]);
    const reason = clean(leading[1]);
    const unitLed = new RegExp(String.raw`^(${unit})\s+${qty}\s+(.+)$`, 'iu').exec(body);
    if (unitLed) return reading('stock_loss', unitLed[3], unitLed[2], unitLed[1], reason);
    const withUnit = new RegExp(String.raw`^(.+?)\s+(${unit})\s+${qty}$`, 'iu').exec(body);
    if (withUnit) return reading('stock_loss', withUnit[1], withUnit[3], withUnit[2], reason);
    const bare = new RegExp(String.raw`^(.+?)\s+${qty}$`, 'iu').exec(body);
    if (bare) return reading('stock_loss', bare[1], bare[2], null, reason);
    return null;
  }

  return null;
}

const money = (amount: number, lang: Lang) =>
  `${lang === 'sw' ? 'TSh' : 'TZS'} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const measured = (reading: { quantity: number; unit: string | null }) =>
  reading.unit ? `${reading.unit} ${reading.quantity}` : String(reading.quantity);

/**
 * The preview a trader confirms.
 *
 * `value` is null when the deterministic cost engine could not resolve a cost.
 * It is NOT guessed and it is NOT quietly shown as zero — the message says
 * plainly that the quantity is being recorded without a value, so nobody reads
 * a silent 0 as "this cost the shop nothing".
 */
export function stockLossConfirmation(
  reading: Extract<StockLossReading, { kind: 'stock_loss' }>,
  productName: string,
  value: number | null,
  lang: Lang,
): string {
  const amount = measured(reading);
  if (lang === 'sw') {
    const head = `Nimeelewa ${amount} za *${productName}* zimeharibika.`;
    return value === null
      ? `${head}\n\nSina gharama ya uhakika ya bidhaa hii, hivyo nitarekodi kiasi kilichopotea bila kukisia thamani yake.\n\nNirekodi? *NDIYO* / *HAPANA*`
      : `${head}\nThamani ya stock iliyopotea ni *${money(value, lang)}*.\n\nNirekodi? *NDIYO* / *HAPANA*`;
  }
  const head = `I understand ${amount} of *${productName}* was lost.`;
  return value === null
    ? `${head}\n\nI have no reliable cost for this product, so I will record the quantity lost without guessing what it was worth.\n\nRecord it? *YES* / *NO*`
    : `${head}\nThe stock lost is worth *${money(value, lang)}*.\n\nRecord it? *YES* / *NO*`;
}

export function ownerUseConfirmation(
  reading: Extract<StockLossReading, { kind: 'owner_use' }>,
  productName: string,
  value: number | null,
  lang: Lang,
): string {
  const amount = measured(reading);
  if (lang === 'sw') {
    // Deliberately not called a loss and not called a sale. Stock left the
    // shelf for the household, and that is the whole statement.
    const head = `Nimeelewa umechukua ${amount} za *${productName}* nyumbani.`;
    return `${head}${value === null ? '' : `\nGharama yake ni *${money(value, lang)}*.`}`
      + `\nSitaihesabu kama mauzo wala kama hasara ya biashara.\n\nNirekodi? *NDIYO* / *HAPANA*`;
  }
  const head = `I understand you took ${amount} of *${productName}* home.`;
  return `${head}${value === null ? '' : `\nIt cost *${money(value, lang)}*.`}`
    + `\nI will not count it as a sale or as a business loss.\n\nRecord it? *YES* / *NO*`;
}

/**
 * The question a word like "mzoga" earns. It names both readings, because the
 * trader is the only one who knows which is true in their yard, and offers
 * neither as a default.
 */
export function spoilageClarification(
  reading: Extract<StockLossReading, { kind: 'clarify_spoilage' }>,
  lang: Lang,
): string {
  const amount = measured(reading);
  return lang === 'sw'
    ? `Neno *${reading.word}* linaweza kumaanisha vitu viwili, na sitakisia.\n\n`
      + `Unamaanisha ${amount} za nyama zimeharibika?\n\n`
      + `Jibu *NDIYO* kama ni hivyo, kisha niambie ni bidhaa gani — mfano: _nyama kilo ${reading.quantity} imeharibika_.`
    : `The word *${reading.word}* can mean two different things, and I will not guess.\n\n`
      + `Do you mean ${amount} of meat spoiled?\n\n`
      + `Reply *YES* if so, then tell me which product — for example: _nyama kilo ${reading.quantity} imeharibika_.`;
}
