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
    // The border lives out here so the scroller can clip vertically.
    //
    // MEASURED FAILURE: `overflow-x-auto` alone gave every tab bar in the app a
    // little vertical scrollbar with arrows on it. CSS promotes the other axis
    // to `auto` as soon as one axis stops being `visible`, and the active tab's
    // underline sat one pixel below the box — one pixel of overflow, and the
    // browser drew a scrollbar for it.
    <div className={`border-b border-surface-border ${className}`}>
      <div
        className="overflow-x-auto overflow-y-hidden"
        role="tablist"
        aria-label={label}
      >
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
                className={`relative whitespace-nowrap px-1 pb-2.5 pt-1 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:transition-transform after:duration-300 ${active ? 'text-role-admin after:scale-x-100 after:bg-role-admin' : 'text-ink-muted after:scale-x-0 after:bg-transparent hover:text-ink'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
