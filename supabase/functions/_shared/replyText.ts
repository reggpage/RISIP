/**
 * Tidying applied to text on its way to a person.
 *
 * MEASURED: the chat transport replaced every em dash with a comma, so a
 * template line reading "• *atlasi* — imeisha" reached the shop as
 * "• atlasi , imeisha" — a comma hanging off its own space. The house style
 * has no long dashes, which is right, but a comma is not what a dash meant.
 *
 * A plain hyphen keeps the sense, and the space before punctuation is closed
 * whatever produced it. No digit is touched, so a figure cannot change here.
 */
export function tidyReplyText(text: string): string {
  return text
    .replace(/[–—―]/gu, '-')
    .replace(/[ \t]+([,.;:!?])/gu, '$1')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/[ \t]+\n/gu, '\n');
}
