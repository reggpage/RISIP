import { readBarcode, type Barcode } from '../../../supabase/functions/_shared/barcode';

// Driving a phone camera as a barcode scanner.
//
// MEASURED FAILURE: the first version used the browser's own BarcodeDetector
// and nothing else. That API exists in Chrome on Android and ChromeOS and
// almost nowhere else — not on Windows, not on iPhone — so the owner opened the
// scanner and got a text box. A scanner that usually cannot scan is not a
// scanner.
//
// So there are two engines and the page never has to care which it got:
//
//   NATIVE   BarcodeDetector where it exists. Nothing to download, decoded by
//            the phone itself, and it is the fastest of the two.
//   ZXING    lazy-loaded WebAssembly-free JS decoder everywhere else. It is
//            ~150KB, which is why it is loaded ONLY on this page and only when
//            the native one is missing.
//
// Everything a shop actually needs is here rather than in the component: the
// torch for a dark duka, the back camera by default, and the rule that a code
// has to be read twice before it counts.

export type ScanEngine = 'native' | 'zxing';

export type CameraZoom = {
  min: number;
  max: number;
  step: number;
  value: number;
};

export type ScannerHandle = {
  engine: ScanEngine;
  /**
   * Stops DECODING and leaves the camera running.
   *
   * MEASURED FAILURE: the first version stopped the stream after every scan and
   * asked for the camera again for the next one. iOS refuses that often enough
   * that the owner could scan once and then had to reload the page —
   * "nikighairi nikijaribu kuscan tena inagoma mpaka ni-refresh browser". A
   * camera that is already open cannot be refused.
   */
  pause: () => void;
  resume: () => void;
  /** Closes the camera. Only when the page is leaving. */
  stop: () => void;
  /** Torch, where the camera has one. Returns whether it is now on. */
  toggleTorch: () => Promise<boolean>;
  hasTorch: () => boolean;
  /** Hardware zoom, where the selected camera exposes it. */
  zoom: () => CameraZoom | null;
  setZoom: (value: number) => Promise<number | null>;
  /**
   * What the loop has actually done.
   *
   * Both silent failures so far looked identical from the outside — a live
   * picture and nothing happening — and were completely different underneath:
   * once a decoder reading a 0x0 canvas, once a camera that had been stopped by
   * a stray effect cleanup. FRAMES tells those apart at a glance, which is why
   * the page can now say something useful instead of nothing.
   */
  stats: () => { frames: number; decodes: number };
};

export type StartOptions = {
  video: HTMLVideoElement;
  deviceId?: string;
  onCode: (found: Barcode) => void;
  onError?: (message: 'denied' | 'missing' | 'failed') => void;
};

/** The four shapes a shop's goods actually carry. */
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'];

// detect() takes any ImageBitmapSource; a canvas is what this file gives it.
type NativeDetector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function nativeDetectorAvailable(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Two clean reads of the same number before it counts.
 *
 * A single frame can be misread where the packet is creased or the light is
 * poor, and the checksum does not catch every one of those — a wrong-but-valid
 * code silently registers the wrong product. Two agreeing reads costs about a
 * tenth of a second and removes that.
 */
export function makeScanGate(onCode: (found: Barcode) => void, now: () => number = Date.now) {
  let last = '';
  let seen = 0;
  let accepted = '';
  let acceptedAt = 0;
  return (raw: string) => {
    const found = readBarcode(raw);
    if (!found) return;
    if (found.code === last) seen += 1; else { last = found.code; seen = 1; }
    if (seen < 2) return;
    // The same packet sitting in front of the lens must not register twice.
    const at = now();
    if (found.code === accepted && at - acceptedAt < 2500) return;
    accepted = found.code;
    acceptedAt = at;
    seen = 0;
    last = '';
    onCode(found);
  };
}

async function openCamera(deviceId?: string): Promise<MediaStream> {
  const video = {
    ...(deviceId
      ? { deviceId: { exact: deviceId } }
      // The back camera, and enough resolution to resolve thin bars. A phone
      // handed the default front camera points at the shopkeeper's face.
      : { facingMode: { ideal: 'environment' } }),
    // Ask for the sharpest useful picture. These are ideals, not hard minimums,
    // so a lower-resolution phone still opens instead of failing outright.
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
  return navigator.mediaDevices.getUserMedia({
    video,
    audio: false,
  });
}

type NumericCapability = { min: number; max: number; step?: number };
type MagnifierCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: NumericCapability;
};
type MagnifierSettings = MediaTrackSettings & { zoom?: number };

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function preferredFocusMode(capabilities: unknown): 'macro' | 'continuous' | null {
  const modes = (capabilities as { focusMode?: unknown } | null)?.focusMode;
  if (!Array.isArray(modes)) return null;
  if (modes.includes('macro')) return 'macro';
  if (modes.includes('continuous')) return 'continuous';
  return null;
}

export function zoomFromCapabilities(capabilities: unknown, current?: unknown): CameraZoom | null {
  const capability = (capabilities as { zoom?: Partial<NumericCapability> } | null)?.zoom;
  if (!capability || !finiteNumber(capability.min) || !finiteNumber(capability.max)) return null;
  if (capability.max <= capability.min) return null;
  const step = finiteNumber(capability.step) && capability.step > 0 ? capability.step : 0.1;
  const value = finiteNumber(current)
    ? Math.min(capability.max, Math.max(capability.min, current))
    : Math.min(capability.max, Math.max(capability.min, 2));
  return { min: capability.min, max: capability.max, step, value };
}

/**
 * Makes a normal camera behave like a magnifier where the hardware permits it.
 *
 * focusMode and zoom are real MediaStream constraints but are still missing
 * from some TypeScript DOM definitions. Every capability is checked at runtime
 * before it is requested; an old iPhone or a laptop webcam simply keeps its
 * normal focus and exposes no slider.
 */
export function createMagnifierControls(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  let zoom: CameraZoom | null = null;

  const live = () => Boolean(track && track.readyState === 'live');
  const applyAdvanced = async (constraint: Record<string, string | number>) => {
    if (!live()) return false;
    try {
      await track.applyConstraints({ advanced: [constraint] } as unknown as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  };

  return {
    initialize: async () => {
      if (!live() || typeof track.getCapabilities !== 'function') return;
      try {
        const capabilities = track.getCapabilities() as MagnifierCapabilities;
        const preferred = preferredFocusMode(capabilities);
        if (preferred) {
          const focused = await applyAdvanced({ focusMode: preferred });
          // A few cameras advertise macro but only accept continuous through
          // the browser. Fall back once, then leave the hardware alone.
          if (!focused && preferred === 'macro' && capabilities.focusMode?.includes('continuous')) {
            await applyAdvanced({ focusMode: 'continuous' });
          }
        }

        let setting: number | undefined;
        try {
          setting = (track.getSettings() as MagnifierSettings).zoom;
        } catch {
          // getSettings is not reliable on older WebKit; capabilities suffice.
        }
        zoom = zoomFromCapabilities(capabilities, setting);
        if (!zoom) return;

        // Start close enough to read a small packet, but clamp to what this
        // exact camera supports. No zoom is requested on unsupported devices.
        const initial = Math.min(zoom.max, Math.max(zoom.min, 2));
        if (await applyAdvanced({ zoom: initial })) zoom = { ...zoom, value: initial };
      } catch {
        // Capability inspection itself can throw on partially implemented
        // browsers. Standard camera mode remains fully usable.
        zoom = null;
      }
    },
    zoom: () => zoom ? { ...zoom } : null,
    setZoom: async (requested: number) => {
      if (!zoom || !finiteNumber(requested)) return null;
      const next = Math.min(zoom.max, Math.max(zoom.min, requested));
      if (!await applyAdvanced({ zoom: next })) return zoom.value;
      let actual = next;
      try {
        const reported = (track.getSettings() as MagnifierSettings).zoom;
        if (finiteNumber(reported)) actual = Math.min(zoom.max, Math.max(zoom.min, reported));
      } catch {
        // The applied value is still the best available source of truth.
      }
      zoom = { ...zoom, value: actual };
      return actual;
    },
  };
}

function torchControls(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  let on = false;

  const supportsTorch = () => {
    if (!track || track.readyState !== 'live' || typeof track.getCapabilities !== 'function') return false;
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
    return capabilities.torch === true;
  };

  return {
    hasTorch: supportsTorch,
    toggleTorch: async () => {
      if (!supportsTorch()) return false;
      const next = !on;
      // `torch` is real on Android and absent from the DOM types, which is why
      // the capability is checked above rather than the type trusted here.
      try {
        await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
        on = next;
      } catch {
        // Some browsers advertise torch support but reject it for the selected
        // camera or current permission state. Keep UI and hardware safely off.
        on = false;
      }
      return on;
    },
  };
}

/**
 * The strip of the picture the barcode is actually in.
 *
 * Two reasons, and both of them are the difference between scanning and not:
 *
 *   SPEED     a 1D barcode needs the full WIDTH of the frame and almost none of
 *             its height. Decoding a 720-row picture to read forty rows is
 *             most of the work thrown away, and on a mid-range phone that is
 *             the gap between four frames a second and fifteen.
 *   ACCURACY  everything above and below the code is noise — the owner's test
 *             photo had a paragraph of English, a price sticker and an FSC logo
 *             in frame. Cropping to the guide box is why a scanner has a guide
 *             box.
 *
 * Sized from the video EVERY frame, never once at the start. See startScanner.
 */
function drawScanBand(video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return false;
  const bandHeight = Math.max(96, Math.round(height * 0.45));
  const top = Math.round((height - bandHeight) / 2);
  // Downscale wide frames: past about 1280 across, the extra pixels cost time
  // and buy nothing on bars this size.
  const scale = Math.min(1, 1280 / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(bandHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, 0, top, width, bandHeight, 0, 0, canvas.width, canvas.height);
  return true;
}

export async function startScanner(options: StartOptions): Promise<ScannerHandle | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    options.onError?.('missing');
    return null;
  }

  const video = options.video;
  // Set BEFORE the stream arrives. iOS Safari decides whether it may play
  // inline at the moment it gets a source, and a video it refuses to play
  // inline goes fullscreen instead — or does not start at all.
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('muted', 'true');
  video.muted = true;

  let stream: MediaStream;
  try {
    stream = await openCamera(options.deviceId);
  } catch (err) {
    const name = (err as Error)?.name ?? '';
    options.onError?.(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'missing');
    return null;
  }

  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // Autoplay can be refused until a gesture. The stream is live either way
    // and the loop below reads frames from it.
  }

  const gate = makeScanGate(options.onCode);
  const torch = torchControls(stream);
  const magnifier = createMagnifierControls(stream);
  await magnifier.initialize();
  const canvas = document.createElement('canvas');
  let stopped = false;
  let timer = 0;

  // MEASURED FAILURE, on the owner's iPhone: the camera showed a live picture
  // with the barcode square in the guide box, and nothing ever happened.
  //
  // ZXing's own decodeFromVideoElement builds its capture canvas ONCE, from
  // video.videoWidth at the instant scanning starts. On iOS, play() resolves
  // before the metadata gives dimensions, so that canvas is 0×0 — and every
  // frame after it decodes an empty picture, silently, for ever.
  //
  // So the loop is ours. The canvas is sized from the video on EVERY frame,
  // which costs nothing and cannot be caught out by a slow phone.
  let decodeFrame: (source: HTMLCanvasElement) => Promise<string | null>;
  let engine: ScanEngine;

  if (nativeDetectorAvailable()) {
    const Ctor = (window as unknown as {
      BarcodeDetector: new (options: { formats: string[] }) => NativeDetector;
    }).BarcodeDetector;
    const detector = new Ctor({ formats: NATIVE_FORMATS });
    engine = 'native';
    decodeFrame = async (source) => {
      const codes = await detector.detect(source);
      return codes[0]?.rawValue ?? null;
    };
  } else {
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.ITF,
      ]);
      // TRY_HARDER earns its cost here: the band is small and the shopkeeper is
      // holding the phone by hand, so a frame is often slightly rotated or
      // blurred. Without it, a code that a person can read plainly is refused.
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      engine = 'zxing';
      decodeFrame = async (source) => {
        try {
          return reader.decodeFromCanvas(source).getText();
        } catch {
          // NotFoundException on a frame with no code in it: the normal case,
          // fifteen times a second.
          return null;
        }
      };
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      options.onError?.('failed');
      return null;
    }
  }

  let paused = false;
  let frames = 0;
  let decodes = 0;
  const loop = async () => {
    if (stopped) return;
    try {
      if (paused) { timer = window.setTimeout(() => void loop(), 250); return; }
      if (drawScanBand(video, canvas)) {
        frames += 1;
        const raw = await decodeFrame(canvas);
        if (raw) { decodes += 1; gate(raw); }
      }
    } catch {
      // One bad frame is not worth a message; the next is 120ms away.
    }
    if (!stopped) timer = window.setTimeout(() => void loop(), 80);
  };
  void loop();

  return {
    engine,
    hasTorch: torch.hasTorch,
    toggleTorch: torch.toggleTorch,
    zoom: magnifier.zoom,
    setZoom: magnifier.setZoom,
    stats: () => ({ frames, decodes }),
    pause: () => { paused = true; },
    // A fresh gate on resume: the packet in front of the lens when scanning
    // stopped must be scannable again the moment it starts.
    resume: () => { paused = false; },
    stop: () => {
      stopped = true;
      window.clearTimeout(timer);
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    },
  };
}

/**
 * The sound a till makes.
 *
 * Built rather than downloaded: an audio file is another request on a shop's
 * data bundle, and the shopkeeper is looking at the packet, not the screen —
 * the beep is how they know to move to the next one.
 */
export function beep(): void {
  try {
    const Ctx = window.AudioContext
      ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 1180;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.09);
    oscillator.onended = () => void ctx.close();
  } catch {
    // A phone that will not make a sound still vibrates and still scans.
  }
}
