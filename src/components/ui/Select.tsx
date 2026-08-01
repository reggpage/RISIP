import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string };

// In-app dropdown replacing the native <select>. Custom popover so the panel picks
// up our fonts/borders/theme instead of the OS-native chrome. Keyboard-friendly:
// Enter/Space opens, Escape closes, click-outside closes.
export default function Select({
  value,
  options,
  onChange,
  placeholder = '—',
  label,
  disabled,
  className = '',
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* Label matches Input's (text-sm/medium/ink) so a Select and an Input placed
          side-by-side in a grid line up on the same baseline. */}
      {label && <label className="text-sm font-medium text-ink">{label}</label>}
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={
            // min-h-[38px] matches the rendered height of a native date <input> so the
            // Date and Category fields are the same size.
            'flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink transition ' +
            'focus:outline-none focus:ring-2 focus:ring-role-admin/30 ' +
            (disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-role-admin/40')
          }
        >
          <span className={selected ? '' : 'text-ink-muted'}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-surface-border bg-surface py-1 shadow-lg ring-1 ring-black/[0.03]"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-muted">No options</li>
            ) : (
              options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ' +
                        (isSelected
                          ? 'bg-role-admin/10 text-role-admin'
                          : 'text-ink hover:bg-surface-muted')
                      }
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
