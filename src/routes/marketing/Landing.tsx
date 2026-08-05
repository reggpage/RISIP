import { Link, Navigate } from 'react-router-dom';
import {
  Camera, Sparkles, FileText, Wallet, ScanLine,
  ShieldCheck, Check, ArrowRight,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { sw } from '@/i18n/sw';
import receiptScanImage from '@/assets/landing-receipt-scan.jpg';

export default function Landing() {
  const auth = useAuth();

  if (auth.status === 'signed-in' && auth.profile) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-role-admin/5 via-surface-muted to-role-worker/5">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-surface-border/60 bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-xl font-bold tracking-tight text-role-admin">Risip</Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink sm:block">Features</a>
            <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink sm:block">Pricing</a>
            <Link to="/login"><Button variant="ghost">{sw.auth.login}</Button></Link>
            <Link to="/signup" className="hidden sm:block">
              <Button tint="admin">Create company</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-role-admin/20 bg-role-admin/5 px-3 py-1 text-xs font-medium text-role-admin">
            <ShieldCheck className="h-3.5 w-3.5" /> AI-powered TRA receipt reading · Tanzania
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl md:text-6xl">
            {sw.landing.heroTitle}{' '}
            <span className="text-role-admin">{sw.landing.heroTitleAccent}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-muted sm:text-xl">
            {sw.landing.heroLead}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/find-company">
              <Button tint="admin" className="px-6 py-3 text-base">{sw.landing.ctaPrimary}</Button>
            </Link>
            <Link to="/signup" className="hidden sm:block">
              <Button variant="secondary" tint="admin" className="px-6 py-3 text-base">Create a new company</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-surface py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-3 text-center text-2xl font-bold text-ink sm:text-3xl">How it works</h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-ink-muted">From a paper receipt to reports and invoices — in three steps.</p>
          <div className="grid gap-8 md:grid-cols-3">
            <Step icon={<Camera className="h-6 w-6" />} title="Snap or scan"
              body="Staff photograph receipts on their phone, or you upload an A4/A3/PDF page holding several receipts." />
            <Step icon={<Sparkles className="h-6 w-6" />} title="AI reads it"
              body="The AI extracts vendor, date, VAT, TIN, VRN and the verification code — trained on Tanzanian TRA receipts." />
            <Step icon={<FileText className="h-6 w-6" />} title="Reports & invoices"
              body="Spend is tracked automatically, and you can generate a digital invoice to send to your client." />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FeatureOrbitSection />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-3 text-center text-2xl font-bold text-ink sm:text-3xl">Simple, transparent pricing</h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-ink-muted">
            Pay with M-Pesa, Tigo Pesa or Airtel Money. Cancel anytime.
          </p>
          <div className="grid gap-6 lg:grid-cols-3">
            <PriceCard
              name="Starter"
              price="TSh 39,000"
              period="/ month"
              blurb="For small businesses getting started."
              features={['5 users', '2 projects', '300 receipts / month', 'AI OCR + invoices', 'Petty cash', 'Dashboard + Excel']}
              cta="Get started" to="/signup"
            />
            <PriceCard
              name="Business"
              price="TSh 99,000"
              period="/ month"
              blurb="For growing mid-size companies."
              features={['20 users', '15 projects', '1,500 receipts / month', 'Batch scan (A4/A3/PDF)', 'Scan-to-email', 'Priority support']}
              cta="Get started" to="/signup" popular
            />
            <PriceCard
              name="Enterprise"
              price="Custom"
              period=""
              blurb="For large firms."
              features={['Unlimited users/projects', 'Unlimited receipts', 'Priority support', 'Company onboarding', 'Custom requirements']}
              cta="Contact us" to="/signup"
            />
          </div>
          <p className="mt-8 text-center text-xs text-ink-muted">
            Prices are per company, per month. Mobile-money transactions may carry a small provider fee.
          </p>
        </div>
      </section>

      {/* CTA section */}
      <section className="bg-gradient-to-br from-role-admin to-role-admin/80 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center text-white sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-3xl">{sw.landing.ctaSectionTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/85 sm:text-lg">{sw.landing.ctaSectionBody}</p>
          <div className="mt-8">
            <Link to="/signup">
              <Button className="border border-white bg-white px-6 py-3 text-base font-semibold !text-role-admin hover:bg-white/90">
                {sw.landing.startNewLink}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface border-t border-surface-border py-10">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm sm:px-6 lg:px-8">
          <div className="mb-2 text-lg font-bold text-role-admin">Risip</div>
          <p className="text-ink">{sw.landing.footerTagline}</p>
        </div>
      </footer>
    </div>
  );
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="relative rounded-xl border border-surface-border bg-surface p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-role-admin">{icon}</span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

const orbitFeatures = [
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: 'TRA receipt OCR',
    body: 'Reads Tanzanian receipts accurately — TIN, VRN, verification code and VAT.',
    slot: 'one',
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: 'Digital invoices',
    body: 'Create invoices, send a live link, and keep a full approval history.',
    slot: 'two',
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    title: 'Petty cash',
    body: 'Allocate staff spending money, track balances, and prevent overspending.',
    slot: 'three',
  },
  {
    icon: <ScanLine className="h-5 w-5" />,
    title: 'Batch scan',
    body: 'Upload A4, A3, or PDF pages and split multiple receipts for review.',
    slot: 'four',
  },
];

function FeatureOrbitSection() {
  return (
    <>
      <style>{`
        @keyframes risipPulseLine {
          0%, 100% { opacity: .22; }
          45%, 65% { opacity: .75; }
        }

        @keyframes risipCardReveal {
          0%, 100% { opacity: .72; transform: translateY(6px); }
          45%, 65% { opacity: 1; transform: translateY(0); }
        }

        .risip-source-line {
          animation: risipPulseLine 8s ease-in-out infinite;
        }

        .risip-feature-card {
          animation: risipCardReveal 8s ease-in-out infinite;
        }

        .risip-delay-1 { animation-delay: 0s; }
        .risip-delay-2 { animation-delay: 1.2s; }
        .risip-delay-3 { animation-delay: 2.4s; }
        .risip-delay-4 { animation-delay: 3.6s; }
        .risip-delay-5 { animation-delay: 4.8s; }
        .risip-delay-6 { animation-delay: 6s; }

        @media (prefers-reduced-motion: reduce) {
          .risip-source-line,
          .risip-feature-card {
            animation: none;
          }
        }
      `}</style>

      <div className="mb-12 text-center">
        <h2 className="text-2xl font-bold text-ink sm:text-3xl">{sw.landing.featuresTitle}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
          A receipt enters once, then Risip connects the scan to projects, staff, claims, petty cash, invoices, and reports.
        </p>
      </div>

      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
          <div className="absolute inset-6 rounded-full border-[3px] border-dotted border-role-admin/30 bg-surface shadow-xl shadow-role-admin/5" />
          <div className="absolute inset-[13%] overflow-hidden rounded-full border border-white/80 bg-surface shadow-2xl">
            <img
              src={receiptScanImage}
              alt="Receipt scanning on a phone"
              className="h-full w-full object-cover"
            />
          </div>
          <span className="risip-source-line absolute left-[78%] top-[23%] hidden h-[3px] w-[32%] border-t-[3px] border-dotted border-role-admin/55 lg:block" />
          <span className="risip-source-line risip-delay-2 absolute left-[82%] top-[44%] hidden h-[3px] w-[28%] border-t-[3px] border-dotted border-role-admin/55 lg:block" />
          <span className="risip-source-line risip-delay-3 absolute left-[82%] top-[60%] hidden h-[3px] w-[28%] border-t-[3px] border-dotted border-role-admin/55 lg:block" />
          <span className="risip-source-line risip-delay-4 absolute left-[74%] top-[78%] hidden h-[3px] w-[36%] border-t-[3px] border-dotted border-role-admin/55 lg:block" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {orbitFeatures.map((feature, index) => (
            <div
              key={feature.title}
              className={[
                'risip-feature-card rounded-xl border border-surface-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
                `risip-delay-${index + 1}`,
              ].join(' ')}
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="text-role-admin">
                  {feature.icon}
                </span>
                <span className="h-px flex-1 rounded-full bg-role-admin/20" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-ink">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-ink-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PriceCard({
  name, price, period, blurb, features, cta, to, popular,
}: {
  name: string; price: string; period: string; blurb: string;
  features: string[]; cta: string; to: string; popular?: boolean;
}) {
  return (
    <div className={
      'relative flex flex-col rounded-2xl border bg-surface p-6 sm:p-8 ' +
      (popular ? 'border-role-admin shadow-lg ring-1 ring-role-admin/20' : 'border-surface-border')
    }>
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-role-admin px-3 py-1 text-xs font-semibold text-white">
          Popular
        </span>
      )}
      <h3 className="text-lg font-semibold text-ink">{name}</h3>
      <p className="mt-1 text-sm text-ink-muted">{blurb}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold text-ink">{price}</span>
        {period && <span className="text-sm text-ink-muted">{period}</span>}
      </div>
      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-ink">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-role-admin" /> {f}
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Link to={to}>
          <Button tint="admin" variant={popular ? 'primary' : 'secondary'} fullWidth className="justify-center">
            {cta} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
