import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Barcode, Check, Flashlight, Keyboard, Loader2, Package, RefreshCw, SwitchCamera, X,
} from 'lucide-react';
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
import { beep, listCameras, startScanner, type ScannerHandle } from '@/features/products/scanner';
import { formatBarcode, readBarcode } from '../../../supabase/functions/_shared/barcode';

// Registering the shelf by scanning it.
//
// The camera opens the moment the page does. A shopkeeper who tapped "scan bar
// code" has a packet in their hand already, and every tap between them and a
// working lens is one they have to be told about.
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
    torch: 'Taa',
    switch: 'Badili kamera',
    typeInstead: 'Andika namba kwa mkono',
    scanInstead: 'Tumia kamera',
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
    cancel: 'Ghairi',
    denied: 'Ruhusa ya kamera imekataliwa. Ifungue kwenye settings za browser, kisha ujaribu tena — au andika namba kwa mkono.',
    missing: 'Sikuweza kufungua kamera ya simu hii. Andika namba kwa mkono — iko chini ya mistari.',
    failed: 'Kamera imefunguka lakini scanner haikuanza. Jaribu tena, au andika namba kwa mkono.',
    retry: 'Jaribu tena',
    badCode: 'Namba hii si bar code sahihi. Angalia tena.',
    needName: 'Naomba jina la bidhaa.',
    needPrices: 'Naomba bei ya kununua na bei ya kuuza.',
    notAllowed: 'Ni owner au accountant pekee anayeweza kusajili bidhaa.',
    back: 'Rudi kwenye bidhaa',
    margin: 'Faida kwa kimoja',
  },
  en: {
    title: 'Register by barcode',
    lead: 'Point at the product barcode. When I read it I will ask for the name and prices, once.',
    aim: 'Line the barcode up inside the line',
    starting: 'Opening the camera…',
    torch: 'Light',
    switch: 'Switch camera',
    typeInstead: 'Type the number by hand',
    scanInstead: 'Use the camera',
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
    cancel: 'Cancel',
    denied: 'Camera permission was refused. Allow it in your browser settings and try again — or type the number by hand.',
    missing: 'I could not open this phone’s camera. Type the number by hand — it is under the stripes.',
    failed: 'The camera opened but the scanner did not start. Try again, or type the number.',
    retry: 'Try again',
    badCode: 'That is not a valid barcode. Please check it.',
    needName: 'The product needs a name.',
    needPrices: 'Both the buying price and the selling price are needed.',
    notAllowed: 'Only an owner or accountant can register products.',
    back: 'Back to products',
    margin: 'Margin each',
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

  const [camera, setCamera] = useState<CameraState>('starting');
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraAt, setCameraAt] = useState(0);

  const [code, setCode] = useState<string | null>(null);
  const [known, setKnown] = useState<ProductBarcode | null>(null);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [minQty, setMinQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setTorchOn(false);
  }, []);

  /** A found code stops the camera and asks for the meaning. */
  const found = useCallback(async (rawCode: string) => {
    stop();
    setCode(rawCode);
    setLastSaved(null);
    beep();
    if (navigator.vibrate) navigator.vibrate(60);
    try {
      const already = await findProductByBarcode(rawCode);
      setKnown(already);
      setName(already?.productName ?? '');
    } catch (err) {
      setKnown(null);
      toast.error(friendlyError(err));
    }
  }, [stop, toast]);

  const start = useCallback(async (deviceId?: string) => {
    stop();
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
    // Labels are blank until permission is granted, so the list is only worth
    // reading once the stream is live.
    void listCameras().then(setCameras);
  }, [found, stop]);

  // Open the camera as soon as the page does, and never leave it running: a
  // stream left open holds the lens and the torch, and on a shop phone that is
  // a battery gone by midday.
  useEffect(() => {
    if (!allowed || code !== null || typing) return;
    void start(cameras[cameraAt]?.deviceId);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, code, typing, cameraAt]);

  const reset = () => {
    setCode(null);
    setKnown(null);
    setName(''); setCost(''); setRetail(''); setWholesale(''); setMinQty('');
    setTyped('');
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

  const scanning = code === null && !typing;

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

      {/* The video element stays mounted while scanning so the stream has
          somewhere to go from the first frame. */}
      <div className={scanning ? 'block' : 'hidden'}>
        <Card className="space-y-3 overflow-hidden p-0">
          <div className="relative bg-black">
            <video ref={videoRef} className="h-72 w-full object-cover" playsInline muted />

            {camera === 'live' ? (
              <>
                {/* The window a shopkeeper aims with. */}
                <div className="pointer-events-none absolute inset-x-6 top-1/2 h-28 -translate-y-1/2 rounded-lg border-2 border-white/70" />
                <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500" />
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

            {camera === 'denied' || camera === 'missing' || camera === 'failed' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
                <X className="h-6 w-6 text-amber-400" />
                <p className="text-xs text-white/90">{c[camera]}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => void start(cameras[cameraAt]?.deviceId)}>
                    <RefreshCw className="h-4 w-4" aria-hidden />{c.retry}
                  </Button>
                  <Button onClick={() => { stop(); setTyping(true); }}>
                    <Keyboard className="h-4 w-4" aria-hidden />{c.typeInstead}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex gap-2">
              {handleRef.current?.hasTorch() ? (
                <Button
                  variant={torchOn ? 'primary' : 'secondary'}
                  onClick={() => void handleRef.current?.toggleTorch().then(setTorchOn)}
                >
                  <Flashlight className="h-4 w-4" aria-hidden />{c.torch}
                </Button>
              ) : null}
              {cameras.length > 1 ? (
                <Button
                  variant="secondary"
                  onClick={() => setCameraAt((at) => (at + 1) % cameras.length)}
                >
                  <SwitchCamera className="h-4 w-4" aria-hidden />{c.switch}
                </Button>
              ) : null}
            </div>
            <button
              type="button"
              className="text-xs text-ink-muted underline"
              onClick={() => { stop(); setTyping(true); }}
            >
              {c.typeInstead}
            </button>
          </div>
        </Card>
      </div>

      {typing && code === null ? (
        <Card className="space-y-3 p-4">
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
          <Button className="w-full justify-center" onClick={() => void acceptTyped()}>
            <Keyboard className="mr-2 h-4 w-4" />{c.check}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-ink-muted underline"
            onClick={() => { setTyping(false); setTyped(''); }}
          >
            {c.scanInstead}
          </button>
        </Card>
      ) : null}

      {code !== null ? (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-ink">{formatBarcode(code)}</span>
            <button
              type="button"
              className="text-xs text-ink-muted underline"
              onClick={() => { reset(); setTyping(false); }}
            >
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
                {c.margin}: {formatMoney(Number(retail) - Number(cost))}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 justify-center" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {busy ? c.saving : c.save}
            </Button>
            <Button variant="secondary" onClick={() => { reset(); setTyping(false); }}>
              {c.cancel}
            </Button>
          </div>
        </Card>
      ) : null}

      <Link to="/products" className="block text-center text-xs text-ink-muted underline">
        {c.back}
      </Link>
    </div>
  );
}
