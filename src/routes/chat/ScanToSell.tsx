import { useEffect, useRef, useState } from 'react';
import { X, ScanLine, ArrowUp } from 'lucide-react';
import { startScanner, type ScannerHandle } from '@/features/products/scanner';
import { findProductByBarcode, type ProductBarcode } from '@/features/products/products';
import { saleSentence } from '@/features/chat/chat';
import { sw } from '@/i18n/sw';

export default function ScanToSell({ close, send }: { close: () => void; send: (text: string) => void }) {
  const c = sw.chat;
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), scanner = useRef<ScannerHandle | null>(null);
  const alive = useRef(true), looking = useRef(false);
  const [product, setProduct] = useState<ProductBarcode | null>(null), [quantity, setQuantity] = useState('1'), [code, setCode] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  async function lookup(barcode: string) {
    if (looking.current) return;
    looking.current = true; setLoading(true); setError(''); scanner.current?.pause();
    try {
      const found = await findProductByBarcode(barcode);
      if (!alive.current) return;
      if (!found) { setError(c.missingProduct); scanner.current?.resume(); }
      else setProduct(found);
    } catch { if (alive.current) setError(c.loadError); scanner.current?.resume(); }
    finally { looking.current = false; if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    let cancelled = false;
    alive.current = true; dialog.current?.showModal();
    // StrictMode replays mount effects. Let its cleanup run before opening a
    // camera, otherwise the discarded handle can stop the second one's video.
    void Promise.resolve().then(() => cancelled ? null : startScanner({ video: video.current!, onCode: (found) => { if (!cancelled) void lookup(found.code); }, onError: () => { if (!cancelled) setError(c.cameraError); } })).then((handle) => {
      if (cancelled) handle?.stop(); else { scanner.current = handle; if (looking.current) handle?.pause(); }
    });
    return () => { cancelled = true; alive.current = false; scanner.current?.stop(); };
    // One camera session per dialog. Scanner callbacks retain the initial dictionary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <dialog ref={dialog} className="chat-scan" onCancel={(e) => { e.preventDefault(); close(); }} aria-labelledby="scan-title">
    <header><h2 id="scan-title">{c.scanTitle}</h2><button type="button" aria-label={c.close} onClick={close}><X size={20} /></button></header>
    <div hidden={Boolean(product)}><div className="chat-viewfinder"><video ref={video} muted playsInline autoPlay /><ScanLine aria-hidden="true" /></div><p>{c.scanHelp}</p>
      <form onSubmit={(e) => { e.preventDefault(); void lookup(code); }}><label htmlFor="chat-barcode">{c.barcode}</label><div className="chat-code-row"><input id="chat-barcode" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" /><button disabled={loading || !code.trim()}>{c.lookup}</button></div></form>
    </div>
    {product && <form onSubmit={(e) => { e.preventDefault(); const n = Number(quantity); if (!Number.isFinite(n) || n <= 0) { setError(c.invalidQuantity); return; } send(saleSentence(c.saleSentence, product.productName, n)); close(); }}>
      <p className="chat-product">{product.productName}</p><p>{product.barcode}</p><label htmlFor="chat-quantity">{c.quantity}</label><input autoFocus id="chat-quantity" type="number" min="0.001" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      <button className="chat-primary chat-scan-submit" type="submit"><ArrowUp size={18} />{c.scanContinue}</button>
    </form>}
    {error && <p role="alert" className="chat-error">{error}</p>}
  </dialog>;
}
