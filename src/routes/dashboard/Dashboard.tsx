import { useState } from 'react';
import { Receipt, Users, FileText, Wallet } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import MetricCard from '@/components/dashboard/MetricCard';
import CategoryBar from '@/components/dashboard/CategoryBar';
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

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{sw.nav.dashboard}</h1>
        {activeProjects.length > 1 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              {sw.dashboard.filterProject}
            </label>
            <select
              className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">{sw.dashboard.allProjects}</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={sw.dashboard.metrics.totalExpenses}
          value={formatMoney(data.totalExpenses)}
          icon={<Wallet className="h-5 w-5" />}
          tint="admin"
        />
        <MetricCard
          label={sw.dashboard.metrics.receipts}
          value={data.confirmedCount}
          icon={<Receipt className="h-5 w-5" />}
          tint="worker"
        />
        <MetricCard
          label={sw.dashboard.metrics.activeWorkers}
          value={data.activeWorkers}
          icon={<Users className="h-5 w-5" />}
          tint="worker"
        />
        <MetricCard
          label={sw.dashboard.metrics.invoicesThisMonth}
          value={data.invoicesThisMonth}
          icon={<FileText className="h-5 w-5" />}
          tint="accountant"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>{sw.dashboard.categoryTitle}</CardTitle>
            </CardHeader>
            {data.categories.length === 0 ? (
              <EmptyState title={sw.dashboard.noReceipts} />
            ) : (
              <div className="flex flex-col gap-3">
                {data.categories.map((c) => (
                  <CategoryBar key={c.category} item={c} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{sw.dashboard.recentTitle}</CardTitle>
            </CardHeader>
            {data.recent.length === 0 ? (
              <p className="text-sm text-ink-muted">{sw.dashboard.noReceipts}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.recent.map((r) => (
                  <ReceiptCard key={r.id} receipt={r} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
