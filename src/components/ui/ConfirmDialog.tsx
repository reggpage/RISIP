import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Button from '@/components/ui/Button';

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

// Promise-based in-app confirm: `const ok = await confirm({ title: '…' })`.
// Replaces the native window.confirm() so dialogs match the app's look on every
// device (native dialogs vary wildly and look off-brand).
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              {state.danger && (
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-ink">{state.title}</h2>
                {state.message && <p className="mt-1 text-sm text-ink-muted">{state.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)}>
                {state.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={state.danger ? 'danger' : 'primary'}
                tint={state.danger ? 'neutral' : 'admin'}
                onClick={() => close(true)}
              >
                {state.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    // Fallback to native confirm in the unlikely case the provider is missing,
    // so callers never crash.
    return async (opts) => window.confirm(opts.message ?? opts.title);
  }
  return fn;
}
