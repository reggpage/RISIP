// Canvas-based image compressor. Runs entirely in the browser — no npm dep — so we
// stay lean and it works on every mobile browser (iOS Safari included).
//
// Why we compress: raw phone photos are 3–8MB HEIC/JPEG. Uploading them straight to
// Supabase Storage burns bandwidth (slow on 3G) and inflates the storage bill. A
// 300KB JPEG at ~2000px on the longer edge is still crisp enough for Claude vision
// and human review while cutting size 10–20×.
//
// Strategy: downscale to `maxDim` on the longer edge, then iteratively drop JPEG
// quality until under `maxKB` (or we hit the quality floor).

const DEFAULT_MAX_KB = 300;
const DEFAULT_MAX_DIM = 2000;
const QUALITY_START = 0.85;
const QUALITY_MIN = 0.4;
const QUALITY_STEP = 0.1;

async function loadImage(file: File): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode image'));
    el.src = url;
  });
  return { img, revoke: () => URL.revokeObjectURL(url) };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function compressImage(
  file: File,
  opts: { maxKB?: number; maxDim?: number } = {},
): Promise<File> {
  // Skip work for files that are already small enough — no need to touch pixels.
  const maxKB = opts.maxKB ?? DEFAULT_MAX_KB;
  const maxDim = opts.maxDim ?? DEFAULT_MAX_DIM;
  if (file.size <= maxKB * 1024 && /^image\/jpe?g$/i.test(file.type)) return file;

  const { img, revoke } = await loadImage(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file; // No 2d context — bail out with the original.
    ctx.drawImage(img, 0, 0, w, h);

    let quality = QUALITY_START;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > maxKB * 1024 && quality > QUALITY_MIN) {
      quality = Math.max(QUALITY_MIN, quality - QUALITY_STEP);
      blob = await canvasToBlob(canvas, quality);
    }

    // If compression somehow made it bigger (rare), keep the original.
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/i, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    revoke();
  }
}
