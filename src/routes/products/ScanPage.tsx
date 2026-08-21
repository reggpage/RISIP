import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Barcode, Check, Loader2 } from 'lucide-react';
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
  recordStockCount,
  saveProductBarcode,
  setProductCost,
  setSellingPrice,
  type ProductBarcode,
} from '@/features/products/products';
import { beep } from '@/features/products/scanner';
import { useScanner } from '@/features/products/useScanner';
import { ScanViewfinder } from '@/features/products/ScanViewfinder';
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
    stock: 'Store (idadi iliyopo)',
    stockHelp: 'Ukiiacha wazi, sitagusa hesabu ya store.',
    save: 'Hifadhi bidhaa',
    edit: 'Badilisha bidhaa',
    saving: 'Inahifadhi…',
    saved: 'Nimehifadhi',
    edited: 'Nimebadilisha',
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
    noPictures: 'Kamera haitoi picha. Jaribu kubadili kamera, au funga na ufungue ukurasa tena.',
    noReads: 'Bado sijaisoma. Sogeza karibu kidogo, washa taa, au ihakikishe bar code iko ndani ya mstari.',
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
    stock: 'Store (how many are there)',
    stockHelp: 'Leave it blank and I will not touch the stock count.',
    save: 'Save product',
    edit: 'Update product',
    saving: 'Saving…',
    saved: 'Saved',
    edited: 'Updated',
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
    noPictures: 'The camera is not delivering pictures. Try switching camera, or close and reopen the page.',
    noReads: 'Not read yet. Move a little closer, turn the light on, or line the barcode up inside the box.',
    loadingPrices: 'Checking the registered prices…',
  },
} as const;

export default function ScanPage() {
  const auth = useAuth();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  const allowed = role === 'owner' || role === 'accountant';
  const lang = getLang() === 'sw' ? 'sw' : 'en';
  const c = COPY[lang];
  const toast = useToast();

  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  const [code, setCode] = useState<string | null>(null);
  const [known, setKnown] = useState<ProductBarcode | null>(null);
  const [loadingKnown, setLoadingKnown] = useState(false);
  // Read when the product was recognised, written back untouched on save.
  const [keptMinQty, setKeptMinQty] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [stock, setStock] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hit, setHit] = useState(false);

  // One camera, opened once. See useScanner for why that has to be enforced
  // somewhere other than an effect dependency list.
  const scanner = useScanner(allowed, (rawCode) => void found(rawCode));

  /**
   * A code stops the DECODING, never the camera, and fills in everything the
   * shop already told us about this product.
   */
  const found = useCallback(async (rawCode: string) => {
    setHit(true);
    beep();
    if (navigator.vibrate) navigator.vibrate(60);
    window.setTimeout(() => setHit(false), 900);
    scanner.pause();
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
        // The count is deliberately NOT prefilled: it is a physical count, and
        // showing yesterday's number invites somebody to confirm it without
        // looking at the shelf.
        setStock('');
        setKeptMinQty(priceRow?.wholesaleMinQty ?? null);
      }
    } catch (err) {
      setKnown(null);
      toast.error(friendlyError(err));
    } finally {
      setLoadingKnown(false);
    }
  }, [toast]);

  const backToScanning = () => {
    setCode(null);
    setKnown(null);
    setName(''); setCost(''); setRetail(''); setWholesale(''); setStock('');
    setKeptMinQty(null);
    setTyped('');
    setTyping(false);
    scanner.resume();
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
    const counted = stock.trim() === '' ? null : Number(stock);
    // A product with a name and no prices is a name: the next sale of it fails
    // in exactly the way that sent them here.
    if (!(buying > 0) || !(selling > 0)) { toast.error(c.needPrices); return; }
    setBusy(true);
    try {
      await setProductCost(productName, buying, null, 'barcode scan');
      // The wholesale threshold keeps whatever it already had: this form no
      // longer asks for it, and passing null would quietly wipe it.
      await setSellingPrice(productName, selling, bulk && bulk > 0 ? bulk : null, keptMinQty);
      await saveProductBarcode(code!, productName);
      if (counted !== null && counted >= 0) {
        await recordStockCount(productName, counted, null, 'barcode scan');
      }
      setLastSaved(productName);
      toast.success(`${known ? c.edited : c.saved}: ${productName}`);
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
      <div className={scanning ? 'block' : 'hidden'}>
        <ScanViewfinder
          controls={scanner}
          copy={c}
          hit={hit}
          height="h-80"
          onType={() => setTyping(true)}
        />
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
                <label className="block text-sm font-medium text-ink" htmlFor="stock">{c.stock}</label>
                <NumberInput id="stock" value={stock} onChange={setStock} />
              </div>
            </div>
            <p className="text-xs text-ink-muted">{c.stockHelp}</p>
            {Number(cost) > 0 && Number(retail) > 0 ? (
              <p className="text-xs text-ink-muted">
                {c.margin}: {formatMoney(Number(retail) - Number(cost))}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 justify-center" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {busy ? c.saving : known ? c.edit : c.save}
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
