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
    // Three blank lines in a row is Markdown spacing, not a paragraph.
    .replace(/\n{3,}/g, '\n\n')
    // A removed fence leaves the message starting on a blank line. Only the
    // newlines go: the confirmations indent their bullets by two spaces, and
    // trimming those would re-flow every sale Risip has ever read back.
    .replace(/^\n+/, '')
    .trimEnd();
}
