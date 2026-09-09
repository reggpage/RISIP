import { useEffect, useRef, useState } from 'react';
import { X, ArrowUp, Trash2 } from 'lucide-react';
import { startScanner, type ScannerHandle } from '@/features/products/scanner';
import { findProductByBarcode, fetchSellingPrice, type ProductBarcode } from '@/features/products/products';
import { basketSentence, type BasketLine } from '@/features/chat/chat';
import { formatMoney } from '@/lib/format';
import { sw } from '@/i18n/sw';

/**
 * Scan several products, then send them as one sale.
 *
 * The shopkeeper is at the counter with a customer's basket, so scanning one
 * item and sending it, then reopening the camera for the next, is the wrong
 * shape: the camera stays open and each code joins a list. A product with a
 * wholesale price as well as a retail one is asked about before it joins,
 * with both prices shown, because that choice is the shopkeeper's and it
 * decides what the sale is worth.
 */

type Pending = { product: ProductBarcode; retail: number; wholesale: number; wholesaleFrom: number | null };

export default function ScanToSell({ close, send }: { close: () => void; send: (text: string) => void }) {
  const c = sw.chat;
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), scanner = useRef<ScannerHandle | null>(null);
  const alive = useRef(true), looking = useRef(false);
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState(''), [error, setError] = useState(''), [note, setNote] = useState('');
  const [loading, setLoading] = useState(false), [found, setFound] = useState(false);

  /** One line per product; scanning the same code again just counts one more. */
  function addLine(product: ProductBarcode, price: number | null) {
    setLines((current) => {
      const at = current.findIndex((line) => line.productKey === product.productKey && line.price === price);
      if (at === -1) return [...current, { productKey: product.productKey, name: product.productName, quantity: 1, price }];
      setNote(c.alreadyScanned);
      return current.map((line, index) => (index === at ? { ...line, quantity: line.quantity + 1 } : line));
    });
  }

  async function lookup(barcode: string) {
    if (looking.current) return;
    looking.current = true; setLoading(true); setError(''); setNote('');
    scanner.current?.pause();
    try {
      const product = await findProductByBarcode(barcode);
      if (!alive.current) return;
      if (!product) { setError(c.missingProduct); scanner.current?.resume(); return; }
      setFound(true);
      setCode('');
      const price = await fetchSellingPrice(product.productKey).catch(() => null);
      if (!alive.current) return;
      const wholesale = price?.wholesalePrice ?? null;
      // Two prices is a question only the shopkeeper can answer, so the camera
      // waits rather than guessing which one this sale used.
      if (price && wholesale !== null && wholesale !== price.retailPrice) {
        setPending({ product, retail: price.retailPrice, wholesale, wholesaleFrom: price.wholesaleMinQty });
        return;
      }
      addLine(product, null);
      scanner.current?.resume();
    } catch {
      if (alive.current) { setError(c.loadError); scanner.current?.resume(); }
    } finally {
      looking.current = false;
      if (alive.current) setLoading(false);
    }
  }

  function choosePrice(price: number) {
    if (!pending) return;
    addLine(pending.product, price);
    setPending(null);
    scanner.current?.resume();
  }

  // The green line is a confirmation, not a state; it fades back to red so the
  // next scan reads as a new one.
  useEffect(() => {
    if (!found) return;
    const timer = setTimeout(() => setFound(false), 1100);
    return () => clearTimeout(timer);
  }, [found, lines]);

  useEffect(() => {
    let cancelled = false;
    alive.current = true; dialog.current?.showModal();
    // StrictMode replays mount effects. Let its cleanup run before opening a
    // camera, otherwise the discarded handle can stop the second one's video.
    void Promise.resolve().then(() => cancelled ? null : startScanner({ video: video.current!, onCode: (hit) => { if (!cancelled) void lookup(hit.code); }, onError: () => { if (!cancelled) setError(c.cameraError); } })).then((handle) => {
      if (cancelled) handle?.stop(); else { scanner.current = handle; if (looking.current) handle?.pause(); }
    });
    return () => { cancelled = true; alive.current = false; scanner.current?.stop(); };
    // One camera session per dialog. Scanner callbacks retain the initial dictionary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = lines.reduce((sum, line) => sum + line.quantity, 0);

  return <dialog ref={dialog} className="chat-scan" onCancel={(e) => { e.preventDefault(); close(); }} aria-labelledby="scan-title">
    <header><h2 id="scan-title">{c.scanTitle}</h2><button type="button" aria-label={c.close} onClick={close}><X size={20} /></button></header>

    <div className="chat-viewfinder">
      <video ref={video} muted playsInline autoPlay />
      <i className={`chat-scan-line${found ? ' is-found' : ''}`} aria-hidden="true" />
    </div>
    <p aria-live="polite">{found ? c.scanFound : c.scanHelp}</p>

    {pending && <div className="chat-price-ask">
      <p className="chat-price-question">{c.whichPrice.replace('{product}', pending.product.productName)}</p>
      <div className="chat-price-options">
        <button type="button" onClick={() => choosePrice(pending.retail)}>
          <strong>{c.retailPrice}</strong><span>{formatMoney(pending.retail)}</span>
        </button>
        <button type="button" onClick={() => choosePrice(pending.wholesale)}>
          <strong>{c.wholesalePrice}</strong><span>{formatMoney(pending.wholesale)}</span>
          {pending.wholesaleFrom !== null && <em>{c.wholesaleFrom.replace('{quantity}', String(pending.wholesaleFrom))}</em>}
        </button>
      </div>
    </div>}

    {!pending && <form onSubmit={(e) => { e.preventDefault(); void lookup(code); }}>
      <label htmlFor="chat-barcode">{c.barcode}</label>
      <div className="chat-code-row">
        <input id="chat-barcode" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
        <button disabled={loading || !code.trim()}>{c.lookup}</button>
      </div>
    </form>}

    <section className="chat-basket" aria-label={c.basket}>
      {lines.length === 0 ? <p className="chat-basket-empty">{c.basketEmpty}</p> : <ul>
        {lines.map((line, index) => <li key={`${line.productKey}:${line.price ?? 'default'}`}>
          <span className="chat-basket-name">{line.name}{line.price !== null && <em>{formatMoney(line.price)}</em>}</span>
          <input
            type="number" min="0.001" step="any" value={line.quantity} aria-label={c.quantity}
            onChange={(e) => {
              const next = Number(e.target.value);
              setLines((current) => current.map((row, at) => (at === index ? { ...row, quantity: next } : row)));
            }}
          />
          <button type="button" aria-label={c.removeItem} onClick={() => setLines((current) => current.filter((_, at) => at !== index))}>
            <Trash2 size={15} />
          </button>
        </li>)}
      </ul>}
    </section>

    {note && <p className="chat-basket-note">{note}</p>}
    {error && <p role="alert" className="chat-error">{error}</p>}

    <button
      className="chat-primary chat-scan-submit"
      type="button"
      disabled={lines.length === 0 || lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)}
      onClick={() => { send(basketSentence(c, lines)); close(); }}
    >
      <ArrowUp size={18} />
      {lines.length > 1 ? c.sendBasket.replace('{count}', String(total)) : c.sendBasketOne}
    </button>
  </dialog>;
}
