import { formatMoney } from '@/lib/format';
import { basketTotal, lineTotal, lineUnitPrice, type CounterLine } from './products';

// The slip a customer walks away with.
//
// Two shapes, because a receipt gets used two ways and neither substitutes for
// the other: TEXT, which a shopkeeper pastes into WhatsApp so the customer has
// it on their own phone, and a PICTURE, which is what gets saved and shown when
// somebody comes back to argue about a price.
//
// Neither invents anything. Both are built from the lines that were actually
// charged, at the prices that were actually used.

export type ReceiptDetails = {
  businessName: string;
  lines: CounterLine[];
  at: Date;
  /** Shown on the picture when the shop has one. */
  logoUrl?: string | null;
};

const stamp = (at: Date, lang: 'sw' | 'en') =>
  at.toLocaleString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/**
 * The receipt as a message.
 *
 * Plain text on purpose: WhatsApp is where it is going, a picture cannot be
 * searched or copied out, and a customer on a cheap phone opens text instantly.
 */
export function receiptText(receipt: ReceiptDetails, lang: 'sw' | 'en'): string {
  const width = 32;
  const rows = receipt.lines.map((line) => {
    const left = `${line.quantity} × ${line.productName}`;
    const right = formatMoney(lineTotal(line));
    const gap = Math.max(1, width - left.length - right.length);
    return `${left}${' '.repeat(gap)}${right}`;
  }).join('\n');

  const header = lang === 'sw' ? 'RISITI' : 'RECEIPT';
  const totalLabel = lang === 'sw' ? 'JUMLA' : 'TOTAL';
  const thanks = lang === 'sw' ? 'Asante kwa kununua nasi 🙏' : 'Thank you for your custom 🙏';

  return `*${receipt.businessName}*\n${header} · ${stamp(receipt.at, lang)}\n`
    + `${'—'.repeat(width)}\n${rows}\n${'—'.repeat(width)}\n`
    + `*${totalLabel}: ${formatMoney(basketTotal(receipt.lines))}*\n\n${thanks}`;
}

/**
 * The receipt as a picture, drawn rather than screenshotted.
 *
 * A screenshot carries the browser chrome, the battery indicator and whatever
 * else is on the phone. This is only the slip, at a size that stays readable
 * when WhatsApp compresses it.
 */
export async function receiptImage(receipt: ReceiptDetails, lang: 'sw' | 'en'): Promise<Blob> {
  const scale = 2;
  const width = 480;
  const rowHeight = 34;
  // Measured against the drawing below rather than guessed: a slip with a hand
  // of blank paper under it looks like something failed to load.
  //   top margin 28 (+82 for a logo) · name 24 · date 26 · rule 22
  //   · rows · 4 · rule 22 · total 44 · thanks 22 · bottom margin 22
  const height = (receipt.logoUrl ? 110 : 28) + receipt.lines.length * rowHeight + 186;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  let y = 28;

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
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(receipt.businessName, width / 2, y);
  y += 24;

  ctx.fillStyle = '#6b7280';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`${lang === 'sw' ? 'RISITI' : 'RECEIPT'} · ${stamp(receipt.at, lang)}`, width / 2, y);
  y += 26;

  const rule = () => {
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(width - 24, y);
    ctx.stroke();
    y += 22;
  };
  rule();

  for (const line of receipt.lines) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#111827';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(line.productName, 24, y);
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${line.quantity} × ${formatMoney(lineUnitPrice(line))}`, 24, y + 15);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(formatMoney(lineTotal(line)), width - 24, y);
    y += rowHeight;
  }

  y += 4;
  rule();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(lang === 'sw' ? 'JUMLA' : 'TOTAL', 24, y + 6);
  ctx.textAlign = 'right';
  ctx.fillText(formatMoney(basketTotal(receipt.lines)), width - 24, y + 6);
  y += 44;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b7280';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(lang === 'sw' ? 'Asante kwa kununua nasi' : 'Thank you for your custom', width / 2, y);
  y += 22;
  ctx.fillStyle = '#9ca3af';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('Risip', width / 2, y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('image failed'))), 'image/png');
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The logo bucket is public-read, and without this the canvas is tainted
    // and toBlob throws — a receipt that cannot be saved because of a logo.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

/** The filename a shopkeeper will recognise in their gallery. */
export function receiptFilename(receipt: ReceiptDetails): string {
  const date = receipt.at.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const name = receipt.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `risiti-${name || 'duka'}-${date}.png`;
}
