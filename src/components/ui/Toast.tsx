import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; kind: ToastKind; message: string; action?: ToastAction };

const ToastContext = createContext<((kind: ToastKind, message: string, action?: ToastAction) => void) | null>(null);

const AUTO_DISMISS_MS = 4000;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string, action?: ToastAction) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message, action }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, action ? AUTO_DISMISS_MS * 2 : AUTO_DISMISS_MS);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Stack sits fixed at top-center (mobile) / top-right (desktop). Width is
          clamped to a standard 380px so every toast looks the same. */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:left-auto sm:right-4 sm:top-4 sm:items-end">
        {toasts.map((t) => {
          const accent =
            t.kind === 'success' ? 'border-l-emerald-500 text-emerald-600'
            : t.kind === 'error' ? 'border-l-role-admin text-role-admin'
            : 'border-l-ink-muted text-ink-muted';
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={
                // Roomier — 14px vertical padding + slightly larger text so the
                // toast reads well even from arm's length on a phone screen.
                'toast-enter pointer-events-auto flex w-[calc(100vw-2rem)] min-h-[56px] max-w-[400px] items-start gap-3 rounded-xl border border-surface-border border-l-4 bg-surface px-4 py-3.5 text-sm shadow-lg ring-1 ring-black/[0.03] ' +
                accent
              }
            >
              <span className="mt-0.5 shrink-0">
                {t.kind === 'success' && <CheckCircle2 className="h-4 w-4" />}
                {t.kind === 'error' && <AlertTriangle className="h-4 w-4" />}
                {t.kind === 'info' && <Info className="h-4 w-4" />}
              </span>
              <span className="flex-1 leading-snug text-ink">
                {t.message}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="ml-2 font-semibold text-role-admin hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded p-0.5 text-ink-muted opacity-70 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) {
    if (import.meta.env.DEV) {
      throw new Error('useToast must be used inside <ToastProvider>');
    }
    return { success() {}, error() {}, info() {} };
  }
  return {
    success: (msg: string, action?: ToastAction) => push('success', msg, action),
    error: (msg: string, action?: ToastAction) => push('error', msg, action),
    info: (msg: string, action?: ToastAction) => push('info', msg, action),
  };
}
