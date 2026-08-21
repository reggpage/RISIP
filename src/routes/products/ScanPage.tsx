import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Barcode, Check, Flashlight, Keyboard, Loader2, RefreshCw, SwitchCamera, X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { formatMoney } from '@/lib/format';
import {
  fetchCurrentProductCost,
  fetchSellingPrice,
  findProductByBarcode,
  saveProductBarcode,
  setProductCost,
  setSellingPrice,
  type ProductBarcode,
} from '@/features/products/products';
import { beep, listCameras, startScanner, type ScannerHandle } from '@/features/products/scanner';
import { formatBarcode, readBarcode } from '../../../supabase/functions/_shared/barcode';

// Registering the shelf by scanning it.
//
// The camera opens with the page and STAYS open between scans. Closing it after
// every code and asking for it again is what made the second scan fail on the
// owner's iPhone until they reloaded the page: iOS refuses a re-open often
// enough that it cannot be relied on, and a camera already running cannot be
// refused at all.
//
// What a scan is worth is a key that cannot be mistyped — "daftari" and
// "daftari kubwa" are two rows a person must keep straight, and 6011040121093
// is the same packet every time. It is not worth a name or a price: there is no
// free database of Tanzanian goods, and inventing one would put names in the
// ledger nobody chose. Camera gives the number, shopkeeper gives the meaning.

const COPY = {
  sw: {
    title: 'Sajili kwa bar code',
    lead: 'Mulika bar code ya bidhaa. Nikiisoma nitakuuliza jina na bei mara moja tu.',
    aim: 'Weka bar code ndani ya mstari',
    starting: 'Nafungua kamera…',
    numberLabel: 'Namba ya bar code',
    numberHelp: 'Namba iliyo chini ya mistari kwenye pakiti.',
    check: 'Tafuta',
    known: 'Bidhaa hii ninaijua tayari',
    knownHelp: 'Bei zilizosajiliwa zipo hapa chini. Ukibadilisha, nitasahihisha.',
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
    cancel: 'Ghairi',
    denied: 'Ruhusa ya kamera imekataliwa. Ifungue kwenye settings za browser, kisha ujaribu tena.',
    missing: 'Sikuweza kufungua kamera ya simu hii.',
    failed: 'Kamera imefunguka lakini scanner haikuanza.',
    retry: 'Jaribu tena',
    typeInstead: 'Andika namba kwa mkono',
    badCode: 'Namba hii si bar code sahihi. Angalia tena.',
    needName: 'Naomba jina la bidhaa.',
    needPrices: 'Naomba bei ya kununua na bei ya kuuza.',
    notAllowed: 'Ni owner au accountant pekee anayeweza kusajili bidhaa.',
    back: 'Rudi kwenye bidhaa',
    margin: 'Faida kwa kimoja',
    loadingPrices: 'Naangalia bei zilizosajiliwa…',
  },
  en: {
    title: 'Register by barcode',
    lead: 'Point at the product barcode. When I read it I will ask for the name and prices, once.',
    aim: 'Line the barcode up inside the box',
    starting: 'Opening the camera…',
    numberLabel: 'Barcode number',
    numberHelp: 'The number printed under the stripes on the packet.',
    check: 'Look up',
    known: 'I already know this product',
    knownHelp: 'Its registered prices are below. Change them and I will correct them.',
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
    cancel: 'Cancel',
    denied: 'Camera permission was refused. Allow it in your browser settings and try again.',
    missing: 'I could not open this phone’s camera.',
    failed: 'The camera opened but the scanner did not start.',
    retry: 'Try again',
    typeInstead: 'Type the number by hand',
    badCode: 'That is not a valid barcode. Please check it.',
    needName: 'The product needs a name.',
    needPrices: 'Both the buying price and the selling price are needed.',
    notAllowed: 'Only an owner or accountant can register products.',
    back: 'Back to products',
    margin: 'Margin each',
    loadingPrices: 'Checking the registered prices…',
  },
} as const;

type CameraState = 'starting' | 'live' | 'denied' | 'missing' | 'failed';

export default function ScanPage() {
  const auth = useAuth();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  const allowed = role === 'owner' || role === 'accountant';
  const lang = getLang() === 'sw' ? 'sw' : 'en';
  const c = COPY[lang];
  const toast = useToast();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handleRef = useRef<ScannerHandle | null>(null);
  const startedRef = useRef(false);

  const [camera, setCamera] = useState<CameraState>('starting');
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraAt, setCameraAt] = useState(0);

  const [code, setCode] = useState<string | null>(null);
  const [known, setKnown] = useState<ProductBarcode | null>(null);
  const [loadingKnown, setLoadingKnown] = useState(false);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [minQty, setMinQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hit, setHit] = useState(false);

  /**
   * A code stops the DECODING, never the camera, and fills in everything the
   * shop already told us about this product.
   */
  const found = useCallback(async (rawCode: string) => {
    setHit(true);
    beep();
    if (navigator.vibrate) navigator.vibrate(60);
    window.setTimeout(() => setHit(false), 900);
    handleRef.current?.pause();
    setCode(rawCode);
    setLastSaved(null);
    setLoadingKnown(true);
    try {
      const already = await findProductByBarcode(rawCode);
      setKnown(already);
      setName(already?.productName ?? '');
      if (already) {
        // The prices are the reason to recognise it at all. Showing the name
        // and leaving the money blank asks somebody to remember what they
        // registered, which is the job this page exists to do for them.
        const [costRow, priceRow] = await Promise.all([
          fetchCurrentProductCost(already.productKey).catch(() => null),
          fetchSellingPrice(already.productKey).catch(() => null),
        ]);
        setCost(costRow ? String(costRow.unitCost) : '');
        setRetail(priceRow ? String(priceRow.retailPrice) : '');
        setWholesale(priceRow?.wholesalePrice != null ? String(priceRow.wholesalePrice) : '');
        setMinQty(priceRow?.wholesaleMinQty != null ? String(priceRow.wholesaleMinQty) : '');
      }
    } catch (err) {
      setKnown(null);
      toast.error(friendlyError(err));
    } finally {
      setLoadingKnown(false);
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
      onCode: (barcode) => void found(barcode.code),
      onError: (why) => setCamera(why),
    });
    if (!handle) return;
    handleRef.current = handle;
    setCamera('live');
    void listCameras().then(setCameras);
  }, [found]);

  // Opened once, for the life of the page. Everything after that is pause and
  // resume — see the note at the top of this file.
  useEffect(() => {
    if (!allowed || startedRef.current) return;
    startedRef.current = true;
    void start();
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [allowed, start]);

  const backToScanning = () => {
    setCode(null);
    setKnown(null);
    setName(''); setCost(''); setRetail(''); setWholesale(''); setMinQty('');
    setTyped('');
    setTyping(false);
    handleRef.current?.resume();
  };

  const switchCamera = () => {
    const next = (cameraAt + 1) % Math.max(1, cameras.length);
    setCameraAt(next);
    void start(cameras[next]?.deviceId);
  };

  const acceptTyped = async () => {
    const parsed = readBarcode(typed);
    if (!parsed) { toast.error(c.badCode); return; }
    await found(parsed.code);
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
      backToScanning();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-4 text-center">
        <p className="text-sm text-ink-muted">{c.notAllowed}</p>
        <Link to="/products">
          <Button variant="secondary" className="w-full justify-center">{c.back}</Button>
        </Link>
      </div>
    );
  }

  const scanning = code === null && !typing;
  const broken = camera === 'denied' || camera === 'missing' || camera === 'failed';

  return (
    <div className="mx-auto max-w-md space-y-5 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Barcode className="h-5 w-5" /> {c.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{c.lead}</p>
      </div>

      {lastSaved ? (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
          <Check className="h-4 w-4 shrink-0" /> {c.saved}: {lastSaved}
        </p>
      ) : null}

      {/* Mounted for the life of the page: the stream has to have somewhere to
          go, and hiding it is cheaper than tearing the camera down. */}
      <div className={scanning ? 'block space-y-3' : 'hidden'}>
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="h-80 w-full object-cover" playsInline muted />

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
                    <Check className="h-6 w-6" />
                  </span>
                </div>
              ) : null}
              <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/80">
                {c.aim}
              </p>
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
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void start(cameras[cameraAt]?.deviceId)}>
                  <RefreshCw className="h-4 w-4" aria-hidden />{c.retry}
                </Button>
                {/* Only here. A working camera needs no keyboard, and offering
                    one next to a live lens is a choice nobody wanted to make. */}
                <Button onClick={() => setTyping(true)}>
                  <Keyboard className="h-4 w-4" aria-hidden />{c.typeInstead}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Icons only, over the picture, where a camera app puts them. */}
          {camera === 'live' ? (
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              {handleRef.current?.hasTorch() ? (
                <button
                  type="button"
                  aria-label={c.title}
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
          ) : null}
        </div>
      </div>

      {typing && code === null ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink" htmlFor="barcode">{c.numberLabel}</label>
          <Input
            id="barcode"
            inputMode="numeric"
            autoComplete="off"
            placeholder="6011040121093"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <p className="text-xs text-ink-muted">{c.numberHelp}</p>
          <div className="flex gap-2">
            <Button className="flex-1 justify-center" onClick={() => void acceptTyped()}>
              {c.check}
            </Button>
            <Button variant="secondary" onClick={() => { setTyping(false); setTyped(''); }}>
              {c.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {code !== null ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-ink">{formatBarcode(code)}</span>
            <button type="button" className="text-xs text-ink-muted" onClick={backToScanning}>
              {c.scanNext}
            </button>
          </div>

          {loadingKnown ? (
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> {c.loadingPrices}
            </p>
          ) : known ? (
            <div>
              <p className="text-sm font-medium text-ink">{c.known}: {known.productName}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{c.knownHelp}</p>
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
                {c.margin}: {formatMoney(Number(retail) - Number(cost))}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 justify-center" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {busy ? c.saving : c.save}
            </Button>
            <Button variant="secondary" onClick={backToScanning}>{c.cancel}</Button>
          </div>
        </div>
      ) : null}

      <Link to="/products" className="block text-center text-xs text-ink-muted">
        {c.back}
      </Link>
    </div>
  );
}
