import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import Button from '@/components/ui/Button';

// Minimal square logo cropper — no external lib. User pans (drag) and zooms
// (slider), the framed 1:1 area is rendered to a canvas on Confirm and returned
// as a JPEG blob. Fixed 512×512 output — enough for retina logos, tiny bytes.

const FRAME_PX = 280; // Displayed crop frame size
const OUTPUT_PX = 512; // Canvas output resolution

export default function LogoCropModal({
  file,
  uploading,
  onCancel,
  onConfirm,
}: {
  file: File;
  uploading: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Load the image once so we know its natural dimensions.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // "Contain" fit — the LONGER edge equals the frame, so the whole image is visible
  // with padding around it (like WhatsApp's profile picture cropper). User then zooms
  // in to fill/crop. Old "cover" fit was chopping wide logos left/right at zoom=1.
  const baseScale = useMemo(() => {
    if (!img) return 1;
    return FRAME_PX / Math.max(img.naturalWidth, img.naturalHeight);
  }, [img]);

  // Effective scale = base × user zoom.
  const scale = baseScale * zoom;

  // Clamp offset so image edges never leave the frame.
  function clampOffset(ox: number, oy: number) {
    if (!img) return { x: 0, y: 0 };
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const maxX = Math.max(0, (w - FRAME_PX) / 2);
    const maxY = Math.max(0, (h - FRAME_PX) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, ox)),
      y: Math.min(maxY, Math.max(-maxY, oy)),
    };
  }

  // Re-clamp offset whenever zoom changes so nothing snaps outside the frame.
  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill white first — otherwise "contain" crops with padding produce black bars.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);

    // Map the visible frame → the source image region.
    const srcSize = FRAME_PX / scale; // in image pixels
    const cxImg = img.naturalWidth / 2 - offset.x / scale;
    const cyImg = img.naturalHeight / 2 - offset.y / scale;
    const sx = cxImg - srcSize / 2;
    const sy = cyImg - srcSize / 2;

    ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, OUTPUT_PX, OUTPUT_PX);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
    );
    if (!blob) return;
    await onConfirm(blob);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="text-base font-semibold text-ink">Adjust logo</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={uploading}
            className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 p-5">
          {/* Crop frame — clips overflow, image inside is absolutely positioned. */}
          <div
            className="relative touch-none overflow-hidden rounded-full border border-surface-border bg-surface-muted"
            style={{ width: FRAME_PX, height: FRAME_PX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imgUrl && img && (
              <img
                src={imgUrl}
                alt=""
                draggable={false}
                className="absolute select-none"
                style={{
                  left: '50%',
                  top: '50%',
                  width: img.naturalWidth * scale,
                  height: img.naturalHeight * scale,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            )}
          </div>

          {/* Zoom slider */}
          <div className="flex w-full items-center gap-3">
            <ZoomOut className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              disabled={uploading}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-role-admin"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-ink-muted" />
          </div>

          <p className="text-xs text-ink-muted">Drag to reposition · use the slider to zoom</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={uploading}>
            Cancel
          </Button>
          <Button tint="admin" onClick={() => void confirm()} disabled={uploading || !img}>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploading ? 'Uploading…' : 'Upload logo'}
          </Button>
        </div>
      </div>
    </div>
  );
}
