// When the square could not be read, ask for a closer one.
//
// The tiled scanner finds a QR down to about 5% of the frame. Below that — a
// receipt held at arm's length, at an angle, under a window — it misses, and no
// amount of extra pixels fixes a square that is only three pixels a module in
// the file. A closer photo does, immediately and every time.
//
// HOW THE FOLLOW-UP IS RECOGNISED, without asking anybody to remember a mode:
// the next photo is decoded, and the code it yields is looked up WITH THE
// PENDING RECEIPT'S OWN PRINTED TIME. TRA needs both to answer, so an answer
// means both matched — it really is the same receipt. A photo of a different
// receipt fails that lookup and is filed as the new receipt it is.
//
// So nothing depends on state the person has to keep. The image itself decides.

import type { Lang } from './whatsappIntent.ts';
import type { TraReceipt } from './traVerify.ts';

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `TSh ${Math.round(value).toLocaleString('en-US')}`;

/** Appended to the receipt confirmation when TRA could not confirm it. */
export function askForQrCloseUp(lang: Lang): string {
  return lang === 'sw'
    ? '\n\n⚠️ Sikuweza kuthibitisha risiti hii na TRA, kwa hiyo namba zake ni za kusoma picha tu.'
      + '\n\nNipigie picha ya mraba wa QR peke yake, karibu — nitachukua taarifa halisi kutoka TRA.'
    : '\n\n⚠️ I could not confirm this receipt with TRA, so its figures are only what the photo showed.'
      + '\n\nSend me a close-up of just the QR square and I will take the real figures from TRA.';
}

/**
 * What changed once TRA answered. Says the numbers, because "imethibitishwa"
 * alone hides whether anything was actually wrong.
 */
export function qrCorrectionReply(
  before: { vendorName: string | null; total: number | null },
  official: TraReceipt,
  lang: Lang,
): string {
  const lines: string[] = [];
  if (official.vendorName && before.vendorName
      && official.vendorName.trim().toLowerCase() !== before.vendorName.trim().toLowerCase()) {
    lines.push(lang === 'sw'
      ? `• Muuzaji: ${before.vendorName} → ${official.vendorName}`
      : `• Vendor: ${before.vendorName} → ${official.vendorName}`);
  }
  if (official.totalInclTax !== null && before.total !== null
      && Math.abs(official.totalInclTax - before.total) > 0.01) {
    lines.push(lang === 'sw'
      ? `• Kiasi: ${money(before.total)} → ${money(official.totalInclTax)}`
      : `• Amount: ${money(before.total)} → ${money(official.totalInclTax)}`);
  }

  const head = lang === 'sw'
    ? `✅ Imethibitishwa na TRA: ${official.vendorName ?? 'risiti'} — ${money(official.totalInclTax)}.`
    : `✅ Confirmed by TRA: ${official.vendorName ?? 'receipt'} — ${money(official.totalInclTax)}.`;

  if (lines.length === 0) {
    return lang === 'sw'
      ? `${head}\n\nUsomaji wa awali ulikuwa sahihi; hakuna kilichobadilika.`
      : `${head}\n\nThe original reading was right; nothing changed.`;
  }
  return lang === 'sw'
    ? `${head}\n\nNimerekebisha:\n${lines.join('\n')}`
    : `${head}\n\nCorrected:\n${lines.join('\n')}`;
}
