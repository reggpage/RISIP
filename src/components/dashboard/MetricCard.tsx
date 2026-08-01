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
      {/* Lora display face — gives metric numbers a "financial report" feel. */}
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </Card>
  );
}
