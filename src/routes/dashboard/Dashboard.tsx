import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Users, FileText, Wallet } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { CategoryBarSkeleton, ListItemSkeleton, MetricCardSkeleton } from '@/components/ui/Skeleton';
import Select from '@/components/ui/Select';
import MetricCard from '@/components/dashboard/MetricCard';
import SpendByCategory from '@/components/dashboard/SpendByCategory';
import SpendTrendChart from '@/components/dashboard/SpendTrendChart';
import ReceiptCard from '@/components/receipts/ReceiptCard';
import { useDashboardData } from '@/features/dashboard/useDashboardData';
import { useProjects } from '@/features/projects/useProjects';
import { formatMoney } from '@/lib/format';
import { sw } from '@/i18n/sw';

export default function Dashboard() {
  const { state: projectsState } = useProjects();
  const [projectId, setProjectId] = useState<string>('');
  const data = useDashboardData(projectId || undefined);

  const activeProjects =
    projectsState.status === 'ready' ? projectsState.projects.filter((p) => p.status === 'active') : [];
  const recentActivity = useMemo(() => {
    const visible = data.recent.slice(0, 3);
    const duplicate = visible.find((receipt) => receipt.status === 'duplicate' && receipt.duplicate_of);
    const original = duplicate?.duplicate_of
      ? data.recent.find((receipt) => receipt.id === duplicate.duplicate_of)
      : null;
    if (original && !visible.some((receipt) => receipt.id === original.id)) visible.push(original);
    return visible;
  }, [data.recent]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{sw.nav.dashboard}</h1>
        {activeProjects.length > 1 && (
          <div className="min-w-[220px]">
            <Select
              label={sw.dashboard.filterProject}
              value={projectId}
              onChange={setProjectId}
              placeholder={sw.dashboard.allProjects}
              options={[
                { value: '', label: sw.dashboard.allProjects },
                ...activeProjects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.loading ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : (
          <>
            <MetricCard
              label={sw.dashboard.metrics.totalExpenses}
              value={formatMoney(data.totalExpenses)}
              icon={<Wallet className="h-5 w-5" />}
            />
            <MetricCard
              label={sw.dashboard.metrics.receipts}
              value={data.confirmedCount}
              icon={<Receipt className="h-5 w-5" />}
            />
            <MetricCard
              label={sw.dashboard.metrics.activeWorkers}
              value={data.activeWorkers}
              icon={<Users className="h-5 w-5" />}
            />
            <MetricCard
              label={sw.dashboard.metrics.invoicesThisMonth}
              value={data.invoicesThisMonth}
              icon={<FileText className="h-5 w-5" />}
            />
          </>
        )}
      </div>

      {/* Spend trend — daily bars for the last 30 days with a "vs previous" delta. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Spend trend</CardTitle>
        </CardHeader>
        {data.loading ? (
          <div className="h-36 w-full animate-pulse rounded-lg bg-surface-muted" />
        ) : (
          <SpendTrendChart receipts={data.receipts} />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <Card>
            {data.loading ? (
              <div className="flex flex-col gap-3 pb-2">
                {Array.from({ length: 4 }).map((_, i) => <CategoryBarSkeleton key={i} />)}
              </div>
            ) : (
              <SpendByCategory receipts={data.receipts} />
            )}
          </Card>
        </div>

        {/* Recent activity — no outer card wrapper; the receipt cards stand on their
            own. Show the latest 3, with a "See more" link into the full receipts page. */}
        <div className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">{sw.dashboard.recentTitle}</h3>
            <Link to="/receipts" className="text-sm font-medium text-role-admin hover:underline">
              See more →
            </Link>
          </div>
          {data.loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} lines={2} />)}
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="text-sm text-ink-muted">{sw.dashboard.noReceipts}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentActivity.map((r) => (
                <ReceiptCard
                  key={r.id}
                  receipt={r}
                  linkedToDuplicate={r.status === 'duplicate' || recentActivity.some((candidate) => candidate.duplicate_of === r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
