import type { HTMLAttributes } from 'react';

/** Base shimmer block — drop-in for any element while data loads. */
export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-surface-muted ${className}`}
      {...props}
    />
  );
}

/** 4-metric-card skeleton for the dashboard top row. */
export function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-20" />
    </div>
  );
}

/** Category-bar skeleton for the dashboard spend breakdown. */
export function CategoryBarSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-1">
      <Skeleton className="h-3 w-20 shrink-0" />
      <Skeleton className="h-2 flex-1 rounded-full" />
      <Skeleton className="h-3 w-14 shrink-0" />
    </div>
  );
}

/** Project card skeleton for the grid list. */
export function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-3 w-1/2" />
      <Skeleton className="mb-4 h-3 w-1/3" />
      <Skeleton className="h-3 w-1/4" />
    </div>
  );
}

/** Generic card-list-item skeleton for receipts and invoices. */
export function ListItemSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          {Array.from({ length: lines - 1 }).map((_, i) => (
            <Skeleton key={i} className={`h-3 ${i === 0 ? 'w-3/5' : 'w-1/3'}`} />
          ))}
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

/** Member row skeleton for the settings team list. */
export function MemberRowSkeleton() {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-8 w-24 rounded-lg" />
    </li>
  );
}

/** Company profile section skeleton (settings page). */
export function CompanyProfileSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {/* Logo placeholder */}
      <div className="mb-2 flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}
