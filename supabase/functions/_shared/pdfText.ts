// Making a shop's own words safe for a PDF font.
//
// pdf-lib's StandardFonts are WinAnsi-encoded, and drawText THROWS on any
// character the encoding cannot hold. That is a whole PDF lost to one smart
// quote, and a shopkeeper does not type ASCII on purpose: WhatsApp turns ' into
// ’ by itself, and "ng'ombe" is a product half this country sells.
//
// So every string that reaches a page goes through here first. The mappings are
// the characters that actually turn up in this product — typographic quotes and
// dashes that phones insert, the ellipsis, the non-breaking space — folded to
// their ASCII twins so the meaning survives. Anything still outside the
// encoding is dropped rather than allowed to throw, because a statement with
// one odd character missing is worth infinitely more than no statement at all.

const FOLD: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"',
  '–': '-', '—': '-', '―': '-', '−': '-',
  '…': '...', ' ': ' ', '​': '', '‌': '', '‍': '',
  // The middot is NOT here: WinAnsi holds it at 0xB7 and Risip's own footer
  // uses it as a separator. Folding it to a hyphen changed the product's copy
  // for no reason. The bullet above it genuinely has no WinAnsi slot.
  '•': '-', '′': "'", '″': '"',
};

/**
 * @param text  anything a shop typed or a table cell holds
 * @returns     the same text, WinAnsi-safe, never throwing
 */
export function pdfSafe(text: string | number | null | undefined): string {
  const raw = text == null ? '' : String(text);
  let out = '';
  for (const ch of raw) {
    const folded = FOLD[ch];
    if (folded !== undefined) { out += folded; continue; }
    const code = ch.codePointAt(0) ?? 0;
    // Printable ASCII, plus the Latin-1 range WinAnsi shares with it. Control
    // characters and the 0x80-0x9F block are dropped: the first would corrupt
    // the layout, the second is where WinAnsi and Latin-1 disagree.
    if (code === 9 || code === 10) { out += ' '; continue; }
    if (code >= 0x20 && code <= 0x7E) { out += ch; continue; }
    if (code >= 0xA0 && code <= 0xFF) { out += ch; continue; }
    // Anything else is dropped rather than allowed to throw.
  }
  return out;
}

/**
 * Cut a string to fit a column, with an ellipsis that is itself safe.
 *
 * Measured in characters rather than in points on purpose: the caller knows its
 * column width in a monospaced-enough sense, and a wrong-by-a-few-pixels cut is
 * a cosmetic problem, while text running under the next column is a statement
 * nobody can read.
 */
export function pdfClip(text: string | number | null | undefined, max: number): string {
  const safe = pdfSafe(text);
  return safe.length <= max ? safe : `${safe.slice(0, Math.max(1, max - 1))}.`;
}
