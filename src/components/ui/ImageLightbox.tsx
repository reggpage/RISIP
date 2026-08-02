import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

// Full-screen image viewer with smooth wheel/click zoom + drag-to-pan. No external libs.
// Click the image to toggle 1× ↔ 2.5×; scroll to zoom; drag to move when zoomed in.
export default function ImageLightbox({ src, alt = '', onClose }: { src: string; alt?: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  function clampScale(s: number) { return Math.min(5, Math.max(1, s)); }

  function onWheel(e: React.WheelEvent) {
    e.stopPropagation();
    const next = clampScale(scale * (e.deltaY < 0 ? 1.15 : 0.87));
    if (next === 1) reset();
    else setScale(next);
  }

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (scale === 1) { drag.current = { x: e.clientX, y: e.clientY, tx, ty, moved: false }; return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || scale === 1) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
    setTx(drag.current.tx + dx);
    setTy(drag.current.ty + dy);
  }
  function onPointerUp(e: React.PointerEvent) {
    e.stopPropagation();
    setDragging(false);
    // Treat a no-move press as a click → toggle zoom centred on the point.
    if (drag.current && !drag.current.moved) toggleZoom(e);
    drag.current = null;
  }

  function toggleZoom(e: React.PointerEvent | React.MouseEvent) {
    if (scale > 1) { reset(); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const s = 2.5;
    setScale(s);
    setTx(-cx * (s - 1));
    setTy(-cy * (s - 1));
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 select-none"
      role="dialog"
      aria-modal="true"
      // Clicking the dark backdrop closes the lightbox only — stop it reaching the modal behind.
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      {/* Controls */}
      <div className="absolute right-3 top-3 z-10 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setScale((s) => { const n = clampScale(s - 0.5); if (n === 1) reset(); return n; })}
          className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Zoom out">
          <ZoomOut className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => setScale((s) => clampScale(s + 0.5))}
          className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Zoom in">
          <ZoomIn className="h-5 w-5" />
        </button>
        <button type="button" onClick={onClose}
          className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <img
        src={src}
        alt={alt}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 150ms ease-out',
          cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          touchAction: 'none',
        }}
        className="max-h-[92vh] max-w-[92vw] object-contain"
      />

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
        Scroll or click to zoom · drag to move
      </div>
    </div>
  );
}
