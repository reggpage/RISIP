import { useSyncExternalStore } from 'react';

export type ScanVariant = 'sell' | 'scan';

let overlay: ScanVariant | null = null;
let listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openScan(variant: ScanVariant) {
  overlay = variant;
  (window as any).__scanVariant = variant;
  emit();
}

export function closeScan() {
  overlay = null;
  (window as any).__scanVariant = null;
  emit();
}

export function scanOverlayVariant(): ScanVariant | null {
  return overlay;
}

export function subscribeScanOverlay(listener: () => void): () => void {
  listeners = new Set(listeners).add(listener);
  return () => {
    const next = new Set(listeners);
    next.delete(listener);
    listeners = next;
  };
}

export function useScanOverlay(): ScanVariant | null {
  return useSyncExternalStore(subscribeScanOverlay, scanOverlayVariant);
}