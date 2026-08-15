import type { Lang } from './whatsappIntent.ts';

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

