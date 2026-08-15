// Edge functions run on Deno and import npm packages with the `npm:` specifier.
// TypeScript here is configured for the browser build and cannot resolve those,
// and the test runner reaches them through aliases in vite.config.ts. These
// declarations describe the same shapes so both the functions and their tests
// type-check without pulling Deno's own toolchain into this project.
//
// Keep the versions in step with the imports in supabase/functions/_shared/.

declare module 'npm:jsqr@1.4.0' {
  type QrResult = { data: string; binaryData: number[] };
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
  ): QrResult | null;
}

declare module 'npm:jpeg-js@0.4.4' {
  export function decode(
    data: Uint8Array,
    options?: { useTArray?: boolean; formatAsRGBA?: boolean; maxMemoryUsageInMB?: number },
  ): { width: number; height: number; data: Uint8Array };
}

/** Used only by the QR round-trip test, to render a real square to pixels. */
declare module 'qrcode' {
  const QRCode: {
    create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): {
      modules: { size: number; get(x: number, y: number): boolean };
    };
  };
  export default QRCode;
}
