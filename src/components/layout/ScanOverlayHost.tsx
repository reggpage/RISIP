import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { closeScan, openScan, useScanOverlay } from '@/lib/scanOverlay';
import { getLang } from '@/lib/lang';
import SellPage from '@/routes/products/SellPage';
import ScanPage from '@/routes/products/ScanPage';

/**
 * Full-screen scan sheets: "Scan to sell" (/sell) and "Register a barcode"
 * (/scan) open as modals over whatever screen the user is on, never as route
 * changes — the counter stays exactly where it was when the sale is done.
 *
 * The embedded pages normally leave via router <Link>s; inside the sheet those
 * are handed onExit / onShowScan callbacks so the app never navigates while
 * the sheet is open.
 */
export default function ScanOverlayHost() {
  const variant = useScanOverlay();
  const isSw = getLang() === 'sw';

  if (!variant) return null;
  const title = variant === 'sell'
    ? (isSw ? 'Uza kwa scan' : 'Sell by scan')
    : 'Scan barcode';
  const page = variant === 'sell'
    ? <SellPage onExit={closeScan} onShowScan={() => openScan('scan')} />
    : <ScanPage onExit={closeScan} />;

  return createPortal(
    <div
      className="scan-overlay-frame fixed inset-0 z-[250] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div aria-hidden="true" onClick={closeScan} className="absolute inset-0 bg-black/40" />
      <div className="scan-overlay-sheet relative z-10 flex max-h-[85%] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-surface-border bg-role-admin px-2 text-white">
          <button
            type="button"
            aria-label={isSw ? 'Funga' : 'Close'}
            onClick={closeScan}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg transition hover:bg-white/10 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{page}</div>
      </div>
    </div>,
    document.body,
  );
}