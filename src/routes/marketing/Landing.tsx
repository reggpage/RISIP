import { Link, Navigate } from 'react-router-dom';
import {
  Camera, Sparkles, FileText, Wallet, ScanLine, Mail, BarChart3,
  ShieldCheck, Check, ArrowRight,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { sw } from '@/i18n/sw';

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
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink sm:block">Vipengele</a>
            <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink sm:block">Bei</a>
            <Link to="/login"><Button variant="ghost">{sw.auth.login}</Button></Link>
            <Link to="/signup" className="hidden sm:block">
              <Button tint="admin">Fungua kampuni</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-role-admin/20 bg-role-admin/5 px-3 py-1 text-xs font-medium text-role-admin">
            <ShieldCheck className="h-3.5 w-3.5" /> Inasoma risiti za TRA kwa AI · Tanzania
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
              <Button variant="secondary" tint="admin" className="px-6 py-3 text-base">Fungua kampuni mpya</Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-muted">Jaribu bure kwa siku 4 · Hakuna kadi inayohitajika</p>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-surface py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-3 text-center text-2xl font-bold text-ink sm:text-3xl">Jinsi inavyofanya kazi</h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-ink-muted">Kutoka risiti ya karatasi hadi ripoti na ankara — hatua tatu tu.</p>
          <div className="grid gap-8 md:grid-cols-3">
            <Step n="1" icon={<Camera className="h-6 w-6" />} title="Piga picha au scan"
              body="Staff wanapiga picha risiti kwa simu, au unaupload ukurasa wa A4/A3/PDF wenye risiti nyingi." />
            <Step n="2" icon={<Sparkles className="h-6 w-6" />} title="AI inaisoma"
              body="AI inasoma vendor, tarehe, VAT, TIN, VRN na verification code — ikijua muundo wa risiti za TRA." />
            <Step n="3" icon={<FileText className="h-6 w-6" />} title="Ripoti + ankara"
              body="Matumizi yanafuatiliwa moja kwa moja, na unaweza kutengeneza ankara ya kidijitali kwa mteja." />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-10 text-center text-2xl font-bold text-ink sm:text-3xl">{sw.landing.featuresTitle}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard icon={<Sparkles className="h-6 w-6" />} title="AI OCR ya risiti za TRA"
              body="Inasoma risiti za Tanzania kwa usahihi — TIN ya tarakimu 9, VRN, verification code na VAT 18%." />
            <FeatureCard icon={<FileText className="h-6 w-6" />} title="Ankara za kidijitali"
              body="Tengeneza ankara, tuma link ya moja kwa moja kwa mteja, akubali au aulize — pamoja na ukaguzi." />
            <FeatureCard icon={<Wallet className="h-6 w-6" />} title="Petty cash"
              body="Gawa fedha za matumizi kwa staff, fuatilia salio, na zuia matumizi kupita bajeti." />
            <FeatureCard icon={<ScanLine className="h-6 w-6" />} title="Batch scan (A4/A3/PDF)"
              body="Scan ukurasa mmoja wenye risiti nyingi — AI inazitenganisha zote mara moja kwa review." />
            <FeatureCard icon={<Mail className="h-6 w-6" />} title="Scan-to-email"
              body="Printa yako ya ofisi inaweza kutuma scan moja kwa moja kwenye Risip kwa barua pepe ya kampuni." />
            <FeatureCard icon={<BarChart3 className="h-6 w-6" />} title="Dashboard + Excel"
              body="Ona matumizi kwa mchoro (siku/wiki/mwezi/mwaka), gawanya kwa kategoria, na export kwa Excel." />
          </div>
        </div>
      </section>

      {/* Compliance strip */}
      <section className="bg-surface py-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 text-center sm:flex-row sm:justify-around sm:text-left">
          <Trust icon={<ShieldCheck className="h-5 w-5" />} title="TRA verification" body="Inahifadhi verification code na TIN/VRN" />
          <Trust icon={<Check className="h-5 w-5" />} title="VAT 18%" body="Inazuia VAT kuzidi jumla (uzingatiaji)" />
          <Trust icon={<FileText className="h-5 w-5" />} title="Audit trail" body="Kila risiti ina ushahidi wa picha chanzo" />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-3 text-center text-2xl font-bold text-ink sm:text-3xl">Bei rahisi na wazi</h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-ink-muted">
            Jaribu bure kwa siku 4. Lipa kwa M-Pesa, Tigo Pesa au Airtel Money. Ghairi wakati wowote.
          </p>
          <div className="grid gap-6 lg:grid-cols-3">
            <PriceCard
              name="Mwanzo"
              price="TSh 39,000"
              period="/ mwezi"
              blurb="Kwa biashara ndogo zinazoanza."
              features={['Watumiaji 5', 'Miradi 2', 'Risiti 300 / mwezi', 'AI OCR + ankara', 'Petty cash', 'Dashboard + Excel']}
              cta="Anza sasa" to="/signup"
            />
            <PriceCard
              name="Biashara"
              price="TSh 99,000"
              period="/ mwezi"
              blurb="Kwa makampuni ya kati yanayokua."
              features={['Watumiaji 20', 'Miradi 15', 'Risiti 1,500 / mwezi', 'Batch scan (A4/A3/PDF)', 'Scan-to-email', 'Priority support']}
              cta="Anza sasa" to="/signup" popular
            />
            <PriceCard
              name="Enterprise"
              price="Custom"
              period=""
              blurb="Kwa makampuni makubwa."
              features={['Bila kikomo cha watumiaji/miradi', 'Risiti bila kikomo', 'Support ya kipaumbele', 'Onboarding ya kampuni', 'Mahitaji maalum']}
              cta="Wasiliana nasi" to="/signup"
            />
          </div>
          <p className="mt-8 text-center text-xs text-ink-muted">
            Bei ni kwa kila kampuni kwa mwezi. Miamala ya mobile money inaweza kuwa na ada ndogo ya mtoa huduma.
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

function Step({ n, icon, title, body }: { n: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="relative rounded-xl border border-surface-border bg-surface p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-role-admin/10 text-sm font-bold text-role-admin">{n}</span>
        <span className="text-role-admin">{icon}</span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 text-role-admin">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

function Trust({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-role-admin/10 text-role-admin">{icon}</span>
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-xs text-ink-muted">{body}</div>
      </div>
    </div>
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
          Maarufu
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
