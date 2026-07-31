import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

type Tint = 'worker' | 'accountant' | 'admin' | 'neutral';

const tintClass: Record<Tint, string> = {
  worker: 'text-role-worker',
  accountant: 'text-role-accountant',
  admin: 'text-role-admin',
  neutral: 'text-ink',
};

export default function MetricCard({
  label,
  value,
  hint,
  icon,
  tint = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tint?: Tint;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
        {icon && <div className={tintClass[tint]}>{icon}</div>}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tintClass[tint]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </Card>
  );
}
