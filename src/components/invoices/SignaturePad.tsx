import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import Button from '@/components/ui/Button';

// Lightweight canvas signature pad — no external library. Captures pointer strokes,
// exports a transparent PNG data URL. Used by the owner to approve & sign an invoice.
export default function SignaturePad({
  busy,
  onCancel,
  onSign,
}: {
  busy: boolean;
  onCancel: () => void;
  onSign: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Scale for crisp lines on retina.
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
    }
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }
  function up() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="text-base font-semibold text-ink">Sign to approve</h2>
          <button type="button" onClick={onCancel} disabled={busy} className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            className="h-40 w-full touch-none rounded-lg border border-dashed border-surface-border bg-surface-muted"
          />
          <button type="button" onClick={clear} className="mt-2 text-xs text-ink-muted hover:text-ink">
            Clear
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            tint="admin"
            disabled={busy || !hasInk}
            onClick={() => onSign(canvasRef.current!.toDataURL('image/png'))}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Saving…' : 'Approve & Sign'}
          </Button>
        </div>
      </div>
    </div>
  );
}
