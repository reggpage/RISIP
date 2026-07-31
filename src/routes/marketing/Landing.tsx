import { Link, Navigate } from 'react-router-dom';
import { Camera, Sparkles, FileText, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { sw } from '@/i18n/sw';

export default function Landing() {
  const auth = useAuth();

  // If they're already signed in, drop them straight into the app.
  if (auth.status === 'signed-in' && auth.profile) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-role-admin/5 via-surface-muted to-role-worker/5">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-surface-border/60 bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-xl font-bold tracking-tight text-role-admin">
            Risip
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost">{sw.auth.login}</Button>
            </Link>
            <Link to="/signup">
              <Button tint="admin">{sw.auth.signupCompany}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl md:text-6xl">
            {sw.landing.heroTitle}{' '}
            <span className="text-role-admin">{sw.landing.heroTitleAccent}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-muted sm:text-xl">
            {sw.landing.heroLead}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup">
              <Button tint="admin" className="px-6 py-3 text-base">
                {sw.landing.ctaPrimary}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" tint="admin" className="px-6 py-3 text-base">
                {sw.landing.ctaSecondary}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-surface py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-10 text-center text-2xl font-bold text-ink sm:text-3xl">
            {sw.landing.featuresTitle}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard
              tint="worker"
              icon={<Camera className="h-6 w-6" />}
              title={sw.landing.features.capture.title}
              body={sw.landing.features.capture.body}
            />
            <FeatureCard
              tint="admin"
              icon={<Sparkles className="h-6 w-6" />}
              title={sw.landing.features.ai.title}
              body={sw.landing.features.ai.body}
            />
            <FeatureCard
              tint="accountant"
              icon={<FileText className="h-6 w-6" />}
              title={sw.landing.features.invoices.title}
              body={sw.landing.features.invoices.body}
            />
          </div>
        </div>
      </section>

      {/* CTA section */}
      <section className="bg-gradient-to-br from-role-admin to-role-admin/80 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center text-white sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-3xl">{sw.landing.ctaSectionTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/85 sm:text-lg">
            {sw.landing.ctaSectionBody}
          </p>
          <div className="mt-8">
            <Link to="/signup">
              <Button
                className="border border-white bg-white px-6 py-3 text-base text-role-admin hover:bg-white/90"
              >
                {sw.landing.ctaPrimary}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-ink py-10 text-white/80">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm sm:px-6 lg:px-8">
          <div className="mb-2 text-lg font-bold text-white">Risip</div>
          <p>{sw.landing.footerTagline}</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  tint,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tint: 'worker' | 'accountant' | 'admin';
}) {
  const bg =
    tint === 'worker' ? 'bg-role-worker/10 text-role-worker'
    : tint === 'accountant' ? 'bg-role-accountant/10 text-role-accountant'
    : 'bg-role-admin/10 text-role-admin';
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}
