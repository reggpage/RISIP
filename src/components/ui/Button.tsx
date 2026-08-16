import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type RoleTint = 'worker' | 'accountant' | 'admin' | 'neutral';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  tint?: RoleTint;
  fullWidth?: boolean;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const tintBg: Record<RoleTint, string> = {
  worker: 'bg-role-worker hover:bg-role-worker/90 focus-visible:ring-role-worker text-white',
  accountant: 'bg-role-accountant hover:bg-role-accountant/90 focus-visible:ring-role-accountant text-white',
  admin: 'bg-role-admin hover:bg-role-admin/90 focus-visible:ring-role-admin text-white',
  // The default was ink-black, which read as a system button rather than a
  // Risip one. Every dark button in the app came from here.
  neutral: 'bg-role-admin hover:bg-role-admin/90 focus-visible:ring-role-admin text-white',
};

const tintOutline: Record<RoleTint, string> = {
  worker: 'border border-role-worker text-role-worker hover:bg-role-worker/10',
  accountant: 'border border-role-accountant text-role-accountant hover:bg-role-accountant/10',
  admin: 'border border-role-admin text-role-admin hover:bg-role-admin/10',
  neutral: 'border border-surface-border text-ink hover:bg-surface-muted',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', tint = 'neutral', fullWidth, className = '', ...rest },
  ref,
) {
  const variantClass =
    variant === 'primary' ? tintBg[tint]
    : variant === 'secondary' ? tintOutline[tint]
    : variant === 'ghost' ? 'text-ink hover:bg-surface-muted'
    : 'bg-red-600 hover:bg-red-500 text-white focus-visible:ring-red-500';

  return (
    <button
      ref={ref}
      className={`${base} ${variantClass} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
});

export default Button;
