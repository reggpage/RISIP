import { formatMoney } from '@/lib/format';
import type { Invoice } from './useBilling';

// The receipt for a month of Risip.
//
// Built in the same language as the counter receipt in features/products:
// 480 wide, a circled logo, the name in bold, a rule, the lines, a total, a
// thank you, and the word Risip at the foot. A shopkeeper who has seen one
// should recognise the other without being told they are related.
//
// WHAT IS DIFFERENT, and why. A counter receipt is a slip a customer walks
// away with, so it stays neutral grey. This one is proof of a subscription
// payment and gets a brand band across the top in Risip crimson, because it
// is Risip that was paid and it is Risip the shopkeeper may one day have to
// show somebody.
//
// NOTHING IS COMPUTED HERE. Every figure comes from the invoice row, which was
// written before this image existed and confirmed by a signed webhook. A
// receipt that does its own arithmetic is a receipt that can disagree with the
// ledger it is supposed to prove.

const BRAND = '#DD2D4A';   // --role-admin, the Risip primary
const INK = '#0F172A';     // --ink
const MUTED = '#475569';   // --ink-muted
const RULE = '#E2E8F0';    // --surface-border

export type SubscriptionReceipt = {
  businessName: string;
  planName: string;
  invoice: Invoice;
  /** Shown in the circle when the shop has one. */
  logoUrl?: string | null;
};

const day = (iso: string, lang: 'sw' | 'en') =>
  new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString(
    lang === 'sw' ? 'sw-TZ' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' },
  );

const stamp = (iso: string | null, lang: 'sw' | 'en') =>
  iso
    ? new Date(iso).toLocaleString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : '';

/** A short, human reference. The full uuid helps nobody read a paper slip. */
export const receiptNumber = (invoice: Invoice) =>
  `RSP-${invoice.period_start.replace(/-/g, '').slice(0, 6)}-${invoice.id.slice(0, 6).toUpperCase()}`;

/**
 * The receipt as a message, for pasting into WhatsApp or an email.
 *
 * Text first, same as the counter receipt: it can be searched, copied and read
 * instantly on a cheap phone, and a picture can do none of those.
 */
export function subscriptionReceiptText(receipt: SubscriptionReceipt, lang: 'sw' | 'en'): string {
  const { invoice } = receipt;
  const line = (left: string, right: string) => {
    const gap = Math.max(1, 34 - left.length - right.length);
    return `${left}${' '.repeat(gap)}${right}`;
  };
  return lang === 'sw'
    ? [
      'RISITI YA MALIPO',
      receipt.businessName,
      `Namba: ${receiptNumber(invoice)}`,
      '',
      line('Plan', receipt.planName),
      line('Kuanzia', day(invoice.period_start, lang)),
      line('Hadi', day(invoice.period_end, lang)),
      '',
      line('JUMLA', formatMoney(invoice.amount_tzs)),
      `Ilipwa: ${stamp(invoice.paid_at, lang)}`,
      '',
      'Asante. Risip',
    ].join('\n')
    : [
      'PAYMENT RECEIPT',
      receipt.businessName,
      `Number: ${receiptNumber(invoice)}`,
      '',
      line('Plan', receipt.planName),
      line('From', day(invoice.period_start, lang)),
      line('To', day(invoice.period_end, lang)),
      '',
      line('TOTAL', formatMoney(invoice.amount_tzs)),
      `Paid: ${stamp(invoice.paid_at, lang)}`,
      '',
      'Thank you. Risip',
    ].join('\n');
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The logo bucket is public-read; without this the canvas is tainted and
    // toBlob throws, which loses the receipt rather than the logo.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('logo failed'));
    image.src = url;
  });
}

/** The receipt as a picture, for saving and for showing to somebody later. */
export async function subscriptionReceiptImage(
  receipt: SubscriptionReceipt,
  lang: 'sw' | 'en',
  scale = 2,
): Promise<Blob> {
  const { invoice } = receipt;
  const width = 480;
  // Measured against the drawing below rather than guessed. A slip with a hand
  // of blank paper under it looks like something failed to load.
  //   band 6 · top 26 (+82 with a logo) · name 26 · number 24 · rule 22
  //   · three rows 3×26 · rule 22 · total 46 · paid 22 · thanks 24 · foot 24
  const height = (receipt.logoUrl ? 108 : 26) + 26 + 24 + 22 + 78 + 22 + 46 + 22 + 48;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // The one piece of brand on the slip.
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, width, 6);

  let y = 32;

  if (receipt.logoUrl) {
    const logo = await loadImage(receipt.logoUrl).catch(() => null);
    if (logo) {
      const size = 64;
      const x = (width - size) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, x, y, size, size);
      ctx.restore();
      y += size + 18;
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(receipt.businessName, width / 2, y);
  y += 26;

  ctx.fillStyle = MUTED;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(
    `${lang === 'sw' ? 'RISITI YA MALIPO' : 'PAYMENT RECEIPT'} · ${receiptNumber(invoice)}`,
    width / 2, y,
  );
  y += 24;

  const rule = () => {
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(width - 24, y);
    ctx.stroke();
    y += 22;
  };
  rule();

  const row = (label: string, value: string) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(label, 24, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(value, width - 24, y);
    y += 26;
  };

  row(lang === 'sw' ? 'Plan' : 'Plan', receipt.planName);
  row(lang === 'sw' ? 'Kuanzia' : 'From', day(invoice.period_start, lang));
  row(lang === 'sw' ? 'Hadi' : 'To', day(invoice.period_end, lang));

  rule();

  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(lang === 'sw' ? 'JUMLA' : 'TOTAL', 24, y + 6);
  ctx.textAlign = 'right';
  ctx.fillText(formatMoney(invoice.amount_tzs), width - 24, y + 6);
  y += 46;

  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(
    `${lang === 'sw' ? 'Ilipwa' : 'Paid'} ${stamp(invoice.paid_at, lang)}`,
    width / 2, y,
  );
  y += 24;

  ctx.fillStyle = MUTED;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(lang === 'sw' ? 'Asante kwa kutumia Risip' : 'Thank you for using Risip', width / 2, y);
  y += 22;

  ctx.fillStyle = BRAND;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('Risip', width / 2, y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('image failed'))), 'image/png');
  });
}
