// Counting stock, and asking what is left.
//
// "Bibilia ndogo ninazo ngapi?" was answered "siwezi kuangalia idadi ya bidhaa
// zilizopo dukani" — honest, because nothing could count. Now it can, but only
// from a physical count forward, and the difference matters enormously:
//
//   counted    "Uliza ulipohesabu 90, tangu hapo umeuza 10 — zimebaki 80."
//   uncounted  "Sijawahi kuhesabu. Tangu nianze, umeuza 48." — NOT "-48 zipo."
//
// A number presented as stock when nobody ever counted the shelf is worse than
// no number: it will be believed, and it will be wrong.

import type { Lang } from './whatsappIntent.ts';

export type StockRow = {
  productName: string;
  unit: string | null;
  measured: boolean;
  onHand: number;
  hasCount: boolean;
  countedAt: string | null;
  boughtSince: number;
  soldSince: number;
  incompletePurchases: boolean;
};

export type StockCount = { product: string; quantity: number; unit: string | null };

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

const UNITS = 'kilo|kilos|kg|gramu|lita|litre|liter|ml|mita|futi|gunia|debe|ndoo|pakiti|boksi|rimu|dazeni|robo|nusu|theluthi|kipande|mche|chupa|mfuko|kifurushi';
const NUMBER = '[0-9]+(?:\\.[0-9]+)?';

/**
 * "Nina daftari 90", "nimehesabu sukari kilo 12.5", "daftari zimebaki 90".
 *
 * Deliberately narrow. A count overwrites what Risip believed, so a sentence
 * that merely mentions a product and a number must not become one — "nimeuza
 * daftari 90" is a sale and would wipe the shelf if misread.
 */
export function parseStockCount(text: string | null | undefined): StockCount | null {
  const said = clean(text);
  if (!said) return null;
  // Anything that is plainly a movement is not a count.
  if (/^(?:nimeuza|niliuza|uza|sold|nimenunua|nimelipa|nimetumia|amechukua|amelipa)\b/i.test(said)) return null;

  const patterns = [
    // An explicit shelf anchor, including the owner's portion example:
    // "store mafuta ndoo 2". This is a count, not a purchase movement.
    new RegExp(`^(?:store|stoo)\\s+(.+?)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
    // nina daftari 90 [kipimo]
    new RegExp(`^(?:nina|ninazo|ninavyo|nimebakiwa na|nimebakisha)\\s+(.+?)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
    // nimehesabu daftari 90
    new RegExp(`^(?:nimehesabu|hesabu ya|nimehesabia|counted|stock ya)\\s+(.+?)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
    // daftari zimebaki 90
    new RegExp(`^(.+?)\\s+(?:zimebaki|imebaki|zilizobaki|zipo|ipo|remaining|left)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(said);
    if (!match) continue;
    const product = clean(match[1]).replace(/^(?:ya|za|wa|of)\s+/i, '');
    const quantity = Number(match[3]);
    const unit = (match[2] ?? match[4] ?? '').toLowerCase() || null;
    if (!product || product.length < 2 || !Number.isFinite(quantity) || quantity < 0) continue;
    // A name made only of digits is a parse gone wrong, not a product.
    if (!/[\p{L}]/u.test(product)) continue;
    return { product, quantity, unit };
  }
  return null;
}

/** "Bibilia ndogo ninazo ngapi?", "stock ya daftari", "zimebaki ngapi?" */
export function parseStockQuestion(text: string | null | undefined): { product: string | null } | null {
  const said = clean(text);
  if (!said) return null;

  const named = said.match(new RegExp(`^(.+?)\\s+(?:ninazo|ninavyo|nina|zimebaki|zilizobaki|zipo)\\s+ngapi\\b`, 'i'))
    ?? said.match(/^(?:nina|ninazo)\s+(.+?)\s+ngapi\b/i)
    ?? said.match(/^(?:stock|hisa)\s+(?:ya|za|of)\s+(.+?)\s*\??$/i)
    ?? said.match(/^how many\s+(.+?)\s+(?:do i have|are left|remain)/i);
  if (named) {
    const product = clean(named[1]).replace(/^(?:ya|za|wa|of)\s+/i, '');
    if (product.length >= 2 && /[\p{L}]/u.test(product)) return { product };
  }

  if (/^(?:stock|hisa)\b.*\??$/i.test(said) || /^(?:nionyeshe|onyesha)\s+stock\b/i.test(said)) {
    return { product: null };
  }
  return null;
}

function amount(row: StockRow): string {
  const decimals = row.measured ? 2 : 0;
  const value = row.onHand.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  if (row.unit) return `${value} ${row.unit}`;
  return row.measured ? value : value;
}

const countedOn = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/**
 * One product. The uncounted case never states a stock figure, because the
 * arithmetic has no starting point — it reports the movements instead and says
 * plainly what is missing.
 */
export function stockReply(row: StockRow | null, asked: string, lang: Lang): string {
  if (!row) {
    return lang === 'sw'
      ? `Sina rekodi ya ${asked}. Ukishaiuza au kuiingiza kama stock, nitaweza kuihesabu.`
      : `I have no record of ${asked}. Once you sell it or record it as stock, I can count it.`;
  }

  if (!row.hasCount) {
    const moved = lang === 'sw'
      ? `Tangu nianze kurekodi: umeingiza ${row.boughtSince}, umeuza ${row.soldSince}.`
      : `Since I started recording: ${row.boughtSince} in, ${row.soldSince} out.`;
    return lang === 'sw'
      ? `Sijawahi kuhesabu ${row.productName}, kwa hiyo siwezi kusema zilizopo.\n${moved}\n\n`
        + `Ukinihesabia mara moja — mfano "nina ${row.productName} 90" — nitaendelea kuhesabu mwenyewe.`
      : `I have never counted ${row.productName}, so I cannot say what is on the shelf.\n${moved}\n\n`
        + `Count it once — for example "nina ${row.productName} 90" — and I will keep count from there.`;
  }

  const since = lang === 'sw'
    ? `Tangu ulipohesabu ${countedOn(row.countedAt)}: umeingiza ${row.boughtSince}, umeuza ${row.soldSince}.`
    : `Since your count on ${countedOn(row.countedAt)}: ${row.boughtSince} in, ${row.soldSince} out.`;
  const caveat = row.incompletePurchases
    ? (lang === 'sw'
      ? '\n\n⚠️ Baadhi ya manunuzi ya stock hayakutaja idadi, kwa hiyo hayakuhesabika.'
      : '\n\n⚠️ Some stock purchases named no quantity, so they are not in this count.')
    : '';

  const head = lang === 'sw'
    ? `${row.productName}: zimebaki ${amount(row)}.`
    : `${row.productName}: ${amount(row)} left.`;
  return `${head}\n${since}${caveat}`;
}

export function stockListReply(rows: StockRow[], lang: Lang): string {
  if (rows.length === 0) {
    return lang === 'sw'
      ? 'Sijahesabu bidhaa yoyote bado. Anza na moja: "nina daftari 90".'
      : 'Nothing has been counted yet. Start with one: "nina daftari 90".';
  }
  const counted = rows.filter((row) => row.hasCount);
  if (counted.length === 0) {
    const names = rows.map((row) => row.productName).join(', ');
    return lang === 'sw'
      ? `Sijawahi kuhesabu bidhaa yoyote, kwa hiyo siwezi kusema kiasi kilichopo.\nBidhaa zilizosajiliwa: ${names}.\n\nAnza na moja: "nina daftari 90".`
      : `I have never counted anything, so I cannot say how much is on the shelf.\nRegistered products: ${names}.\n\nStart with one: "nina daftari 90".`;
  }
  // WhatsApp allows 4,096 characters. Build within a conservative budget, but
  // never silently pretend the first 15 products are the whole catalogue.
  const budget = 3_200;
  const shown: string[] = [];
  for (const row of counted) {
    const line = `${shown.length + 1}. ${row.productName} — ${amount(row)}`;
    if (shown.join('\n').length + line.length + 1 > budget) break;
    shown.push(line);
  }
  const omitted = counted.length - shown.length;
  const omittedText = omitted > 0
    ? (lang === 'sw'
      ? `\n\nNimeonyesha ${shown.length} kati ya bidhaa ${counted.length} zilizohesabiwa.`
      : `\n\nShowing ${shown.length} of ${counted.length} counted products.`)
    : '';
  const uncountedRows = rows.filter((row) => !row.hasCount);
  const uncountedText = uncountedRows.length > 0
    ? (lang === 'sw'
      ? `\n\nBidhaa ${uncountedRows.length} bado hazijahesabiwa: ${uncountedRows.map((row) => row.productName).join(', ')}.`
      : `\n\n${uncountedRows.length} products have not been counted yet: ${uncountedRows.map((row) => row.productName).join(', ')}.`)
    : '';
  const lines = shown.join('\n');
  return lang === 'sw'
    ? `Zilizopo (${counted.length} zilizohesabiwa):\n${lines}${omittedText}${uncountedText}`
    : `On hand (${counted.length} counted):\n${lines}${omittedText}${uncountedText}`;
}

export function stockCountConfirmation(count: StockCount, previous: number | null, lang: Lang): string {
  const unit = count.unit ? ` ${count.unit}` : '';
  const drift = previous === null || previous === count.quantity ? '' : (lang === 'sw'
    ? `\nNilikuwa nadhani zipo ${previous}. Hesabu yako ndiyo sahihi.`
    : `\nI believed there were ${previous}. Your count is the one that counts.`);
  return lang === 'sw'
    ? `✅ Nimehesabu ${count.product}: ${count.quantity}${unit}.${drift}\n\nKuanzia sasa nitafuatilia mwenyewe kadri unavyouza na kuingiza.`
    : `✅ Counted ${count.product}: ${count.quantity}${unit}.${drift}\n\nFrom here I will keep track as you sell and restock.`;
}
