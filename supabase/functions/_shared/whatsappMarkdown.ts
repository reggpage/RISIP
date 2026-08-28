// WhatsApp is not Markdown, and the difference shows.
//
// MEASURED FAILURE. The assistant answered "what can risip do for me" with a
// tidy Markdown list and the owner read:
//
//   · *Record transactions* — sales, expenses, customer debts…
//   · *Check performance* — daily/weekly/monthly summaries…
//
// Every heading wearing a pair of asterisks. WhatsApp marks bold with a SINGLE
// asterisk, so the model's `**bold**` renders as a literal star, the real bold,
// and another literal star. Headings, hashes and underscores do the same.
//
// The model is not going to remember this reliably, and telling it again in the
// prompt costs tokens on every single message. Cheaper and certain to fix the
// text on the way out.

/**
 * Stands in for a bold marker that WhatsApp really will render, so the sweep
 * that removes every surviving star cannot take the good ones with it.
 */
const SENTINEL = '\u0000';

/** Markdown as the model writes it → what WhatsApp actually renders. */
export function toWhatsAppText(text: string): string {
  return String(text ?? '')
    // ***both*** → bold. WhatsApp has no combined marker.
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '*$1*')
    // **bold** → *bold*. The one that actually bit us.
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '*$1*')
    // __bold__ → *bold*, _italic_ is already WhatsApp's own and stays.
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '*$1*')
    // ### Heading → *Heading*, on its own line only.
    .replace(/^#{1,6}\s+(.+?)\s*$/gm, '*$1*')
    // [text](url) → text (url). A bare link is tappable; the brackets are not.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    // Fenced code blocks: keep the contents, drop the fence.
    .replace(/^```[a-z]*\s*$/gim, '')
    // `code` → the code itself. WhatsApp's ``` is for blocks, not spans.
    .replace(/`([^`\n]+)`/g, '$1')
    // A bullet written with a star reads as a broken bold marker.
    .replace(/^\s*\*\s+(?=\S)/gm, '• ')
    .replace(/^\s*-\s+(?=\S)/gm, '• ')
    // A star the reader can SEE is worse than no emphasis at all.
    //
    // MEASURED, the owner's screenshot: "Harakati: *+43%*." arrived with both
    // stars visible. WhatsApp only turns *...* into bold when the characters
    // hugging the markers are letters or digits — a leading "+" kills it, and
    // the marker is then just punctuation the shop has to read past. Unwrap
    // those rather than ship them.
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, (_whole: string, inner: string) => {
      const first = inner[0] ?? '';
      const last = inner[inner.length - 1] ?? '';
      const rendersAsBold = /[\p{L}\p{N}]/u.test(first) && /[\p{L}\p{N}]/u.test(last);
      // Parked out of the way of the sweep below, which cannot tell a marker
      // that works from one that does not.
      return rendersAsBold ? SENTINEL + inner + SENTINEL : inner;
    })
    // Any star left over never had a partner, so it can only render as itself.
    // Only the ones HUGGING a word go: a star with space on both sides is the
    // trader's multiplication sign ("bei ni 5000 * 3"), not a broken marker.
    .replace(/(?<=\S)\*|\*(?=\S)/g, '')
    .replace(new RegExp(SENTINEL, 'g'), '*')
    // Three blank lines in a row is Markdown spacing, not a paragraph.
    .replace(/\n{3,}/g, '\n\n')
    // A removed fence leaves the message starting on a blank line. Only the
    // newlines go: the confirmations indent their bullets by two spaces, and
    // trimming those would re-flow every sale Risip has ever read back.
    .replace(/^\n+/, '')
    .trimEnd();
}
