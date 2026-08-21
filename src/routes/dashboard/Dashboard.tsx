import { useMemo, useState } from 'react';
import { ArrowLeftRight, CreditCard, FileText, HandCoins, Receipt, TrendingUp, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import StaffDashboard from '@/routes/dashboard/StaffDashboard';
import { useAuth } from '@/lib/auth';
import Button from '@/components/ui/Button';
import { navVisible } from '@/lib/nav';
import { getLang, type LangCode } from '@/lib/lang';
import { sw } from '@/i18n/sw';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import MetricCard from '@/components/dashboard/MetricCard';
import SpendByCategory from '@/components/dashboard/SpendByCategory';
import SpendTrendChart from '@/components/dashboard/SpendTrendChart';
import DailyRecordsTrendChart from '@/components/dashboard/DailyRecordsTrendChart';
import DailyRecordCategoryBars from '@/components/dashboard/DailyRecordCategoryBars';
import ReceiptCard from '@/components/receipts/ReceiptCard';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { CategoryBarSkeleton, ListItemSkeleton, MetricCardSkeleton } from '@/components/ui/Skeleton';
import { useDashboardData } from '@/features/dashboard/useDashboardData';
import { useProjects } from '@/features/projects/useProjects';
import { getDailyRecordSummary, useDailyRecords } from '@/features/dailyRecords/dailyRecords';
import { formatMoney } from '@/lib/format';

const copy: Record<LangCode, {
  project: string; daily: string; spend: string; todaySales: string; todayExpenses: string; debt: string; payments: string; cash: string;
  dailyOnly: string; receiptSeparate: string; debtHint: string; paymentHint: string; cashHint: string; recordsLink: string;
}> = {
  en: { project: 'Project Dashboard', daily: 'Daily Records', spend: 'Spend Trend', todaySales: 'Today’s Sales', todayExpenses: 'Today’s Expenses', debt: 'Debt Issued / Open Debts', payments: 'Customer Payments', cash: 'Cash Movement Estimate', dailyOnly: 'Daily records only', receiptSeparate: 'Separate from receipt expenses', debtHint: 'Debt issued is not cash received', paymentHint: 'Does not create sales', cashHint: 'Sales + payments − daily expenses', recordsLink: 'View' },
  sw: { project: 'Dashibodi ya Mradi', daily: 'Rekodi za Siku', spend: 'Mwelekeo wa Matumizi', todaySales: 'Mauzo ya Leo', todayExpenses: 'Matumizi ya Leo', debt: 'Mkopo Uliotolewa / Madeni', payments: 'Malipo ya Wateja', cash: 'Makadirio ya Mtiririko wa Fedha', dailyOnly: 'Rekodi za siku pekee', receiptSeparate: 'Zimetenganishwa na matumizi ya risiti', debtHint: 'Mkopo si fedha iliyopokelewa', paymentHint: 'Haiundi mauzo', cashHint: 'Mauzo + malipo − matumizi ya siku', recordsLink: 'Ona' },
};

export default function Dashboard() {
  const auth = useAuth();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  // A shop has no receipts to chase and no projects to file them against, so
  // the staff dashboard — which is entirely about both — is not what a worker
  // at a counter should be shown. See lib/nav.ts for why those are off.
  if (role && role !== 'owner' && role !== 'accountant') {
    return navVisible('receipts') ? <StaffDashboard /> : <ShopDashboard />;
  }
  return <CompanyDashboard />;
}

/** What a worker in a shop sees: today's takings, and the two things they do. */
function ShopDashboard() {
  const lang = getLang();
  const text = copy[lang];
  const dailyRecords = useDailyRecords();
  const dailySummary = getDailyRecordSummary(dailyRecords.records);
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="mb-5 text-2xl font-semibold text-ink">{sw.nav.dashboard}</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link to="/sell"><Button tint="admin">{lang === 'sw' ? 'Uza kwa scan' : 'Sell by scan'}</Button></Link>
        <Link to="/products"><Button variant="secondary">{lang === 'sw' ? 'Bidhaa' : 'Products'}</Button></Link>
      </div>
      <DailyDashboardContent dailyRecords={dailyRecords} dailySummary={dailySummary} text={text} lang={lang} />
    </div>
  );
}

function CompanyDashboard() {
  const lang = getLang();
  const text = copy[lang];
  const { state: projectsState } = useProjects();
  const [projectId, setProjectId] = useState('');
  // With projects and receipts off, there is only one dashboard and no reason
  // to make somebody choose it from a tab bar.
  const projectsOn = navVisible('projects') || navVisible('receipts');
  const [dashboardTab, setDashboardTab] = useState<'project' | 'daily'>(projectsOn ? 'project' : 'daily');
  const data = useDashboardData(projectId || undefined);
  const dailyRecords = useDailyRecords();
  const dailySummary = getDailyRecordSummary(dailyRecords.records);
  const activeProjects = projectsState.status === 'ready' ? projectsState.projects.filter((project) => project.status === 'active') : [];
  const recentActivity = useMemo(() => {
    const visible = data.recent.slice(0, 3);
    const duplicate = visible.find((receipt) => receipt.status === 'duplicate' && receipt.duplicate_of);
    const original = duplicate?.duplicate_of ? data.recent.find((receipt) => receipt.id === duplicate.duplicate_of) : null;
    if (original && !visible.some((receipt) => receipt.id === original.id)) visible.push(original);
    return visible;
  }, [data.recent]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{sw.nav.dashboard}</h1>
        {projectsOn && dashboardTab === 'project' && activeProjects.length > 1 && <div className="min-w-[220px]"><Select label={sw.dashboard.filterProject} value={projectId} onChange={setProjectId} placeholder={sw.dashboard.allProjects} options={[{ value: '', label: sw.dashboard.allProjects }, ...activeProjects.map((project) => ({ value: project.id, label: project.name }))]} /></div>}
      </div>

      {projectsOn ? <UnderlineTabs
        className="mb-6"
        tabs={[{ value: 'project', label: text.project }, { value: 'daily', label: text.daily }]}
        value={dashboardTab}
        onChange={setDashboardTab}
        label={lang === 'sw' ? 'Aina ya dashibodi' : 'Dashboard view'}
      /> : null}

      {projectsOn && dashboardTab === 'project' ? (
        <ProjectDashboardContent data={data} recentActivity={recentActivity} />
      ) : (
        <DailyDashboardContent dailyRecords={dailyRecords} dailySummary={dailySummary} text={text} lang={lang} />
      )}
    </div>
  );
}

function ProjectDashboardContent({ data, recentActivity }: { data: ReturnType<typeof useDashboardData>; recentActivity: ReturnType<typeof useDashboardData>['recent'] }) {
  return <>
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.loading ? Array.from({ length: 4 }).map((_, index) => <MetricCardSkeleton key={index} />) : <>
        <MetricCard label={sw.dashboard.metrics.totalExpenses} value={formatMoney(data.totalExpenses)} icon={<Wallet className="h-5 w-5" />} />
        <MetricCard label={sw.dashboard.metrics.receipts} value={data.confirmedCount} icon={<Receipt className="h-5 w-5" />} />
        <MetricCard label={sw.dashboard.metrics.activeWorkers} value={data.activeWorkers} icon={<Users className="h-5 w-5" />} />
        <MetricCard label={sw.dashboard.metrics.invoicesThisMonth} value={data.invoicesThisMonth} icon={<FileText className="h-5 w-5" />} />
      </>}
    </div>

    <Card className="mb-6"><CardHeader><CardTitle>{getLang() === 'sw' ? 'Mwelekeo wa Matumizi' : 'Spend Trend'}</CardTitle></CardHeader>{data.loading ? <div className="h-36 w-full animate-pulse rounded-lg bg-surface-muted" /> : <SpendTrendChart receipts={data.receipts} />}</Card>

    <div className="grid gap-6 lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-3"><Card>{data.loading ? <div className="flex flex-col gap-3 pb-2">{Array.from({ length: 4 }).map((_, index) => <CategoryBarSkeleton key={index} />)}</div> : <SpendByCategory receipts={data.receipts} />}</Card></div>
      <div className="min-w-0 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-ink">{sw.dashboard.recentTitle}</h3>{navVisible('receipts') ? <Link to="/receipts" className="text-sm font-medium text-role-admin hover:underline">{getLang() === 'sw' ? 'Zaidi' : 'See more'}</Link> : null}</div>
        {data.loading ? <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, index) => <ListItemSkeleton key={index} lines={2} />)}</div> : recentActivity.length === 0 ? <p className="text-sm text-ink-muted">{sw.dashboard.noReceipts}</p> : <div className="flex flex-col gap-2">{recentActivity.map((receipt) => <ReceiptCard key={receipt.id} receipt={receipt} linkedToDuplicate={receipt.status === 'duplicate' || recentActivity.some((candidate) => candidate.duplicate_of === receipt.id)} />)}</div>}
      </div>
    </div>
  </>;
}

function DailyDashboardContent({ dailyRecords, dailySummary, text, lang }: { dailyRecords: ReturnType<typeof useDailyRecords>; dailySummary: ReturnType<typeof getDailyRecordSummary>; text: typeof copy.en; lang: LangCode }) {
  return <section aria-label={text.daily}>
    <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-base font-semibold text-ink">{text.daily}</h2><p className="text-xs text-ink-muted">{text.receiptSeparate} · {text.dailyOnly}</p></div><Link to="/daily-records" className="text-sm font-medium text-role-admin hover:underline">{text.recordsLink}</Link></div>
    {dailyRecords.status === 'loading' && dailyRecords.records.length === 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <MetricCardSkeleton key={index} />)}</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <MetricCard label={text.todaySales} value={formatMoney(dailySummary.sales)} icon={<TrendingUp className="h-5 w-5" />} hint={text.dailyOnly} />
      <MetricCard label={text.todayExpenses} value={formatMoney(dailySummary.expenses)} icon={<Wallet className="h-5 w-5" />} hint={text.receiptSeparate} />
      <MetricCard label={text.debt} value={formatMoney(dailySummary.debtIssued)} icon={<HandCoins className="h-5 w-5" />} hint={text.debtHint} />
      <MetricCard label={text.payments} value={formatMoney(dailySummary.customerPayments)} icon={<CreditCard className="h-5 w-5" />} hint={text.paymentHint} />
      <MetricCard label={text.cash} value={formatMoney(dailySummary.cashMovement)} icon={<ArrowLeftRight className="h-5 w-5" />} hint={text.cashHint} />
    </div>}
    <Card className="mt-6"><DailyRecordsTrendChart records={dailyRecords.records} lang={lang} /></Card>
    <Card className="mt-6"><DailyRecordCategoryBars records={dailyRecords.records} /></Card>
  </section>;
}
