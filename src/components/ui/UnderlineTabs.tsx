export type UnderlineTab<T extends string> = { value: T; label: string };

export default function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: {
  tabs: UnderlineTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto border-b border-surface-border ${className}`} role="tablist" aria-label={label}>
      <div className="flex min-w-max gap-5">
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={`relative whitespace-nowrap px-1 pb-2.5 pt-1 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:origin-left after:transition-transform after:duration-300 ${active ? 'text-role-admin after:scale-x-100 after:bg-role-admin' : 'text-ink-muted after:scale-x-0 after:bg-transparent hover:text-ink'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
