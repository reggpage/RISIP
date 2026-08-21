import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Barcode, Camera, CameraOff, Check, Keyboard, Loader2, Package } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { formatMoney } from '@/lib/format';
import {
  findProductByBarcode,
  saveProductBarcode,
  setProductCost,
  setSellingPrice,
  type ProductBarcode,
} from '@/features/products/products';
import { formatBarcode, readBarcode } from '../../../supabase/functions/_shared/barcode';

// Registering the shelf by scanning it.
//
// The one thing a scan is worth is a key that cannot be mistyped — "daftari"
// and "daftari kubwa" are two rows a person has to keep straight, and
// 6011040121093 is the same packet every time. It is not worth a name or a
// price: there is no free database of Tanzanian goods, and inventing one would
// put names in the ledger nobody chose. So the camera gives the number and the
// shopkeeper gives the meaning, once.
//
// The camera is native BarcodeDetector where the browser has it — Android
// Chrome, which is what these shops hold — and every phone that does not gets
// the same page with the number typed in instead. Typing is not a degraded
// mode here: the number is printed under the stripes, and a shop with a broken
// camera lens must still be able to finish the job.

const COPY = {
  sw: {
    title: 'Sajili kwa bar code',
    lead: 'Piga scan bar code ya bidhaa, kisha niambie jina na bei. Nitakumbuka namba hiyo milele.',
    start: 'Washa kamera',
    stop: 'Zima kamera',
    typeInstead: 'Andika namba badala yake',
    scanInstead: 'Rudi kwenye kamera',
    numberLabel: 'Namba ya bar code',
    numberHelp: 'Namba iliyo chini ya mistari kwenye pakiti.',
    check: 'Tafuta',
    known: 'Bidhaa hii ninaijua tayari',
    knownHelp: 'Ukibadilisha jina hapa chini, nitalisahihisha.',
    fresh: 'Bidhaa mpya',
    name: 'Jina la bidhaa',
    namePlaceholder: 'mfano: Sukari kilo 1',
    cost: 'Bei ya kununua',
    retail: 'Bei ya kuuza (rejareja)',
    wholesale: 'Bei ya jumla (si lazima)',
    minQty: 'Jumla kuanzia idadi',
    save: 'Hifadhi bidhaa',
    saving: 'Inahifadhi…',
    saved: 'Nimehifadhi',
    scanNext: 'Scan nyingine',
    noCamera: 'Simu hii haiwezi ku-scan kwenye browser. Andika namba kwa mkono — iko chini ya mistari.',
    denied: 'Ruhusa ya kamera imekataliwa. Ifungue kwenye settings za browser, au andika namba kwa mkono.',
    badCode: 'Namba hii si bar code sahihi. Angalia tena.',
    needName: 'Naomba jina la bidhaa.',
    needPrices: 'Naomba bei ya kununua na bei ya kuuza.',
    notAllowed: 'Ni owner au accountant pekee anayeweza kusajili bidhaa.',
    back: 'Rudi kwenye bidhaa',
    aim: 'Elekeza kamera kwenye bar code',
  },
  en: {
    title: 'Register by barcode',
    lead: 'Scan the product barcode, then tell me the name and prices. I will remember that number for good.',
    start: 'Start camera',
    stop: 'Stop camera',
    typeInstead: 'Type the number instead',
    scanInstead: 'Back to the camera',
    numberLabel: 'Barcode number',
    numberHelp: 'The number printed under the stripes on the packet.',
    check: 'Look up',
    known: 'I already know this product',
    knownHelp: 'Change the name below and I will correct it.',
    fresh: 'New product',
    name: 'Product name',
    namePlaceholder: 'e.g. Sugar 1kg',
    cost: 'Buying price',
    retail: 'Selling price (retail)',
    wholesale: 'Wholesale price (optional)',
    minQty: 'Wholesale from quantity',
    save: 'Save product',
    saving: 'Saving…',
    saved: 'Saved',
    scanNext: 'Scan another',
    noCamera: 'This browser cannot scan. Type the number by hand — it is under the stripes.',
    denied: 'Camera permission was refused. Allow it in your browser settings, or type the number.',
    badCode: 'That is not a valid barcode. Please check it.',
    needName: 'The product needs a name.',
    needPrices: 'Both the buying price and the selling price are needed.',
    notAllowed: 'Only an owner or accountant can register products.',
    back: 'Back to products',
    aim: 'Point the camera at the barcode',
  },
} as const;

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'];

function detectorAvailable(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

export default function ScanPage() {
  const auth = useAuth();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  const allowed = role === 'owner' || role === 'accountant';
  const lang = getLang() === 'sw' ? 'sw' : 'en';
  const c = COPY[lang];
  const toast = useToast();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(!detectorAvailable());
  const [cameraError, setCameraError] = useState('');
  const [typed, setTyped] = useState('');

  const [code, setCode] = useState<string | null>(null);
  const [known, setKnown] = useState<ProductBarcode | null>(null);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [minQty, setMinQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (loopRef.current !== null) { window.clearInterval(loopRef.current); loopRef.current = null; }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  // The camera must not outlive the page. A stream left running keeps the torch
  // and the lens busy, and on a shop phone that is a battery gone by midday.
  useEffect(() => stopCamera, [stopCamera]);

  const accept = useCallback(async (raw: string) => {
    const found = readBarcode(raw);
    if (!found) { toast.error(c.badCode); return; }
    stopCamera();
    setCode(found.code);
    setLastSaved(null);
    if (navigator.vibrate) navigator.vibrate(60);
    try {
      const already = await findProductByBarcode(found.code);
      setKnown(already);
      setName(already?.productName ?? '');
    } catch (err) {
      setKnown(null);
      toast.error(friendlyError(err));
    }
  }, [c.badCode, stopCamera, toast]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    if (!detectorAvailable()) { setManual(true); setCameraError(c.noCamera); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const BarcodeDetectorCtor = (window as unknown as {
        BarcodeDetector: new (options: { formats: string[] }) => Detector;
      }).BarcodeDetector;
      const detector = new BarcodeDetectorCtor({ formats: FORMATS });
      setScanning(true);
      loopRef.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          const first = codes[0]?.rawValue;
          if (first) await accept(first);
        } catch {
          // A frame that cannot be read is not an error worth showing; the next
          // one is 300ms away.
        }
      }, 300);
    } catch (err) {
      stopCamera();
      setManual(true);
      setCameraError((err as Error)?.name === 'NotAllowedError' ? c.denied : c.noCamera);
    }
  }, [accept, c.denied, c.noCamera, stopCamera]);

  const reset = () => {
    setCode(null);
    setKnown(null);
    setName(''); setCost(''); setRetail(''); setWholesale(''); setMinQty('');
    setTyped('');
  };

  const save = async () => {
    const productName = name.trim();
    if (!productName) { toast.error(c.needName); return; }
    const buying = Number(cost);
    const selling = Number(retail);
    const bulk = wholesale.trim() === '' ? null : Number(wholesale);
    const from = minQty.trim() === '' ? null : Number(minQty);
    // A product with a name and no prices is a name: the next sale of it fails
    // in exactly the way that sent them here.
    if (!(buying > 0) || !(selling > 0)) { toast.error(c.needPrices); return; }
    setBusy(true);
    try {
      await setProductCost(productName, buying, null, 'barcode scan');
      await setSellingPrice(productName, selling, bulk && bulk > 0 ? bulk : null, from && from > 0 ? from : null);
      await saveProductBarcode(code!, productName);
      setLastSaved(productName);
      toast.success(`${c.saved}: ${productName}`);
      reset();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md p-4">
        <Card className="p-6 text-center">
          <Package className="mx-auto h-8 w-8 text-ink-muted" />
          <p className="mt-3 text-sm text-ink-muted">{c.notAllowed}</p>
          <Link to="/products" className="mt-4 block">
            <Button variant="secondary" className="w-full justify-center">{c.back}</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Barcode className="h-5 w-5" /> {c.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{c.lead}</p>
      </div>

      {lastSaved ? (
        <Card className="flex items-center gap-2 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <Check className="h-4 w-4 shrink-0" /> {c.saved}: <strong>{lastSaved}</strong>
        </Card>
      ) : null}

      {code === null ? (
        <Card className="space-y-3 p-4">
          {!manual ? (
            <>
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video
                  ref={videoRef}
                  className="h-56 w-full object-cover"
                  playsInline
                  muted
                />
                {!scanning ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
                    {c.aim}
                  </div>
                ) : (
                  <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
                )}
              </div>
              {scanning ? (
                <Button variant="secondary" className="w-full justify-center" onClick={stopCamera}>
                  <CameraOff className="mr-2 h-4 w-4" /> {c.stop}
                </Button>
              ) : (
                <Button className="w-full justify-center" onClick={() => void startCamera()}>
                  <Camera className="mr-2 h-4 w-4" /> {c.start}
                </Button>
              )}
              <button
                type="button"
                className="w-full text-center text-xs text-ink-muted underline"
                onClick={() => { stopCamera(); setManual(true); }}
              >
                {c.typeInstead}
              </button>
            </>
          ) : (
            <>
              {cameraError ? <p className="text-xs text-amber-700">{cameraError}</p> : null}
              <label className="block text-sm font-medium text-ink" htmlFor="barcode">
                {c.numberLabel}
              </label>
              <Input
                id="barcode"
                inputMode="numeric"
                autoComplete="off"
                placeholder="6011040121093"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
              <p className="text-xs text-ink-muted">{c.numberHelp}</p>
              <Button className="w-full justify-center" onClick={() => void accept(typed)}>
                <Keyboard className="mr-2 h-4 w-4" /> {c.check}
              </Button>
              {detectorAvailable() ? (
                <button
                  type="button"
                  className="w-full text-center text-xs text-ink-muted underline"
                  onClick={() => { setManual(false); setCameraError(''); }}
                >
                  {c.scanInstead}
                </button>
              ) : null}
            </>
          )}
        </Card>
      ) : (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-ink">{formatBarcode(code)}</span>
            <button type="button" className="text-xs text-ink-muted underline" onClick={reset}>
              {c.scanNext}
            </button>
          </div>

          {known ? (
            <div className="rounded-lg bg-surface-muted p-3 text-sm">
              <p className="font-medium text-ink">{c.known}: {known.productName}</p>
              <p className="mt-1 text-xs text-ink-muted">{c.knownHelp}</p>
            </div>
          ) : (
            <p className="text-sm font-medium text-ink">{c.fresh}</p>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-ink" htmlFor="name">{c.name}</label>
              <Input
                id="name"
                value={name}
                placeholder={c.namePlaceholder}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink" htmlFor="cost">{c.cost}</label>
                <NumberInput id="cost" value={cost} onChange={setCost} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink" htmlFor="retail">{c.retail}</label>
                <NumberInput id="retail" value={retail} onChange={setRetail} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink" htmlFor="wholesale">{c.wholesale}</label>
                <NumberInput id="wholesale" value={wholesale} onChange={setWholesale} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink" htmlFor="minQty">{c.minQty}</label>
                <NumberInput id="minQty" value={minQty} onChange={setMinQty} />
              </div>
            </div>
            {Number(cost) > 0 && Number(retail) > 0 ? (
              <p className="text-xs text-ink-muted">
                {lang === 'sw' ? 'Faida kwa kimoja' : 'Margin each'}:{' '}
                {formatMoney(Number(retail) - Number(cost))}
              </p>
            ) : null}
          </div>

          <Button className="w-full justify-center" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? c.saving : c.save}
          </Button>
        </Card>
      )}

      <Link to="/products" className="block text-center text-xs text-ink-muted underline">
        {c.back}
      </Link>
    </div>
  );
}
