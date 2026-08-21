import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, Flashlight, Loader2, Minus, Plus, ScanLine, SwitchCamera, Trash2, X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { formatMoney } from '@/lib/format';
import {
  bandForQuantity,
  basketTotal,
  fetchSellingPrice,
  findProductByBarcode,
  lineTotal,
  lineUnitPrice,
  recordCounterSale,
  type CounterLine,
} from '@/features/products/products';
import { beep, listCameras, startScanner, type ScannerHandle } from '@/features/products/scanner';

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
    back: 'Rudi kwenye bidhaa',
  },
  en: {
    title: 'Sell by scanning',
    lead: 'Scan the barcode of everything they are buying. When you are done, tap “Finish sale”.',
    aim: 'Point at the barcode',
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
    back: 'Back to products',
  },
} as const;

type CameraState = 'starting' | 'live' | 'denied' | 'missing' | 'failed';

export default function SellPage() {
  const auth = useAuth();
  const lang = getLang() === 'sw' ? 'sw' : 'en';
  const c = COPY[lang];
  const toast = useToast();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handleRef = useRef<ScannerHandle | null>(null);
  const startedRef = useRef(false);
  // The basket is read inside the scan callback, which is created once. A ref
  // keeps that callback looking at the current basket rather than the empty one
  // it closed over.
  const linesRef = useRef<CounterLine[]>([]);

  const [camera, setCamera] = useState<CameraState>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraAt, setCameraAt] = useState(0);
  const [lines, setLines] = useState<CounterLine[]>([]);
  const [problem, setProblem] = useState<{ kind: 'unknown' | 'no_price'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState(false);

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
    const already = linesRef.current.find((line) => line.barcode === barcode);
    if (already) {
      const quantity = already.quantity + 1;
      apply(linesRef.current.map((line) => (line.barcode === barcode
        ? { ...line, quantity, band: bandForQuantity(quantity, line.wholesale, line.wholesaleMinQty) }
        : line)));
      setProblem(null);
      return;
    }
    try {
      const product = await findProductByBarcode(barcode);
      if (!product) {
        setProblem({ kind: 'unknown', text: barcode });
        return;
      }
      const price = await fetchSellingPrice(product.productKey);
      if (!price) {
        setProblem({ kind: 'no_price', text: product.productName });
        return;
      }
      setProblem(null);
      apply([...linesRef.current, {
        productKey: product.productKey,
        productName: product.productName,
        barcode,
        quantity: 1,
        retail: price.retailPrice,
        wholesale: price.wholesalePrice,
        wholesaleMinQty: price.wholesaleMinQty,
        band: bandForQuantity(1, price.wholesalePrice, price.wholesaleMinQty),
      }]);
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }, [toast]);

  const start = useCallback(async (deviceId?: string) => {
    handleRef.current?.stop();
    handleRef.current = null;
    setTorchOn(false);
    setCamera('starting');
    const video = videoRef.current;
    if (!video) return;
    const handle = await startScanner({
      video,
      deviceId,
      onCode: (found) => void scanned(found.code),
      onError: (why) => setCamera(why),
    });
    if (!handle) return;
    handleRef.current = handle;
    setCamera('live');
    void listCameras().then(setCameras);
  }, [scanned]);

  useEffect(() => {
    if (auth.status !== 'signed-in' || startedRef.current) return;
    startedRef.current = true;
    void start();
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [auth.status, start]);

  const setQuantity = (barcode: string, quantity: number) => {
    if (quantity <= 0) {
      apply(linesRef.current.filter((line) => line.barcode !== barcode));
      return;
    }
    apply(linesRef.current.map((line) => (line.barcode === barcode
      ? { ...line, quantity, band: bandForQuantity(quantity, line.wholesale, line.wholesaleMinQty) }
      : line)));
  };

  const toggleBand = (barcode: string) => {
    apply(linesRef.current.map((line) => (line.barcode === barcode && line.wholesale !== null
      ? { ...line, band: line.band === 'retail' ? 'wholesale' : 'retail' }
      : line)));
  };

  const finish = async () => {
    if (lines.length === 0) return;
    setBusy(true);
    try {
      const result = await recordCounterSale(lines);
      toast.success(result.confirmed ? c.saved : c.pending);
      apply([]);
      setProblem(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const switchCamera = () => {
    const next = (cameraAt + 1) % Math.max(1, cameras.length);
    setCameraAt(next);
    void start(cameras[next]?.deviceId);
  };

  const broken = camera === 'denied' || camera === 'missing' || camera === 'failed';
  const total = basketTotal(lines);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-32">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <ScanLine className="h-5 w-5" /> {c.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{c.lead}</p>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-52 w-full object-cover" playsInline muted />
        {camera === 'live' ? (
          <>
            <div
              className={`pointer-events-none absolute inset-x-2 top-1/2 h-[45%] -translate-y-1/2 rounded-lg border-2 transition-colors ${
                hit ? 'border-emerald-400' : 'border-white/70'
              }`}
            />
            <div
              className={`pointer-events-none absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 transition-colors ${
                hit ? 'bg-emerald-400' : 'animate-pulse bg-red-500'
              }`}
            />
            {hit ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-emerald-500 p-2 text-white shadow-lg">
                  <Check className="h-5 w-5" />
                </span>
              </div>
            ) : null}
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80">
              {c.aim}
            </p>
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              {handleRef.current?.hasTorch() ? (
                <button
                  type="button"
                  aria-label="torch"
                  onClick={() => void handleRef.current?.toggleTorch().then(setTorchOn)}
                  className={`rounded-full p-2.5 shadow-lg transition-colors ${
                    torchOn ? 'bg-amber-400 text-black' : 'bg-black/50 text-white'
                  }`}
                >
                  <Flashlight className="h-5 w-5" />
                </button>
              ) : null}
              {cameras.length > 1 ? (
                <button
                  type="button"
                  aria-label="camera"
                  onClick={switchCamera}
                  className="rounded-full bg-black/50 p-2.5 text-white shadow-lg"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {camera === 'starting' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">{c.starting}</span>
          </div>
        ) : null}

        {broken ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
            <X className="h-6 w-6 text-amber-400" />
            <p className="text-xs text-white/90">{c[camera]}</p>
            <Button variant="secondary" onClick={() => void start(cameras[cameraAt]?.deviceId)}>
              {c.retry}
            </Button>
          </div>
        ) : null}
      </div>

      {problem ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {problem.kind === 'unknown' ? (
            <>
              <p className="font-medium">{c.unknown}</p>
              <p className="mt-0.5 font-mono text-xs">{problem.text}</p>
              <p className="mt-1 text-xs">{c.unknownHelp}</p>
              <Link to="/scan" className="mt-2 inline-block">
                <Button variant="secondary">{c.register}</Button>
              </Link>
            </>
          ) : (
            <>
              <p className="font-medium">{problem.text} — {c.noPrice}</p>
              <p className="mt-1 text-xs">{c.noPriceHelp}</p>
            </>
          )}
        </div>
      ) : null}

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{c.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.barcode} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{line.productName}</p>
                <button
                  type="button"
                  onClick={() => toggleBand(line.barcode)}
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
                  onClick={() => setQuantity(line.barcode, line.quantity - 1)}
                >
                  {line.quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                </button>
                <span className="w-6 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                <button
                  type="button"
                  aria-label="more"
                  className="rounded-full bg-surface-muted p-1.5"
                  onClick={() => setQuantity(line.barcode, line.quantity + 1)}
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
