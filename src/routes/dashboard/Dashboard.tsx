import { useMemo, useState } from 'react';
import StaffDashboard from '@/routes/dashboard/StaffDashboard';
import { useAuth } from '@/lib/auth';
import { Link } from 'react-router-dom';
import { Receipt, Users, FileText, Wallet, TrendingUp, CreditCard, HandCoins, ArrowLeftRight } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { CategoryBarSkeleton, ListItemSkeleton, MetricCardSkeleton } from '@/components/ui/Skeleton';
import Select from '@/components/ui/Select';
import MetricCard from '@/components/dashboard/MetricCard';
import SpendByCategory from '@/components/dashboard/SpendByCategory';
import SpendTrendChart from '@/components/dashboard/SpendTrendChart';
import DailyRecordsTrendChart from '@/components/dashboard/DailyRecordsTrendChart';
import DailyRecordCategoryBars from '@/components/dashboard/DailyRecordCategoryBars';
import ReceiptCard from '@/components/receipts/ReceiptCard';
import { useDashboardData } from '@/features/dashboard/useDashboardData';
import { useProjects } from '@/features/projects/useProjects';
import { formatMoney } from '@/lib/format';
import { sw } from '@/i18n/sw';
import { getLang } from '@/lib/lang';
import { getDailyRecordSummary, useDailyRecords } from '@/features/dailyRecords/dailyRecords';

export default function Dashboard() {
  const auth = useAuth();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  // Staff never see company figures. Returning early also means the company-wide
  // queries below are never issued for them — the database would refuse the
  // interesting parts anyway (migration 0060), but there is no reason to ask.
  if (role && role !== 'owner' && role !== 'accountant') return <StaffDashboard />;
  return <CompanyDashboard />;
}

function CompanyDashboard() {
  const { state: projectsState } = useProjects();
  const [projectId, setProjectId] = useState<string>('');
  const data = useDashboardData(projectId || undefined);
  const dailyRecords = useDailyRecords();
  const dailySummary = getDailyRecordSummary(dailyRecords.records);
  const [chartTab, setChartTab] = useState<'daily' | 'spend'>('daily');
  const [mobileDetail, setMobileDetail] = useState<'receipts' | 'daily'>('receipts');
  const dailyTitle = getLang() === 'sw' ? 'Rekodi za Siku' : 'Daily Records';

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

      <div className="mb-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Today’s daily records</h2>
            <p className="text-xs text-ink-muted">Separate from receipt expenses · confirmed records only</p>
          </div>
          <Link to="/daily-records" className="text-sm font-medium text-role-admin hover:underline">View records</Link>
        </div>
        {dailyRecords.status === 'loading' && dailyRecords.records.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <MetricCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Today sales" value={formatMoney(dailySummary.sales)} icon={<TrendingUp className="h-5 w-5" />} hint="Daily records only" />
            <MetricCard label="Today expenses" value={formatMoney(dailySummary.expenses)} icon={<Wallet className="h-5 w-5" />} hint="Not receipt expenses" />
            <MetricCard label="Open debts / debt issued" value={formatMoney(dailySummary.debtIssued)} icon={<HandCoins className="h-5 w-5" />} hint="Confirmed debt issued" />
            <MetricCard label="Customer payments" value={formatMoney(dailySummary.customerPayments)} icon={<CreditCard className="h-5 w-5" />} hint="Does not create sales" />
            <MetricCard label="Cash movement estimate" value={formatMoney(dailySummary.cashMovement)} icon={<ArrowLeftRight className="h-5 w-5" />} hint="Sales + payments − daily expenses" />
          </div>
        )}
      </div>

      {/* Dashboard charts deliberately keep daily operational records and receipt
          spend in separate tabs and data streams. */}
      <Card className="mb-6">
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-surface-border bg-surface-muted p-1" role="tablist" aria-label="Dashboard charts">
          <button type="button" role="tab" aria-selected={chartTab === 'daily'} onClick={() => setChartTab('daily')} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${chartTab === 'daily' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}>{dailyTitle}</button>
          <button type="button" role="tab" aria-selected={chartTab === 'spend'} onClick={() => setChartTab('spend')} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${chartTab === 'spend' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}>Spend Trend</button>
        </div>
        {chartTab === 'daily' ? <DailyRecordsTrendChart records={dailyRecords.records} /> : data.loading ? <div className="h-36 w-full animate-pulse rounded-lg bg-surface-muted" /> : <SpendTrendChart receipts={data.receipts} />}
      </Card>

      <div className="mb-4 flex items-center gap-1 rounded-lg border border-surface-border bg-surface-muted p-1 lg:hidden" role="tablist" aria-label="Dashboard detail">
        <button type="button" role="tab" aria-selected={mobileDetail === 'receipts'} onClick={() => setMobileDetail('receipts')} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mobileDetail === 'receipts' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}>Receipts</button>
        <button type="button" role="tab" aria-selected={mobileDetail === 'daily'} onClick={() => setMobileDetail('daily')} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mobileDetail === 'daily' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}>{dailyTitle}</button>
      </div>

      <div className={`grid gap-6 lg:grid-cols-5 ${mobileDetail === 'daily' ? '' : ''}`}>
        <div className="min-w-0 lg:col-span-3">
          <Card className={mobileDetail === 'receipts' ? '' : 'hidden lg:block'}>
            {data.loading ? (
              <div className="flex flex-col gap-3 pb-2">
                {Array.from({ length: 4 }).map((_, i) => <CategoryBarSkeleton key={i} />)}
              </div>
            ) : (
              <SpendByCategory receipts={data.receipts} />
            )}
          </Card>
          <Card className={mobileDetail === 'daily' ? 'lg:hidden' : 'hidden'}>
            <CardHeader><CardTitle>{dailyTitle}</CardTitle></CardHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Sales" value={formatMoney(dailySummary.sales)} icon={<TrendingUp className="h-5 w-5" />} hint="Confirmed daily records" />
              <MetricCard label="Daily expenses" value={formatMoney(dailySummary.expenses)} icon={<Wallet className="h-5 w-5" />} hint="Separate from receipt expenses" />
              <MetricCard label="Debt issued" value={formatMoney(dailySummary.debtIssued)} icon={<HandCoins className="h-5 w-5" />} hint="Not cash received" />
              <MetricCard label="Customer payments" value={formatMoney(dailySummary.customerPayments)} icon={<CreditCard className="h-5 w-5" />} hint="Does not create sales" />
              <MetricCard label="Cash movement estimate" value={formatMoney(dailySummary.cashMovement)} icon={<ArrowLeftRight className="h-5 w-5" />} hint="Sales + payments − daily expenses" />
            </div>
            <div className="mt-5"><DailyRecordsTrendChart records={dailyRecords.records} /></div>
            <div className="mt-6"><DailyRecordCategoryBars records={dailyRecords.records} /></div>
          </Card>
        </div>

        {/* Recent activity — no outer card wrapper; the receipt cards stand on their
            own. Show the latest 3, with a "See more" link into the full receipts page. */}
        <div className={`min-w-0 lg:col-span-2 ${mobileDetail === 'daily' ? 'hidden lg:block' : ''}`}>
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
