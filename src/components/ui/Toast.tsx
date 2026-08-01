import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };

const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(null);

const AUTO_DISMISS_MS = 4000;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Top-center on mobile, top-right on desktop. pointer-events-none on the wrapper
          so it doesn't block clicks; each toast re-enables pointer events. */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:left-auto sm:right-4 sm:top-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={
              'pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ' +
              (t.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : t.kind === 'error'
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : 'border-surface-border bg-surface text-ink')
            }
          >
            <span className="mt-0.5 shrink-0">
              {t.kind === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {t.kind === 'error' && <AlertTriangle className="h-4 w-4 text-red-600" />}
              {t.kind === 'info' && <Info className="h-4 w-4 text-ink-muted" />}
            </span>
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) {
    // Fail loudly during development, silently no-op in prod so a missing provider
    // never breaks a page (better UX than crashing on toast).
    if (import.meta.env.DEV) {
      throw new Error('useToast must be used inside <ToastProvider>');
    }
    return { success() {}, error() {}, info() {} };
  }
  return {
    success: (msg: string) => push('success', msg),
    error: (msg: string) => push('error', msg),
    info: (msg: string) => push('info', msg),
  };
}
