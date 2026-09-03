import { AlertTriangle, Check, CreditCard, MessageSquare, Receipt } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { billingBanner, useBilling, type Invoice, type Subscription } from '@/features/billing/useBilling';
import { formatDate, formatMoney } from '@/lib/format';
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

const t = sw.billing;

function StatusPill({ subscription }: { subscription: Subscription }) {
  const tone = {
    trialing: 'bg-amber-50 text-amber-800 ring-amber-200',
    active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    past_due: 'bg-amber-50 text-amber-800 ring-amber-200',
    suspended: 'bg-red-50 text-red-700 ring-red-200',
    cancelled: 'bg-surface-muted text-ink-muted ring-surface-border',
  }[subscription.status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
      {t.status[subscription.status]}
    </span>
  );
}

/**
 * The one banner that matters, or nothing at all.
 *
 * A page that warns about everything warns about nothing, so this shows at most
 * one thing and only when it is true. An active shop inside its period sees no
 * banner, which is the correct amount of noise for somebody who has paid.
 */
function Banner({ subscription }: { subscription: Subscription }) {
  // WHICH banner is decided in billingBanner, which is pure and tested against
  // all five statuses. This function only draws what that decided.
  const banner = billingBanner(subscription);
  if (banner.kind === 'suspended') {
    return (
      <Card className="border-red-200 bg-red-50">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-800">{t.suspendedTitle}</p>
            <p className="mt-1 text-sm text-red-700">{t.suspendedBody}</p>
          </div>
        </div>
      </Card>
    );
  }
  if (banner.kind === 'overdue') {
    const left = banner.daysLeft;
    return (
      <Card className="border-amber-200 bg-amber-50">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">{t.overdueTitle}</p>
            <p className="mt-1 text-sm text-amber-800">
              {left && left > 0 ? t.overdueDays(left) : t.overdueLastDay}
            </p>
          </div>
        </div>
      </Card>
    );
  }
  if (banner.kind === 'trial') {
    const left = banner.daysLeft;
    return (
      <Card className="border-amber-200 bg-amber-50">
        <div className="flex gap-3">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            {left === null ? t.trialTitle : t.trialDays(left)}
          </p>
        </div>
      </Card>
    );
  }
  return null;
}

function UsageBar({ used, allowance }: { used: number; allowance: number }) {
  const share = allowance > 0 ? Math.min(1, used / allowance) : 0;
  const over = used > allowance;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold tabular-nums text-ink">
          {used.toLocaleString('en-US')}
          <span className="font-normal text-ink-muted"> / {allowance.toLocaleString('en-US')}</span>
        </span>
        {over && <span className="text-xs font-semibold text-amber-700">{t.overBy(used - allowance)}</span>}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full ${over ? 'bg-amber-500' : 'bg-role-worker'}`}
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
      </div>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const tone = {
    paid: 'text-emerald-700',
    open: 'text-amber-700',
    failed: 'text-red-700',
    void: 'text-ink-muted',
  }[invoice.status];
  return (
    <tr className="border-t border-surface-border">
      <td className="py-3 pr-4 text-sm text-ink">
        {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
      </td>
      <td className="py-3 pr-4 text-sm capitalize text-ink-muted">{invoice.plan}</td>
      <td className="py-3 pr-4 text-right text-sm font-semibold tabular-nums text-ink">
        {formatMoney(invoice.amount_tzs)}
      </td>
      <td className={`py-3 text-right text-sm font-semibold ${tone}`}>
        {t.invoiceStatus[invoice.status]}
      </td>
    </tr>
  );
}

export default function BillingPage() {
  const { state } = useBilling();

  if (state.status === 'loading') {
    return <p className="text-sm text-ink-muted">{sw.common.loading}</p>;
  }
  if (state.status === 'error') {
    return <p className="text-sm text-red-700">{state.message}</p>;
  }

  const { subscription, invoices, usage, plans } = state;

  // No subscription is not an error and must not read like one. Every company
  // that existed before billing did is in exactly this state, and so is every
  // new one for the minutes before its trial row is written.
  if (!subscription) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
        <Card>
          <p className="text-sm text-ink-muted">{t.noSubscription}</p>
        </Card>
      </div>
    );
  }

  const plan = plans.find((p) => p.code === subscription.plan);
  const price = subscription.cycle === 'yearly' ? plan?.yearly_tzs : plan?.monthly_tzs;
  const openInvoice = invoices.find((i) => i.status === 'open');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.subtitle}</p>
      </div>

      <Banner subscription={subscription} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-ink-muted" />
              <CardTitle>{t.planTitle}</CardTitle>
            </div>
            <StatusPill subscription={subscription} />
          </div>
          <p className="text-2xl font-semibold text-ink">{plan?.name_sw ?? subscription.plan}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {formatMoney(price)} · {subscription.cycle === 'yearly' ? t.perYear : t.perMonth}
          </p>
          <dl className="mt-4 space-y-2 border-t border-surface-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t.paidUntil}</dt>
              <dd className="font-medium text-ink">{formatDate(subscription.current_period_end)}</dd>
            </div>
            {plan && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">{t.users}</dt>
                <dd className="font-medium text-ink">{plan.max_users}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-ink-muted" />
            <CardTitle>{t.usageTitle}</CardTitle>
          </div>
          {usage ? (
            <>
              <UsageBar used={usage.messages_used} allowance={usage.allowance} />
              <p className="mt-3 text-xs text-ink-muted">
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
          <p className="mt-4 border-t border-surface-border pt-3 text-xs text-ink-muted">
            {t.usageNote}
          </p>
        </Card>
      </div>

      {openInvoice && (
        <Card className="border-role-worker/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">{t.openTitle}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {t.openBody(formatMoney(openInvoice.amount_tzs), formatDate(openInvoice.period_start))}
              </p>
            </div>
            <p className="text-sm font-medium text-ink-muted">{t.payOnPhone}</p>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-ink-muted" />
          <CardTitle>{t.historyTitle}</CardTitle>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.historyEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="pb-2 pr-4 font-semibold">{t.colPeriod}</th>
                  <th className="pb-2 pr-4 font-semibold">{t.colPlan}</th>
                  <th className="pb-2 pr-4 text-right font-semibold">{t.colAmount}</th>
                  <th className="pb-2 text-right font-semibold">{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
