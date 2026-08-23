import type { Lang } from './whatsappIntent.ts';
import { withinOneEdit } from './whatsappSpelling.ts';

export type ProductReadMatch = {
  productKey: string;
  productName: string;
  matchKind: 'exact' | 'trailing_vowel' | 'noun_class' | 'trigram';
  matchScore: number;
};

export type ProductReadResolution =
  | { kind: 'not_found'; asked: string }
  | { kind: 'matched'; asked: string; match: ProductReadMatch }
  | { kind: 'ambiguous'; asked: string; candidates: ProductReadMatch[] };

type RpcRow = Record<string, unknown>;

function rowToMatch(row: RpcRow): ProductReadMatch | null {
  const productKey = typeof row.product_key === 'string' ? row.product_key.trim() : '';
  const productName = typeof row.product_name === 'string' ? row.product_name.trim() : '';
  const matchKind = row.match_kind;
  const matchScore = Number(row.match_score);
  if (!productKey || !productName
      || (matchKind !== 'exact' && matchKind !== 'trailing_vowel' && matchKind !== 'noun_class' && matchKind !== 'trigram')
      || !Number.isFinite(matchScore)) return null;
  return { productKey, productName, matchKind, matchScore };
}

export function normalizeProductReadResolution(data: unknown, asked: string): ProductReadResolution {
  const candidates = (Array.isArray(data) ? data : [])
    .filter((row): row is RpcRow => Boolean(row) && typeof row === 'object')
    .map(rowToMatch)
    .filter((row): row is ProductReadMatch => row !== null);
  if (candidates.length === 0) return { kind: 'not_found', asked };
  const ambiguous = Boolean((data as RpcRow[])[0]?.ambiguous);
  return ambiguous && candidates.length > 1
    ? { kind: 'ambiguous', asked, candidates }
    : { kind: 'matched', asked, match: candidates[0] };
}

/**
 * The one catalogue name this could be, after the database has already said no.
 *
 * MEASURED (scripts/interrogate.ts, eight seeds): "nina altasi ngapi",
 * "Daasn ziko ngapi", "bei ya Bibia ni ngapi", "gunid ziko ngapi", "bei ya
 * manlia ni ngapi" — every one of them exactly one transposition or one
 * dropped letter from a product the shop really sells, and every one answered
 * "Sina rekodi ya…" while the shelf held twenty of them.
 *
 * The trigram search in `wa_resolve_company_product_read` is the right tool for
 * a name typed differently; it is the wrong tool for a name typed WRONG, where
 * a single swapped letter can drop similarity below any floor worth having.
 * This is the closed-vocabulary answer to a closed-vocabulary problem: the
 * shop's own list, one edit, and only when exactly one name matches. Two
 * candidates is not an answer, so it gives none.
 *
 * Deliberately runs only after the database has returned nothing, so it can
 * never override a real match.
 */
export function nearestCatalogueName(asked: string, names: string[]): string | null {
  const want = asked.trim().toLocaleLowerCase('sw-TZ');
  // Below four letters a single edit reaches too much to be evidence.
  if (want.length < 4) return null;
  let found: string | null = null;
  for (const name of names) {
    const candidate = name.trim().toLocaleLowerCase('sw-TZ');
    if (!candidate || !withinOneEdit(want, candidate)) continue;
    if (found && found !== name) return null;
    found = name;
  }
  return found;
}

/**
 * Resolves a short catalogue prefix without pretending it is an exact name.
 *
 * "nguvu" should find "nguvu ya sala" when that is the only possibility. If
 * the catalogue contains both "nguvu" and "nguvu ya sala", choosing either is
 * a guess, so the caller gets an ambiguity it can show to the user.
 */
export function cataloguePrefixResolution(
  asked: string,
  names: string[],
): ProductReadResolution | null {
  const wanted = asked.trim().toLocaleLowerCase('sw-TZ').replace(/\s+/g, ' ');
  if (wanted.length < 3) return null;
  const matched = names
    .map((name) => ({ name: name.trim(), key: name.trim().toLocaleLowerCase('sw-TZ').replace(/\s+/g, ' ') }))
    .filter(({ name, key }) => Boolean(name) && (key === wanted || key.startsWith(`${wanted} `)));
  if (matched.length === 0) return null;
  const candidates: ProductReadMatch[] = matched.map(({ name, key }) => ({
    productKey: key,
    productName: name,
    matchKind: key === wanted ? 'exact' : 'trigram',
    matchScore: key === wanted ? 1 : 0.99,
  }));
  return candidates.length === 1
    ? { kind: 'matched', asked, match: candidates[0] }
    : { kind: 'ambiguous', asked, candidates };
}

export function productReadClarification(resolution: Extract<ProductReadResolution, { kind: 'ambiguous' }>, lang: Lang): string {
  const names = resolution.candidates.slice(0, 3).map((candidate) => candidate.productName);
  const choices = names.length === 2
    ? (lang === 'sw' ? `${names[0]} au ${names[1]}` : `${names[0]} or ${names[1]}`)
    : names.map((name, index) => `${index + 1}. ${name}`).join('\n');
  return lang === 'sw'
    ? `Unamaanisha bidhaa gani kwa “${resolution.asked}”?\n${choices}`
    : `Which product do you mean by “${resolution.asked}”?\n${choices}`;
}

export function productReadMatchNotice(resolution: ProductReadResolution, lang: Lang): string {
  if (resolution.kind !== 'matched' || resolution.match.matchKind === 'exact') return '';
  return lang === 'sw'
    ? `Nimechukulia “${resolution.asked}” kuwa “${resolution.match.productName}”.\n`
    : `I matched “${resolution.asked}” to “${resolution.match.productName}”.\n`;
}
