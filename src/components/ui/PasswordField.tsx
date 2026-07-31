import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  error?: string;
  hint?: string;
};

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { label, error, hint, id, className = '', ...rest },
  ref,
) {
  const [show, setShow] = useState(false);
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={show ? 'text' : 'password'}
          className={
            'w-full rounded-lg border border-surface-border bg-surface px-3 py-2 pr-10 text-sm text-ink ' +
            'placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-role-admin/30 ' +
            (error ? 'border-red-500 ' : '') +
            className
          }
          aria-invalid={!!error}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-2 flex items-center text-ink-muted hover:text-ink"
          aria-label={show ? 'Ficha nenosiri' : 'Onyesha nenosiri'}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {(error || hint) && (
        <span className={`text-xs ${error ? 'text-red-600' : 'text-ink-muted'}`}>{error ?? hint}</span>
      )}
    </div>
  );
});

export default PasswordField;

// ── strength scoring ───────────────────────────────────────────────────────
// 0..4 buckets. Weak/Fair/Good/Strong labels are localized in i18n.
export function scorePassword(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}

export function PasswordStrengthBar({ score }: { score: 0 | 1 | 2 | 3 | 4 }) {
  const filled = score;
  const color =
    score >= 4 ? 'bg-emerald-500'
    : score >= 3 ? 'bg-teal-500'
    : score >= 2 ? 'bg-amber-500'
    : 'bg-red-500';
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded ${i < filled ? color : 'bg-surface-border'}`}
        />
      ))}
    </div>
  );
}
