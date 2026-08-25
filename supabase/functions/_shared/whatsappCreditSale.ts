import { parseQuantityOnlySale, type QuantitySale } from './whatsappQuantitySale.ts';

/**
 * A sale somebody walked away with and has not paid for.
 *
 * The only things that make it different from an ordinary sale are WHO took the
 * goods and that no money arrived. Everything else — which product, which
 * measure, how much it is worth — is identical, so this reads the wrapper and
 * hands the goods straight to the ordinary quantity parser. There is no second
 * pricing path and there is no Bucha arithmetic here.
 *
 *   Juma kachukua za mbwa 3 hajalipa
 *   Juma kachukua vifuko 3 vya mbwa hajalipa
 *   Juma kachukua nyama kilo 2 kwa deni
 *   Asha amechukua maziwa 4 hajalipa
 */
export type CreditQuantitySale = {
  kind: 'credit_quantity_sale';
  /** The customer, as the trader wrote them. Free text, like every party name. */
  party: string;
  /** The goods, read by the ordinary parser so units and aliases behave alike. */
  sale: QuantitySale;
  /** The words that made it credit, for the confirmation to quote back. */
  said: string;
};

const clean = (value: string | null | undefined) =>
  String(value ?? '').replace(/\s+/g, ' ').trim();

/** Taking goods away, in the words a counter actually hears. */
const TOOK = 'kachukua|amechukua|alichukua|anachukua|kakopa|amekopa|alikopa|kanichukulia';

/**
 * The phrases that mean "and has not paid".
 *
 * "Mkopo" alone is deliberately NOT enough anywhere in this file: a shop can
 * take a bank loan, and one word should not decide that a customer owes money.
 * It counts only inside "kwa mkopo" and only in a sentence that already says
 * somebody took goods.
 */
const UNPAID = /\b(?:hajalipa|hakulipa|bado\s+hajalipa|atalipa(?:\s+\w+)?|kwa\s+deni|kwa\s+mkopo|deni)\s*$/iu;

/**
 * A person's name, not a product and not a sentence.
 *
 * One or two words: "Juma", "Mama Asha". Longer than that and the parser has
 * almost certainly eaten the goods, so it declines rather than inventing a
 * customer nobody named.
 */
function plausibleParty(value: string): boolean {
  const name = clean(value);
  return name.length >= 2 && name.length <= 40
    && /^[\p{L}][\p{L}'’.\- ]*$/u.test(name)
    && name.split(' ').length <= 2;
}

const titleCase = (value: string) =>
  clean(value).split(' ').filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('sw-TZ') + word.slice(1))
    .join(' ');

export function parseCreditQuantitySale(
  text: string | null | undefined,
): CreditQuantitySale | null {
  const said = clean(text);
  if (!said) return null;

  const shape = new RegExp(`^(.+?)\\s+(?:${TOOK})\\s+(.+)$`, 'iu').exec(said);
  if (!shape) return null;
  const party = shape[1];
  if (!plausibleParty(party)) return null;

  const tail = UNPAID.exec(shape[2]);
  // Without the unpaid words this is not a credit sale — it may be a sale, a
  // stock movement or nothing at all, and any of those belong to somebody else.
  if (!tail) return null;

  const goods = clean(shape[2].slice(0, tail.index));
  if (goods.length < 2) return null;

  // The ordinary parser, unchanged, so a measure said out loud and an alias
  // both behave exactly as they do in a paid sale.
  const sale = parseQuantityOnlySale(`nimeuza ${goods}`);
  if (!sale || sale.items.length === 0) return null;

  return {
    kind: 'credit_quantity_sale',
    party: titleCase(party),
    sale,
    said: clean(tail[0]),
  };
}
