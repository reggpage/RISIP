import type { Lang } from './whatsappIntent.ts';
import { withinOneEdit } from './whatsappSpelling.ts';

export type ProductReadMatch = {
  productKey: string;
  productName: string;
  /**
   * How the catalogue was reached.
   *
   * MEASURED FAILURE, mine, from phase 3: the alias RPC returned match_kind
   * 'alias' and this list did not contain it, so rowToMatch rejected every
   * alias row and the resolution came back "not_found". The migration was
   * right, the SQL test passed, and no alias worked through the edge function
   * at all. A union that a database can return values outside of is a union
   * that will be wrong eventually.
   */
  matchKind: 'exact' | 'alias' | 'trailing_vowel' | 'noun_class' | 'trigram';
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
  const KINDS = ['exact', 'alias', 'trailing_vowel', 'noun_class', 'trigram'] as const;
  if (!productKey || !productName
      || !KINDS.includes(matchKind as typeof KINDS[number])
      || !Number.isFinite(matchScore)) return null;
  return { productKey, productName, matchKind: matchKind as ProductReadMatch['matchKind'], matchScore };
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

/**
 * Resolves a wording against the WORDS of a catalogue name, not the whole name.
 *
 * MEASURED FAILURE. The catalogue held "Anton wa Padua". A shop wrote
 * "Antoni 4" and was offered a NEW PRODUCT registration for something it
 * already sells, because every resolver above compares whole strings:
 * "antoni" against "anton wa padua" is nowhere near one edit, so nothing
 * matched and the answer was "haipo".
 *
 * A trader naming a product almost never types its full registered name. They
 * type the word they use for it, and that word is usually one of the words in
 * the name. This matches the asked wording against each name's own tokens,
 * allowing the same single edit the whole-name resolver allows — "Antoni" for
 * "Anton", "Sala" for "Sala".
 *
 * Ambiguity is preserved rather than resolved. If two products share the token,
 * the caller gets both and asks, because "closest wins" on a product name is
 * how the wrong meat leaves the shelf.
 */
export function catalogueTokenResolution(
  asked: string,
  names: string[],
): ProductReadResolution | null {
  const wanted = asked.trim().toLocaleLowerCase('sw-TZ');
  // Below four letters a single edit reaches too much to be evidence — the
  // same floor the whole-name resolver uses, for the same reason.
  if (wanted.length < 4) return null;

  const hits: string[] = [];
  for (const name of names) {
    const clean = name.trim();
    if (!clean) continue;
    const tokens = clean.toLocaleLowerCase('sw-TZ').split(/\s+/u).filter((token) => token.length >= 4);
    if (tokens.some((token) => token === wanted || withinOneEdit(wanted, token))) hits.push(clean);
  }

  const unique = [...new Set(hits)];
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    return {
      kind: 'matched',
      asked,
      match: {
        productKey: unique[0].toLocaleLowerCase('sw-TZ').replace(/\s+/gu, ' '),
        productName: unique[0],
        matchKind: 'trigram',
        matchScore: 0.98,
      },
    };
  }
  return {
    kind: 'ambiguous',
    asked,
    candidates: unique.map((name) => ({
      productKey: name.toLocaleLowerCase('sw-TZ').replace(/\s+/gu, ' '),
      productName: name,
      matchKind: 'trigram' as const,
      matchScore: 0.98,
    })),
  };
}

export function productReadClarification(resolution: Extract<ProductReadResolution, { kind: 'ambiguous' }>, lang: Lang): string {
  // ALWAYS NUMBERED, EVEN WHEN THERE ARE ONLY TWO.
  //
  // The owner's own wording: "kwenye stoo yako kuna bidhaa x zinazoanza na
  // jina au kufanana na jina (kitabu) … mtu achague kwa namba." The old
  // two-name form ran them together with "au", which asks somebody to retype
  // a five-word product name to answer a question about spelling.
  const names = resolution.candidates.slice(0, 3).map((candidate) => candidate.productName);
  const choices = names.map((name, index) => `*${index + 1}.* ${name}`).join('\n');
  return lang === 'sw'
    ? `Kwenye stoo yako kuna bidhaa ${names.length} zinazoanza na jina au kufanana na jina “${resolution.asked}”:\n\n`
      + `${choices}\n\nUlikuwa unamaanisha bidhaa gani kati ya hizi? Jibu kwa namba.\n\nUkitaka kuacha, andika *GHAIRI*.`
    : `Your store has ${names.length} products that start like or look like “${resolution.asked}”:\n\n`
      + `${choices}\n\nWhich one did you mean? Reply with the number.\n\nTo stop, reply *GHAIRI*.`;
}

export function productReadMatchNotice(resolution: ProductReadResolution, lang: Lang): string {
  if (resolution.kind !== 'matched' || resolution.match.matchKind === 'exact') return '';
  return lang === 'sw'
    ? `Nimechukulia “${resolution.asked}” kuwa “${resolution.match.productName}”.\n`
    : `I matched “${resolution.asked}” to “${resolution.match.productName}”.\n`;
}
