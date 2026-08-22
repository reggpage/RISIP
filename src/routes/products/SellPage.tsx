import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, Minus, Plus, ScanLine, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { formatMoney } from '@/lib/format';
import {
  bandForQuantity,
  basketTotal,
  fetchBarcodeCatalogue,
  fetchSellingPrice,
  findProductByBarcode,
  lineTotal,
  lineUnitPrice,
  recordCounterSale,
  type CounterLine,
  type ScannedProduct,
} from '@/features/products/products';
import { useCompany } from '@/features/company/useCompany';
import { SaleDone } from '@/features/products/SaleDone';
import { beep } from '@/features/products/scanner';
import { useScanner } from '@/features/products/useScanner';
import { ScanViewfinder } from '@/features/products/ScanViewfinder';

// The till.
//
// Scanning to SELL is a different job from scanning to register, and the
// difference is the customer standing there. The camera never stops, a scan
// adds a line and goes straight back to looking, and the same packet scanned
// twice is two of them — which is what a shopkeeper means by scanning it twice.
//
// Nothing is asked that can be shown instead. Where a product has a wholesale
// price and the quantity reaches the shop's own threshold, the line takes it
// and SAYS so; one tap puts it back. A question per line at a counter is not a
// till, it is an interrogation.

const COPY = {
  sw: {
    title: 'Uza kwa scan',
    lead: 'Mulika bar code ya kila kitu anachonunua. Ukimaliza, gonga "Maliza mauzo".',
    aim: 'Mulika bar code',
    zoom: 'Kuza kamera',
    starting: 'Nafungua kamera…',
    empty: 'Bado hujascan kitu.',
    total: 'Jumla',
    items: 'vitu',
    finish: 'Maliza mauzo',
    saving: 'Inahifadhi…',
    clear: 'Futa zote',
    retail: 'rejareja',
    wholesale: 'jumla',
    saved: 'Mauzo yamehifadhiwa',
    pending: 'Mauzo yamehifadhiwa, yanasubiri owner au accountant athibitishe.',
    unknown: 'Bar code hii haijasajiliwa',
    unknownHelp: 'Isajili kwanza ili niweze kuiuza.',
    register: 'Sajili bidhaa',
    noPrice: 'haina bei ya kuuza',
    noPriceHelp: 'Weka bei yake kwenye bidhaa, kisha uze tena.',
    denied: 'Ruhusa ya kamera imekataliwa. Ifungue kwenye settings za browser.',
    missing: 'Sikuweza kufungua kamera ya simu hii.',
    failed: 'Kamera imefunguka lakini scanner haikuanza.',
    retry: 'Jaribu tena',
    noPictures: 'Kamera haitoi picha. Jaribu kubadili kamera, au funga na ufungue ukurasa tena.',
    noReads: 'Bado sijaisoma. Sogeza karibu kidogo, washa taa, au ihakikishe bar code iko ndani ya mstari.',
    back: 'Rudi kwenye bidhaa',
  },
  en: {
    title: 'Sell by scanning',
    lead: 'Scan the barcode of everything they are buying. When you are done, tap “Finish sale”.',
    aim: 'Point at the barcode',
    zoom: 'Camera zoom',
    starting: 'Opening the camera…',
    empty: 'Nothing scanned yet.',
    total: 'Total',
    items: 'items',
    finish: 'Finish sale',
    saving: 'Saving…',
    clear: 'Clear all',
    retail: 'retail',
    wholesale: 'wholesale',
    saved: 'Sale saved',
    pending: 'Sale saved, waiting for an owner or accountant to confirm.',
    unknown: 'This barcode is not registered',
    unknownHelp: 'Register it first and I can sell it.',
    register: 'Register product',
    noPrice: 'has no selling price',
    noPriceHelp: 'Set its price under products, then sell it again.',
    denied: 'Camera permission was refused. Allow it in your browser settings.',
    missing: 'I could not open this phone’s camera.',
    failed: 'The camera opened but the scanner did not start.',
    retry: 'Try again',
    noPictures: 'The camera is not delivering pictures. Try switching camera, or close and reopen the page.',
    noReads: 'Not read yet. Move a little closer, turn the light on, or line the barcode up inside the box.',
    back: 'Back to products',
  },
} as const;

export default function SellPage() {
  const auth = useAuth();
  const lang = getLang() === 'sw' ? 'sw' : 'en';
  const c = COPY[lang];
  const toast = useToast();

  // The basket is read inside the scan callback, which is created once. A ref
  // keeps that callback looking at the current basket rather than the empty one
  // it closed over.
  const linesRef = useRef<CounterLine[]>([]);

  // The whole barcode table, in memory before the first customer. Looking each
  // scan up over the network put the line on screen a beat after the beep, and
  // at a counter that beat is the difference between a till and a form.
  const catalogueRef = useRef<Map<string, ScannedProduct>>(new Map());
  const company = useCompany();

  const [lines, setLines] = useState<CounterLine[]>([]);
  const [problem, setProblem] = useState<{ kind: 'unknown' | 'no_price'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [done, setDone] = useState<{ lines: CounterLine[]; confirmed: boolean } | null>(null);

  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    void fetchBarcodeCatalogue()
      .then((catalogue) => { catalogueRef.current = catalogue; })
      .catch(() => { /* a slow load only means the first scan waits */ });
  }, [auth.status]);

  const apply = (next: CounterLine[]) => {
    linesRef.current = next;
    setLines(next);
  };

  const flash = () => {
    setHit(true);
    beep();
    if (navigator.vibrate) navigator.vibrate(50);
    window.setTimeout(() => setHit(false), 500);
  };

  /** A scan adds one, or adds one more. The camera never stops. */
  const scanned = useCallback(async (barcode: string) => {
    flash();
    // By PRODUCT, not by barcode. A book carries its ISBN and often a second
    // code for the same book, and the owner's till showed "Eat that frog"
    // twice, three each, as though they were different things.
    const add = (product: ScannedProduct) => {
      setProblem(null);
      const already = linesRef.current.find((line) => line.productKey === product.productKey);
      if (already) {
        const quantity = already.quantity + 1;
        apply(linesRef.current.map((line) => (line.productKey === product.productKey
          ? { ...line, quantity, band: bandForQuantity(quantity, line.wholesale, line.wholesaleMinQty) }
          : line)));
        return;
      }
      apply([...linesRef.current, {
        productKey: product.productKey,
        productName: product.productName,
        barcode: product.barcode,
        quantity: 1,
        retail: product.retail,
        wholesale: product.wholesale,
        wholesaleMinQty: product.wholesaleMinQty,
        band: bandForQuantity(1, product.wholesale, product.wholesaleMinQty),
      }]);
    };

    const known = catalogueRef.current.get(barcode);
    if (known) { add(known); return; }

    // Not in the table we loaded: either the shop registered it since this page
    // opened, or it is genuinely unknown. Worth one round trip to find out.
    try {
      const product = await findProductByBarcode(barcode);
      if (!product) { setProblem({ kind: 'unknown', text: barcode }); return; }
      const price = await fetchSellingPrice(product.productKey);
      if (!price) { setProblem({ kind: 'no_price', text: product.productName }); return; }
      const resolved: ScannedProduct = {
        barcode,
        productKey: product.productKey,
        productName: product.productName,
        retail: price.retailPrice,
        wholesale: price.wholesalePrice,
        wholesaleMinQty: price.wholesaleMinQty,
      };
      catalogueRef.current.set(barcode, resolved);
      add(resolved);
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }, [toast]);

  // One camera, opened once — see useScanner.
  const scanner = useScanner(auth.status === 'signed-in', (code) => void scanned(code));

  const setQuantity = (productKey: string, quantity: number) => {
    if (!(quantity > 0)) {
      apply(linesRef.current.filter((line) => line.productKey !== productKey));
      return;
    }
    apply(linesRef.current.map((line) => (line.productKey === productKey
      ? { ...line, quantity, band: bandForQuantity(quantity, line.wholesale, line.wholesaleMinQty) }
      : line)));
  };

  const toggleBand = (productKey: string) => {
    apply(linesRef.current.map((line) => (line.productKey === productKey && line.wholesale !== null
      ? { ...line, band: line.band === 'retail' ? 'wholesale' : 'retail' }
      : line)));
  };

  const finish = async () => {
    if (lines.length === 0) return;
    setBusy(true);
    try {
      const result = await recordCounterSale(lines);
      // Nothing may be scanned into the next sale while this one is on screen.
      scanner.pause();
      setDone({ lines, confirmed: result.confirmed });
      apply([]);
      setProblem(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const total = basketTotal(lines);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-32">
      {done ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-surface pt-10">
          <SaleDone
            lines={done.lines}
            confirmed={done.confirmed}
            businessName={company?.name ?? 'Risip'}
            logoUrl={company?.logo_url ?? null}
            lang={lang}
            onNext={() => { setDone(null); scanner.resume(); }}
          />
        </div>
      ) : null}

      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <ScanLine className="h-5 w-5" /> {c.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{c.lead}</p>
      </div>

      <ScanViewfinder controls={scanner} copy={c} hit={hit} height="h-52" />

      {problem ? (
        <div className="flex items-start gap-3 py-1">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#FFCE1B]" aria-hidden />
          <div className="min-w-0 flex-1">
            {problem.kind === 'unknown' ? (
              <>
                <p className="text-sm font-medium text-ink">{c.unknown}</p>
                <p className="mt-0.5 font-mono text-xs text-ink-muted">{problem.text}</p>
                <Link to="/scan" className="mt-2 inline-block">
                  <Button variant="secondary">{c.register}</Button>
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-ink">{problem.text} — {c.noPrice}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{c.noPriceHelp}</p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{c.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.productKey} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{line.productName}</p>
                <button
                  type="button"
                  onClick={() => toggleBand(line.productKey)}
                  disabled={line.wholesale === null}
                  className="mt-0.5 text-xs text-ink-muted disabled:opacity-100"
                >
                  {formatMoney(lineUnitPrice(line))}
                  {line.wholesale !== null ? (
                    <span className={line.band === 'wholesale' ? 'ml-1 text-role-accountant' : 'ml-1'}>
                      · {line.band === 'wholesale' ? c.wholesale : c.retail}
                    </span>
                  ) : null}
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="less"
                  className="rounded-full bg-surface-muted p-1.5"
                  onClick={() => setQuantity(line.productKey, line.quantity - 1)}
                >
                  {line.quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                </button>
                {/* Twelve of something is two taps to type and eleven to tap. */}
                {editing === line.productKey ? (
                  <input
                    autoFocus
                    inputMode="numeric"
                    className="w-12 rounded-md border border-border bg-surface px-1 py-0.5 text-center text-sm tabular-nums"
                    defaultValue={String(line.quantity)}
                    onBlur={(event) => {
                      const typed = Number(event.target.value.replace(/[^0-9.]/g, ''));
                      setEditing(null);
                      if (Number.isFinite(typed)) setQuantity(line.productKey, typed);
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  />
                ) : (
                  <button
                    type="button"
                    className="w-8 rounded-md py-0.5 text-center text-sm font-medium tabular-nums text-ink underline decoration-dotted underline-offset-4"
                    onClick={() => setEditing(line.productKey)}
                  >
                    {line.quantity}
                  </button>
                )}
                <button
                  type="button"
                  aria-label="more"
                  className="rounded-full bg-surface-muted p-1.5"
                  onClick={() => setQuantity(line.productKey, line.quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <span className="w-24 text-right text-sm font-semibold tabular-nums text-ink">
                {formatMoney(lineTotal(line))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link to="/products" className="block text-center text-xs text-ink-muted">{c.back}</Link>

      {/* The total and the way to finish stay under the thumb, over everything
          else: a counter is not a place to scroll. */}
      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface p-3 shadow-lg">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-ink-muted">{count} {c.items}</p>
              <p className="text-xl font-semibold tabular-nums text-ink">{formatMoney(total)}</p>
            </div>
            <Button variant="secondary" onClick={() => apply([])}>{c.clear}</Button>
            <Button disabled={busy} onClick={() => void finish()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {busy ? c.saving : c.finish}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
