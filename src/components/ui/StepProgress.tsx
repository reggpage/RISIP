export default function StepProgress({
  step,
  labels,
}: {
  step: number; // 1-indexed
  labels: readonly string[];
}) {
  return (
    <ol className="mb-6 flex items-center gap-2">
      {labels.map((label, idx) => {
        const n = idx + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className={
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                (done
                  ? 'bg-role-admin text-white'
                  : active
                    ? 'bg-role-admin/10 text-role-admin ring-2 ring-role-admin'
                    : 'bg-surface-muted text-ink-muted')
              }
              aria-current={active ? 'step' : undefined}
            >
              {done ? '✓' : n}
            </div>
            <span
              className={`hidden text-xs sm:inline ${active ? 'font-medium text-ink' : 'text-ink-muted'}`}
            >
              {label}
            </span>
            {n < labels.length && <div className="mx-1 h-px flex-1 bg-surface-border" />}
          </li>
        );
      })}
    </ol>
  );
}
