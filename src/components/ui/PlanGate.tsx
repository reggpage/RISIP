import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { getLang } from '@/lib/lang';
import { sw } from '@/i18n/sw';
import { usePlanCaps, type PlanCaps } from '@/features/billing/usePlanCaps';

// The lock overlay when a feature is not on this shop's plan.
// Keeps the page (or section) visible — the shopkeeper sees it exists —
// but every control behind it is disabled and a one-liner explains the gap.

function GateOverlay({ message }: { message: string }) {
  const gate = sw.planGate;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-surface/90 px-6 text-center backdrop-blur-sm">
      <Lock className="mb-2 h-5 w-5 text-ink-muted" />
      <p className="max-w-xs text-sm text-ink-muted">{message}</p>
      <Link to="/billing" className="mt-3 rounded-lg bg-role-admin px-4 py-2 text-xs font-semibold text-white hover:brightness-110">
        {gate.upgradePlan}
      </Link>
    </div>
  );
}

/**
 * Wraps a page or card with a plan gate. When the capability is true it
 * renders children normally. When false it shows the overlay.
 */
export default function PlanGate({
  capability,
  messageKey,
  children,
}: {
  capability: keyof PlanCaps;
  messageKey: keyof typeof sw.planGate;
  children: React.ReactNode;
}) {
  const { state } = usePlanCaps();
  const caps = state.status === 'ready' ? state.caps : null;
  // Fail open: if caps are still loading or errored, show the content.
  const allowed = caps === null ? true : Boolean(caps[capability]);
  if (allowed) return <>{children}</>;

  const lang = getLang() === 'sw' ? 'sw' : 'en';
  const message = lang === 'sw'
    ? (sw.planGate[messageKey] ?? sw.planGate.lockBarcode)
    : sw.planGate[messageKey];

  return (
    <div className="relative">
      <div className="pointer-events-none blur-[2px]">{children}</div>
      <GateOverlay message={message} />
    </div>
  );
}
