import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className = '', ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={
          'w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink ' +
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

export default Input;
