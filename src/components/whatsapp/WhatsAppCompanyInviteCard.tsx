import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import WhatsappIcon from '@/components/ui/WhatsappIcon';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import {
  buildCompanyInviteShareText,
  createCompanyInviteCode,
  getActiveCompanyRole,
  risipWhatsAppStartUrl,
  type CompanyInviteRole,
} from '@/features/whatsapp/companyInvites';

type Props = { companyName: string };

const COPY = {
  en: {
    title: 'Invite staff on WhatsApp',
    description: 'Create a role-bound company code. The invited person registers from the official Risip WhatsApp number.',
    role: 'Role', worker: 'Worker', accountant: 'Accountant', expiry: 'Expires after', days: 'days', uses: 'Maximum uses',
    generate: 'Generate invite code', generating: 'Generating…', code: 'Invite code', copy: 'Copy code', copied: 'Copied', share: 'Share invite',
    security: 'Only owners can create codes. A code cannot grant ownership and it expires automatically.',
    success: 'Invite code created.', fallback: 'Could not create the invite code.',
  },
  sw: {
    title: 'Alika wafanyakazi kupitia WhatsApp',
    description: 'Tengeneza kodi ya kampuni yenye role maalum. Anayealikwa anajisajili kupitia namba rasmi ya WhatsApp ya Risip.',
    role: 'Wajibu', worker: 'Mfanyakazi', accountant: 'Mhasibu', expiry: 'Inaisha baada ya', days: 'siku', uses: 'Idadi ya matumizi',
    generate: 'Tengeneza kodi ya mwaliko', generating: 'Inatengeneza…', code: 'Kodi ya mwaliko', copy: 'Nakili kodi', copied: 'Imenakiliwa', share: 'Shiriki mwaliko',
    security: 'Owner pekee ndiye anayetengeneza kodi. Kodi haiwezi kutoa umiliki na inaisha muda kiotomatiki.',
    success: 'Kodi ya mwaliko imetengenezwa.', fallback: 'Imeshindikana kutengeneza kodi ya mwaliko.',
  },
} as const;

export default function WhatsAppCompanyInviteCard({ companyName }: Props) {
  const lang = getLang();
  const text = COPY[lang];
  const toast = useToast();
  const [role, setRole] = useState<CompanyInviteRole>('worker');
  const [days, setDays] = useState(14);
  const [maxUses, setMaxUses] = useState(1);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canInvite, setCanInvite] = useState(false);

  useEffect(() => {
    let active = true;
    void getActiveCompanyRole().then((activeRole) => {
      if (active) setCanInvite(activeRole === 'owner');
    });
    return () => { active = false; };
  }, [companyName]);

  async function generate() {
    setBusy(true);
    try {
      const next = await createCompanyInviteCode(role, days, maxUses);
      setCode(next);
      setCopied(false);
      toast.success(text.success);
    } catch (error) {
      toast.error(friendlyError(error, text.fallback));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(lang === 'sw' ? 'Imeshindikana kunakili kodi.' : 'Could not copy the code.');
    }
  }

  function shareInvite() {
    if (!code) return;
    const message = buildCompanyInviteShareText({ companyName, code, role, days, lang, startUrl: risipWhatsAppStartUrl() });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  if (!canInvite) return null;

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-role-admin/10 text-role-admin">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-ink">{text.title}</h3>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">{text.description}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          {text.role}
          <select value={role} onChange={(event) => { setRole(event.target.value as CompanyInviteRole); setCode(null); }} className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm">
            <option value="worker">{text.worker}</option>
            <option value="accountant">{text.accountant}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          {text.expiry}
          <select value={days} onChange={(event) => { setDays(Number(event.target.value)); setCode(null); }} className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm">
            {[7, 14, 30, 90].map((value) => <option key={value} value={value}>{value} {text.days}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          {text.uses}
          <input type="number" min={1} max={100} value={maxUses} onChange={(event) => { setMaxUses(Number(event.target.value)); setCode(null); }} className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="mt-5">
        <Button tint="admin" disabled={busy || maxUses < 1 || maxUses > 100} onClick={() => void generate()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? text.generating : text.generate}
        </Button>
      </div>

      {code && (
        <div className="mt-5 rounded-xl border border-role-admin/20 bg-role-admin/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{text.code}</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-[0.18em] text-ink" aria-label={text.code}>{code}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" tint="admin" onClick={() => void copyCode()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? text.copied : text.copy}
            </Button>
            <Button variant="secondary" tint="admin" onClick={shareInvite}>
              <WhatsappIcon className="h-4 w-4" />
              {text.share}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {text.security}
      </p>
    </Card>
  );
}
