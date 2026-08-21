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

export type ScannerHandle = {
  engine: ScanEngine;
  stop: () => void;
  /** Torch, where the camera has one. Returns whether it is now on. */
  toggleTorch: () => Promise<boolean>;
  hasTorch: () => boolean;
};

export type StartOptions = {
  video: HTMLVideoElement;
  deviceId?: string;
  onCode: (found: Barcode) => void;
  onError?: (message: 'denied' | 'missing' | 'failed') => void;
};

/** The four shapes a shop's goods actually carry. */
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'];

type NativeDetector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

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
  return navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId } }
      // The back camera, and enough resolution to resolve thin bars. A phone
      // handed the default front camera points at the shopkeeper's face.
      : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}

function torchControls(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
  let on = false;
  return {
    hasTorch: () => Boolean(capabilities.torch),
    toggleTorch: async () => {
      if (!capabilities.torch || !track) return false;
      on = !on;
      // `torch` is real on Android and absent from the DOM types, which is why
      // the capability is checked above rather than the type trusted here.
      await track.applyConstraints({ advanced: [{ torch: on }] } as unknown as MediaTrackConstraints);
      return on;
    },
  };
}

/** Every camera the phone will admit to, back ones first. */
export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  return cameras.sort((a, b) => {
    const back = (label: string) => (/back|rear|environment|nyuma/i.test(label) ? 0 : 1);
    return back(a.label) - back(b.label);
  });
}

export async function startScanner(options: StartOptions): Promise<ScannerHandle | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    options.onError?.('missing');
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await openCamera(options.deviceId);
  } catch (err) {
    const name = (err as Error)?.name ?? '';
    options.onError?.(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'missing');
    return null;
  }

  const video = options.video;
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  try {
    await video.play();
  } catch {
    // Autoplay can be refused until a gesture; the stream is live either way
    // and the decoder reads frames from it.
  }

  const gate = makeScanGate(options.onCode);
  const torch = torchControls(stream);
  let stopped = false;

  if (nativeDetectorAvailable()) {
    const Ctor = (window as unknown as {
      BarcodeDetector: new (options: { formats: string[] }) => NativeDetector;
    }).BarcodeDetector;
    const detector = new Ctor({ formats: NATIVE_FORMATS });
    const tick = window.setInterval(async () => {
      if (stopped || video.readyState < 2) return;
      try {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) gate(codes[0].rawValue);
      } catch {
        // An unreadable frame is not an error worth showing.
      }
    }, 200);
    return {
      engine: 'native',
      hasTorch: torch.hasTorch,
      toggleTorch: torch.toggleTorch,
      stop: () => {
        stopped = true;
        window.clearInterval(tick);
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      },
    };
  }

  // Everywhere else: the decoder is fetched only now, and only once.
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
    // A retail barcode is one line of a picture. Telling the decoder to try
    // harder costs frames per second and buys nothing on 1D codes.
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    const controls = await reader.decodeFromVideoElement(video, (result) => {
      if (!stopped && result) gate(result.getText());
    });
    return {
      engine: 'zxing',
      hasTorch: torch.hasTorch,
      toggleTorch: torch.toggleTorch,
      stop: () => {
        stopped = true;
        try { controls.stop(); } catch { /* already stopped */ }
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      },
    };
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    options.onError?.('failed');
    return null;
  }
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
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
