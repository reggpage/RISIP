import { forwardRef, useMemo, type InputHTMLAttributes } from 'react';

// Text input that auto-formats a numeric value with thousands separators as the
// user types ("30000000" → "30,000,000") while emitting a raw string of digits
// (+ optional decimal) to the parent via `onChange`. Kept as a controlled input
// so parent state is always the canonical, comma-free value.
export type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  label?: string;
  error?: string;
  hint?: string;
  value: string;
  onChange: (raw: string) => void;
  allowDecimal?: boolean;
};

function formatWithCommas(raw: string): string {
  if (!raw) return '';
  const [intPart, decPart] = raw.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { label, error, hint, value, onChange, allowDecimal = true, id, className = '', ...rest },
  ref,
) {
  const display = useMemo(() => formatWithCommas(value), [value]);
  const inputId = id ?? rest.name;

  const digitsOnly = (s: string) => {
    const cleaned = s.replace(/[^\d.]/g, '');
    if (!allowDecimal) return cleaned.replace(/\./g, '');
    // Keep only the first decimal point.
    const first = cleaned.indexOf('.');
    if (first === -1) return cleaned;
    return cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/\./g, '');
  };

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">{label}</label>
      )}
      <input
        ref={ref}
        id={inputId}
        type="text"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        value={display}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        className={
          'w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink tabular-nums ' +
          'placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-role-admin/30 ' +
          (error ? 'border-red-500 ' : '') +
          className
        }
        aria-invalid={!!error}
        {...rest}
      />
      {(error || hint) && (
        <span className={`text-xs ${error ? 'text-red-600' : 'text-ink-muted'}`}>{error ?? hint}</span>
      )}
    </div>
  );
});

export default NumberInput;
