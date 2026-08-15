// Catching a product name that is nearly, but not quite, one you already sell.
//
// 0091 folds away the splits that are only punctuation or spacing: "- nguvu ya
// sala" and "nguvu ya sala" are now one product with nothing to do. What it
// deliberately does NOT fold is a real difference in letters — "Biblia" and
// "Bibilia" stay apart, because folding those automatically would eventually
// merge two products that are genuinely different and move money between them.
//
// So this asks instead of deciding. When a sale names something one edit away
// from an existing product, the confirmation says so and the trader answers.
// They know whether "Biblia Ndogo" is the same thing as "Biblia"; nothing here
// does.
//
// The threshold is deliberately tight. A suggestion that fires on every third
// sale is noise people learn to scroll past, and then the one that mattered is
// scrolled past too.

/** Same normalisation as private.product_key, so both sides agree on a name. */
export function productKey(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance, capped: once it is past the limit the exact value does
 * not matter and the work can stop.
 */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * How close two product names are, as a decision rather than a score.
 *
 * "biblia" vs "bibilia" is one insertion — a typo, worth asking about.
 * "biblia" vs "biblia kubwa" is a different product with an extra word, and
 * asking would be wrong: a shop really does sell both.
 */
export function isNearName(candidate: string, existing: string): boolean {
  const a = productKey(candidate);
  const b = productKey(existing);
  if (!a || !b || a === b) return false;

  // A whole extra word almost always means a real variant: Biblia / Biblia
  // Kubwa, Daftari / Daftari Kubwa. Those are two products, not one misspelt.
  if (a.split(' ').length !== b.split(' ').length) return false;

  // Short names are too easy to collide: "rula" and "rula" aside, three or four
  // letters apart by one is often a different thing entirely.
  const shortest = Math.min(a.length, b.length);
  if (shortest < 5) return false;

  const limit = shortest >= 9 ? 2 : 1;
  return editDistance(a, b, limit) <= limit;
}

/**
 * The existing product a new name is probably a misspelling of, or null.
 *
 * Returns at most one: offering three near-matches turns a quick confirmation
 * into a puzzle, and the closest is nearly always the right one.
 */
export function findNearProduct(candidate: string, existing: string[]): string | null {
  const a = productKey(candidate);
  if (!a) return null;
  let best: { name: string; distance: number } | null = null;
  for (const name of existing) {
    if (!isNearName(candidate, name)) continue;
    const distance = editDistance(a, productKey(name), 3);
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best?.name ?? null;
}

export type NameWarning = { said: string; existing: string };

/** Every line in a record whose product name is near an existing one. */
export function findNameWarnings(
  descriptions: string[],
  existing: string[],
): NameWarning[] {
  const seen = new Set<string>();
  const warnings: NameWarning[] = [];
  for (const said of descriptions) {
    const key = productKey(said);
    if (!key || seen.has(key)) continue;
    // Already a known product: nothing to ask.
    if (existing.some((name) => productKey(name) === key)) continue;
    const near = findNearProduct(said, existing);
    if (near) {
      seen.add(key);
      warnings.push({ said, existing: near });
    }
  }
  return warnings;
}

export function nameWarningText(warnings: NameWarning[], lang: 'sw' | 'en'): string {
  if (warnings.length === 0) return '';
  const rows = warnings
    .map((warning) => lang === 'sw'
      ? `• "${warning.said}" inafanana na "${warning.existing}" uliyonayo`
      : `• "${warning.said}" is close to "${warning.existing}", which you already have`)
    .join('\n');
  return lang === 'sw'
    ? `\n\n⚠️ ${rows}\nKama ni kitu kile kile, tumia jina lile lile — vinginevyo itakuwa bidhaa mbili tofauti.`
    : `\n\n⚠️ ${rows}\nIf it is the same thing, use the same name — otherwise it becomes two separate products.`;
}
