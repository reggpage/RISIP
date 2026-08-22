import { Check, Flashlight, Keyboard, Loader2, RefreshCw, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { ScannerControls } from './useScanner';

// The picture, the box, and the three things that go wrong.
//
// Shared by the register page and the till so a fix reaches both — the last two
// failures were in this code and had to be found twice.

type Copy = {
  aim: string; starting: string; retry: string; typeInstead?: string;
  denied: string; missing: string; failed: string;
  noPictures: string; noReads: string;
  zoom?: string;
};

export function ScanViewfinder({
  controls, copy, hit, height, onType,
}: {
  controls: ScannerControls;
  copy: Copy;
  hit: boolean;
  height: string;
  onType?: () => void;
}) {
  const { camera, hasTorch, torchOn, stats, videoRef, zoom } = controls;
  const broken = camera === 'denied' || camera === 'missing' || camera === 'failed';

  // Ten seconds of looking with nothing to show for it. WHICH nothing matters:
  // no frames at all means the camera is not delivering pictures, while plenty
  // of frames and no reads means the code is too far, too dark or too blurred.
  // Told apart, these are two different things to try.
  const stalled = camera === 'live' && stats.decodes === 0 && stats.frames > 0 && stats.frames > 70;
  const blind = camera === 'live' && stats.frames === 0;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          className={`w-full object-cover ${height}`}
          playsInline
          muted
          autoPlay
        />

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
            <p className={`pointer-events-none absolute inset-x-0 text-center text-xs text-white/80 ${
              zoom ? 'bottom-16' : 'bottom-3'
            }`}>
              {copy.aim}
            </p>
            {zoom ? (
              <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-3 rounded-full bg-black/65 px-3 py-2 text-white shadow-lg backdrop-blur-sm">
                <span className="text-[11px] font-semibold tabular-nums">{zoom.min.toFixed(1)}×</span>
                <input
                  type="range"
                  aria-label={copy.zoom ?? 'Camera zoom'}
                  min={zoom.min}
                  max={zoom.max}
                  step={zoom.step}
                  value={zoom.value}
                  onChange={(event) => controls.setZoom(Number(event.currentTarget.value))}
                  className="h-6 min-w-0 flex-1 cursor-pointer accent-[#E82C4C]"
                />
                <span className="min-w-10 text-right text-xs font-bold tabular-nums">
                  {zoom.value.toFixed(1)}×
                </span>
              </div>
            ) : null}
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              {hasTorch ? (
                <button
                  type="button"
                  aria-label="torch"
                  onClick={controls.toggleTorch}
                  className={`rounded-full p-2.5 shadow-lg transition-colors ${
                    torchOn ? 'bg-[#FFCE1B] text-black' : 'bg-black/50 text-white'
                  }`}
                >
                  <Flashlight className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {camera === 'starting' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">{copy.starting}</span>
          </div>
        ) : null}

        {broken ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
            <X className="h-6 w-6 text-[#FFCE1B]" />
            <p className="text-xs text-white/90">{copy[camera]}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={controls.retry}>
                <RefreshCw className="h-4 w-4" aria-hidden />{copy.retry}
              </Button>
              {onType && copy.typeInstead ? (
                <Button onClick={onType}>
                  <Keyboard className="h-4 w-4" aria-hidden />{copy.typeInstead}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {blind ? <p className="text-center text-xs text-ink">{copy.noPictures}</p> : null}
      {stalled ? <p className="text-center text-xs text-ink-muted">{copy.noReads}</p> : null}
    </div>
  );
}
