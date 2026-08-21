import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Loader2, Receipt as ReceiptIcon, Share2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { formatMoney } from '@/lib/format';
import { basketTotal, lineTotal, lineUnitPrice, type CounterLine } from './products';
import { receiptFilename, receiptImage, receiptText, type ReceiptDetails } from './receipt';

// What a finished sale looks like.
//
// The confetti is not decoration: at a counter the shopkeeper is already
// looking at the next customer, and a flat toast is missed. A full-screen answer
// is how they know the money is in the book — and it is the moment the receipt
// has to be offered, because thirty seconds later the customer has gone.

const COPY = {
  sw: {
    done: 'Mauzo yamehifadhiwa',
    pending: 'Yanasubiri uthibitisho wa owner au accountant',
    receipt: 'Onyesha risiti',
    hide: 'Ficha risiti',
    share: 'Tuma kwa WhatsApp',
    save: 'Hifadhi kama picha',
    next: 'Uza tena',
    total: 'JUMLA',
    slip: 'RISITI',
    thanks: 'Asante kwa kununua nasi',
    saved: 'Risiti imehifadhiwa',
  },
  en: {
    done: 'Sale saved',
    pending: 'Waiting for an owner or accountant to confirm',
    receipt: 'Show receipt',
    hide: 'Hide receipt',
    share: 'Send on WhatsApp',
    save: 'Save as picture',
    next: 'Sell again',
    total: 'TOTAL',
    slip: 'RECEIPT',
    thanks: 'Thank you for your custom',
    saved: 'Receipt saved',
  },
} as const;

/** Paper-light, cheap, and gone in three seconds. */
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 34 }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.8 + Math.random() * 1.4,
    tilt: Math.random() * 360,
    color: ['#e11d48', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'][index % 5],
  })), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      <style>{'@keyframes risip-fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(105vh) rotate(720deg); opacity: 0; } }'}</style>
      {pieces.map((piece) => (
        <span
          key={piece.id}
          style={{
            position: 'absolute',
            left: `${piece.left}%`,
            width: 9,
            height: 14,
            background: piece.color,
            transform: `rotate(${piece.tilt}deg)`,
            animation: `risip-fall ${piece.duration}s ${piece.delay}s ease-in forwards`,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

export function SaleDone({
  lines, businessName, logoUrl, confirmed, lang, onNext,
}: {
  lines: CounterLine[];
  businessName: string;
  logoUrl: string | null;
  confirmed: boolean;
  lang: 'sw' | 'en';
  onNext: () => void;
}) {
  const c = COPY[lang];
  const [showReceipt, setShowReceipt] = useState(false);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [note, setNote] = useState('');
  const [celebrating, setCelebrating] = useState(true);

  useEffect(() => {
    const done = window.setTimeout(() => setCelebrating(false), 3200);
    return () => window.clearTimeout(done);
  }, []);

  // Fixed at the moment the sale closed, not re-read on every render: a receipt
  // whose time creeps forward while it is on screen is not a receipt.
  const details: ReceiptDetails = useMemo(
    () => ({ businessName, lines, at: new Date(), logoUrl }),
    [businessName, lines, logoUrl],
  );

  const share = async () => {
    setBusy('share');
    const text = receiptText(details, lang);
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        // No share sheet: WhatsApp's own link takes the text straight into a
        // chat, which is where this was going anyway.
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch {
      // A cancelled share sheet is not an error.
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      const blob = await receiptImage(details, lang);
      const file = new File([blob], receiptFilename(details), { type: 'image/png' });
      // A phone with a share sheet saves to the gallery from there; a browser
      // without one downloads. Both end with the picture on the phone.
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
      }
      setNote(c.saved);
    } catch {
      setNote('');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {celebrating ? <Confetti /> : null}
      <div className="mx-auto max-w-md space-y-4 p-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
          <Check className="h-8 w-8" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-ink">{formatMoney(basketTotal(lines))}</p>
          <p className="mt-1 text-sm font-medium text-emerald-700">{c.done}</p>
          {!confirmed ? <p className="mt-1 text-xs text-ink-muted">{c.pending}</p> : null}
        </div>

        {showReceipt ? (
          <div className="rounded-2xl border border-border bg-surface p-4 text-left shadow-sm">
            <div className="flex flex-col items-center">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="mb-2 h-14 w-14 rounded-full object-cover" />
              ) : null}
              <p className="text-base font-semibold text-ink">{businessName}</p>
              <p className="text-xs text-ink-muted">
                {c.slip} · {details.at.toLocaleString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <div className="my-3 border-t border-border" />
            <ul className="space-y-2">
              {lines.map((line) => (
                <li key={line.productKey} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-ink">{line.productName}</p>
                    <p className="text-xs text-ink-muted">
                      {line.quantity} × {formatMoney(lineUnitPrice(line))}
                    </p>
                  </div>
                  <span className="tabular-nums text-ink">{formatMoney(lineTotal(line))}</span>
                </li>
              ))}
            </ul>
            <div className="my-3 border-t border-border" />
            <div className="flex items-center justify-between text-base font-semibold text-ink">
              <span>{c.total}</span>
              <span className="tabular-nums">{formatMoney(basketTotal(lines))}</span>
            </div>
            <p className="mt-3 text-center text-xs text-ink-muted">{c.thanks}</p>

            <div className="mt-4 flex gap-2">
              <Button className="flex-1 justify-center" disabled={busy !== null} onClick={() => void share()}>
                {busy === 'share'
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Share2 className="mr-2 h-4 w-4" />}
                {c.share}
              </Button>
              <Button variant="secondary" disabled={busy !== null} onClick={() => void save()}>
                {busy === 'save'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
              </Button>
            </div>
            {note ? <p className="mt-2 text-center text-xs text-emerald-700">{note}</p> : null}
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1 justify-center"
            onClick={() => setShowReceipt((open) => !open)}
          >
            {showReceipt ? <X className="mr-2 h-4 w-4" /> : <ReceiptIcon className="mr-2 h-4 w-4" />}
            {showReceipt ? c.hide : c.receipt}
          </Button>
          <Button className="flex-1 justify-center" onClick={onNext}>{c.next}</Button>
        </div>
      </div>
    </>
  );
}
