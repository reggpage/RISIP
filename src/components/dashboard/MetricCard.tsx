import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

// Value renders in black (ink), icon in muted grey — matches the header's logout icon.
// Old per-role tinting was distracting; the metric itself carries the meaning.
export default function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
        {icon && <div className="text-ink-muted">{icon}</div>}
      </div>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </Card>
  );
}
