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
    ? '\n\n⚠️ Sikuweza kuthibitisha rekodi hii na TRA, kwa hiyo namba zake ni za kusoma picha tu.'
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
  reviewUrl?: string | null,
): string {
  // A field that was BLANK and is now filled is a change. Reporting "nothing
  // changed" after the vendor went from nothing to MAWALENI COMPANY LIMITED is
  // simply untrue, and it was the first thing the owner noticed.
  const blank = lang === 'sw' ? '(hakuna)' : '(blank)';
  const lines: string[] = [];

  if (official.vendorName
      && official.vendorName.trim().toLowerCase() !== (before.vendorName ?? '').trim().toLowerCase()) {
    lines.push(lang === 'sw'
      ? `• Muuzaji: ${before.vendorName ?? blank} → ${official.vendorName}`
      : `• Vendor: ${before.vendorName ?? blank} → ${official.vendorName}`);
  }
  if (official.totalInclTax !== null
      && (before.total === null || Math.abs(official.totalInclTax - before.total) > 0.01)) {
    lines.push(lang === 'sw'
      ? `• Kiasi: ${before.total === null ? blank : money(before.total)} → ${money(official.totalInclTax)}`
      : `• Amount: ${before.total === null ? blank : money(before.total)} → ${money(official.totalInclTax)}`);
  }

  const head = lang === 'sw'
    ? `✅ Imethibitishwa na TRA: ${official.vendorName ?? 'rekodi'} — ${money(official.totalInclTax)}.`
    : `✅ Confirmed by TRA: ${official.vendorName ?? 'receipt'} — ${money(official.totalInclTax)}.`;

  // Every other reply carries a way to open the receipt; this one did not, so a
  // confirmation was a dead end.
  const link = reviewUrl
    ? `\n\n${lang === 'sw' ? 'Kagua na kamilisha' : 'Review and complete'}:\n${reviewUrl}`
    : '';

  if (lines.length === 0) {
    return lang === 'sw'
      ? `${head}\n\nUsomaji wa awali ulikuwa sahihi; hakuna kilichobadilika.${link}`
      : `${head}\n\nThe original reading was right; nothing changed.${link}`;
  }
  return lang === 'sw'
    ? `${head}\n\nNimerekebisha:\n${lines.join('\n')}${link}`
    : `${head}\n\nCorrected:\n${lines.join('\n')}${link}`;
}
