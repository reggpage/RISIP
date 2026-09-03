import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { billingBanner, useBilling, type Invoice, type Subscription } from '@/features/billing/useBilling';
import { subscriptionReceiptImage, receiptNumber } from '@/features/billing/subscriptionReceipt';
import { formatDate, formatMoney } from '@/lib/format';
import { getLang } from '@/lib/lang';
import { supabase } from '@/lib/supabase';
import { sw } from '@/i18n/sw';

// Where a shopkeeper finds out what he owes.
//
// THE ORDER IS THE ARGUMENT. A billing page that opens with a price is a page
// about taking money. This one opens with what the shop HAS: the plan it is on
// and the date it is paid up to. What is owed comes second, and only when
// something is actually owed.
//
// NOTHING HERE CHANGES ANYTHING. Every element is a read. Paying happens on the
// handset, because that is where mobile money lives, and a period is marked
// paid by a signed webhook and by nothing else. A button here that could grant
// a month would be a second way to grant one, and the second way is the one
// nobody tests.
//
// NO ICONS, and the page is held in a COLUMN. Both are the owner's call and
// both are right: a page about money reads better when the only marks on it
// are words and figures, and a statement stretched to the full width of a
// desktop leaves a card with one number marooned in white space. Rank comes
// from type size and from the rules between rows, which is how a printed
// statement has always done it.

const t = sw.billing;

/** The page never runs full-bleed. A statement is read, and reading needs a column. */
const COLUMN = 'mx-auto w-full max-w-4xl';

function StatusPill({ subscription }: { subscription: Subscription }) {
  const tone = {
    trialing: 'bg-amber-50 text-amber-800 ring-amber-200',
    active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    past_due: 'bg-amber-50 text-amber-800 ring-amber-200',
    suspended: 'bg-red-50 text-red-700 ring-red-200',
    cancelled: 'bg-surface-muted text-ink-muted ring-surface-border',
  }[subscription.status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
      {t.status[subscription.status]}
    </span>
  );
}

function Banner({ subscription }: { subscription: Subscription }) {
  // WHICH banner is decided in billingBanner, which is pure and tested against
  // all five statuses. This function only draws what that decided.
  const banner = billingBanner(subscription);
  if (banner.kind === 'none') return null;

  const look = banner.kind === 'suspended'
    ? { box: 'border-red-200 bg-red-50', head: 'text-red-800', body: 'text-red-700' }
    : { box: 'border-amber-200 bg-amber-50', head: 'text-amber-900', body: 'text-amber-800' };

  const title = banner.kind === 'suspended' ? t.suspendedTitle
    : banner.kind === 'overdue' ? t.overdueTitle
    : null;

  const body = banner.kind === 'suspended' ? t.suspendedBody
    : banner.kind === 'overdue'
      ? (banner.daysLeft && banner.daysLeft > 0 ? t.overdueDays(banner.daysLeft) : t.overdueLastDay)
      : (banner.daysLeft === null ? t.trialTitle : t.trialDays(banner.daysLeft));

  return (
    <Card className={`${look.box} p-4`}>
      {title && <p className={`text-sm font-semibold ${look.head}`}>{title}</p>}
      <p className={`text-sm ${look.body} ${title ? 'mt-1' : ''}`}>{body}</p>
    </Card>
  );
}

function UsageBar({ used, allowance }: { used: number; allowance: number }) {
  const share = allowance > 0 ? Math.min(1, used / allowance) : 0;
  const over = used > allowance;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-3xl font-semibold leading-none tabular-nums text-ink">
          {used.toLocaleString('en-US')}
          <span className="text-lg font-normal text-ink-muted"> / {allowance.toLocaleString('en-US')}</span>
        </p>
        {over && <span className="text-xs font-semibold text-amber-700">{t.overBy(used - allowance)}</span>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full ${over ? 'bg-amber-500' : 'bg-role-admin'}`}
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { state } = useBilling();
  const toast = useToast();
  const lang = getLang() === 'sw' ? 'sw' : 'en';
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The shop's own logo, so its receipt looks like its receipt. Optional in
  // every sense: a shop without one still gets a clean slip.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from('companies').select('logo_url, name').maybeSingle();
      if (!alive) return;
      const row = data as { logo_url?: string | null; name?: string | null } | null;
      setLogoUrl(row?.logo_url ?? null);
      setCompanyName(row?.name ?? null);
    })();
    return () => { alive = false; };
  }, []);

  // The shop's name for the slip. Read from the company row rather than from
  // the session, because that is where it is edited and where it is right.
  const businessName = companyName ?? 'Risip';

  async function downloadReceipt(invoice: Invoice, planName: string) {
    setBusy(invoice.id);
    try {
      const blob = await subscriptionReceiptImage(
        { businessName, planName, invoice, logoUrl }, lang,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${receiptNumber(invoice)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t.receiptFailed);
    } finally {
      setBusy(null);
    }
  }

  if (state.status === 'loading') {
    return <div className={COLUMN}><p className="text-sm text-ink-muted">{sw.common.loading}</p></div>;
  }
  if (state.status === 'error') {
    return <div className={COLUMN}><p className="text-sm text-red-700">{state.message}</p></div>;
  }

  const { subscription, invoices, usage, plans } = state;
  const nameOf = (code: string) => plans.find((p) => p.code === code)?.name_sw ?? code;

  // No subscription is not an error and must not read like one. Every company
  // that existed before billing did is in exactly this state.
  if (!subscription) {
    return (
      <div className={`${COLUMN} space-y-6`}>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.title}</h1>
        <Card><p className="text-sm text-ink-muted">{t.noSubscription}</p></Card>
      </div>
    );
  }

  const plan = plans.find((p) => p.code === subscription.plan);
  const price = subscription.cycle === 'yearly' ? plan?.yearly_tzs : plan?.monthly_tzs;
  const openInvoice = invoices.find((i) => i.status === 'open');

  return (
    <div className={`${COLUMN} space-y-8 pb-16`}>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.subtitle}</p>
      </header>

      <Banner subscription={subscription} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="flex flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
              {t.planTitle}
            </p>
            <StatusPill subscription={subscription} />
          </div>
          <p className="mt-4 text-3xl font-semibold leading-none text-ink">
            {plan?.name_sw ?? subscription.plan}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {formatMoney(price)} · {subscription.cycle === 'yearly' ? t.perYear : t.perMonth}
          </p>
          <dl className="mt-6 space-y-3 border-t border-surface-border pt-5 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-muted">{t.paidUntil}</dt>
              <dd className="font-medium tabular-nums text-ink">
                {formatDate(subscription.current_period_end)}
              </dd>
            </div>
            {plan && (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-muted">{t.users}</dt>
                  <dd className="font-medium tabular-nums text-ink">{plan.max_users}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-muted">{t.allowance}</dt>
                  <dd className="font-medium tabular-nums text-ink">
                    {plan.message_allowance.toLocaleString('en-US')}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </Card>

        <Card className="flex flex-col p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            {t.usageTitle}
          </p>
          <div className="mt-4">
            {usage ? (
              <>
                <UsageBar used={usage.messages_used} allowance={usage.allowance} />
                <p className="mt-3 text-xs tabular-nums text-ink-muted">
                  {t.usagePeriod(formatDate(usage.period_start), formatDate(usage.period_end))}
                </p>
                {usage.consecutive_over > 0 && (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    {t.consecutiveOver(usage.consecutive_over)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-muted">{t.usageEmpty}</p>
            )}
          </div>
          <p className="mt-auto border-t border-surface-border pt-5 text-xs leading-relaxed text-ink-muted">
            {t.usageNote}
          </p>
        </Card>
      </div>

      {openInvoice && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-role-admin/30 p-6">
          <div>
            <p className="text-sm font-semibold text-ink">{t.openTitle}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {t.openBody(formatMoney(openInvoice.amount_tzs), formatDate(openInvoice.period_start))}
            </p>
          </div>
          <p className="text-sm font-medium text-role-admin">{t.payOnPhone}</p>
        </Card>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          {t.historyTitle}
        </h2>
        <Card className="mt-3 overflow-hidden p-0">
          {invoices.length === 0 ? (
            <p className="p-6 text-sm text-ink-muted">{t.historyEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-left text-xs uppercase tracking-widest text-ink-muted">
                    <th className="px-6 py-3 font-semibold">{t.colPeriod}</th>
                    <th className="px-6 py-3 font-semibold">{t.colPlan}</th>
                    <th className="px-6 py-3 text-right font-semibold">{t.colAmount}</th>
                    <th className="px-6 py-3 text-right font-semibold">{t.colStatus}</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-surface-border last:border-0">
                      <td className="px-6 py-4 tabular-nums text-ink">
                        {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                      </td>
                      <td className="px-6 py-4 text-ink-muted">{nameOf(invoice.plan)}</td>
                      <td className="px-6 py-4 text-right font-semibold tabular-nums text-ink">
                        {formatMoney(invoice.amount_tzs)}
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-semibold ${{
                          paid: 'text-emerald-700',
                          open: 'text-amber-700',
                          failed: 'text-red-700',
                          void: 'text-ink-muted',
                        }[invoice.status]}`}
                      >
                        {t.invoiceStatus[invoice.status]}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {/* Only a PAID period has a receipt. A slip for a bill
                            nobody has settled would be a claim we cannot back. */}
                        {invoice.status === 'paid' && (
                          <Button
                            variant="secondary"
                            onClick={() => void downloadReceipt(invoice, nameOf(invoice.plan))}
                            disabled={busy === invoice.id}
                          >
                            {busy === invoice.id ? sw.common.loading : t.receipt}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
