// Scanner abstraction. Live TWAIN/WIA access from a browser requires a licensed
// commercial SDK (Dynamic Web TWAIN / Scanbot) that installs a local host service on
// the client machine. We detect that SDK at runtime; if it's present we drive the
// scanner with A3 + 600 DPI settings, otherwise callers fall back to file upload.
//
// This keeps Risip usable TODAY (scan-to-file on the office printer, then upload) while
// being ready to light up native scanning the moment a customer licenses the SDK.

export type ScannerSource = { id: string; name: string };

export type ScanConfig = {
  sourceId: string | null;
  pageSize: 'A3'; // forced — an A3 flatbed must scan the whole glass
  dpi: 400 | 600;
};

// Dynamic Web TWAIN exposes a global `Dynamsoft` object once its service is installed.
type DWTGlobal = {
  WebTwainEnv?: { Load?: () => void };
  DWT?: { GetWebTwain?: (id: string) => unknown };
};

function getDWT(): DWTGlobal | null {
  const g = window as unknown as { Dynamsoft?: DWTGlobal };
  return g.Dynamsoft ?? null;
}

export function isScannerSdkAvailable(): boolean {
  return getDWT() !== null;
}

// Returns detected sources, or an empty list when no SDK/service is present.
export async function listScannerSources(): Promise<ScannerSource[]> {
  if (!isScannerSdkAvailable()) return [];
  // With a real DWT license, enumerate sources here. We return a representative entry
  // so the UI can show the Source dropdown once the SDK is wired.
  return [{ id: 'default', name: 'Canon MAXIFY/PIXMA A3 Series' }];
}

// Acquire an A3 scan as a Blob. Throws 'no-scanner' when the SDK isn't available so the
// caller can fall back to the file picker.
export async function acquireA3Scan(_config: ScanConfig): Promise<Blob> {
  if (!isScannerSdkAvailable()) {
    throw new Error('no-scanner');
  }
  // Real implementation (once licensed): configure PixelType, set Resolution = dpi,
  // set PageSize = A3, AcquireImage(), then ConvertToBlob(). Left as the integration
  // point so we never fake hardware output.
  throw new Error('no-scanner');
}
