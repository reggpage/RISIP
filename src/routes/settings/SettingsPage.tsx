import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Check, Copy, KeyRound, Languages, Lock, Mail, Printer, User, Users } from 'lucide-react';
import { getLang, setLang, LANG_OPTIONS, type LangCode } from '@/lib/lang';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import PasswordField from '@/components/ui/PasswordField';
import { CompanyProfileSkeleton, MemberRowSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import LogoCropModal from '@/components/settings/LogoCropModal';
import { useAuth, signOut } from '@/lib/auth';
import { roleLabel } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Company, Profile } from '@/types/db';
import { sw } from '@/i18n/sw';

// Pro-SaaS two-column settings layout: on md+ the section title & description sit in the
// left column, the actual form/card in the wider right column. On mobile it stacks.
function SettingsSection({
  icon,
  title,
  description,
  children,
  danger,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section className="grid gap-6 md:grid-cols-3 md:gap-10 py-10 first:pt-0">
      <div>
        <h2 className={`flex items-center gap-2 text-base font-semibold ${danger ? 'text-red-700' : 'text-ink'}`}>
          <span className={danger ? 'text-red-600' : 'text-ink-muted'}>{icon}</span>
          {title}
        </h2>
        <p className={`mt-2 text-sm leading-relaxed ${danger ? 'text-red-600' : 'text-ink-muted'}`}>
          {description}
        </p>
      </div>
      <div className="md:col-span-2">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const isOwner = profile?.role === 'owner';

  // ── User's own profile (any role can edit their own name/phone) ────────────
  const [myName, setMyName] = useState('');
  const [myPhone, setMyPhone] = useState('');
  const [savingMe, setSavingMe] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const emailSectionRef = useRef<HTMLElement | null>(null);

  // ── Company profile ────────────────────────────────────────────────────────
  const [company, setCompany] = useState<Company | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [hqLocation, setHqLocation] = useState('');
  const [sector, setSector] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ── Scanner / inbound-email integration ─────────────────────────────────────
  const [scannerSender, setScannerSender] = useState('');
  const [savingScanner, setSavingScanner] = useState(false);
  const [copiedInbox, setCopiedInbox] = useState(false);

  // ── Logo ───────────────────────────────────────────────────────────────────
  const logoInput = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // ── Members ────────────────────────────────────────────────────────────────
  const [members, setMembers] = useState<Profile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [busyMember, setBusyMember] = useState<string | null>(null);

  // ── Change personal password ───────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ── Staff shared password (owner only) ────────────────────────────────────
  const [staffPw, setStaffPw] = useState('');
  const [settingStaffPw, setSettingStaffPw] = useState(false);
  const [staffPwMsg, setStaffPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ── Delete company ─────────────────────────────────────────────────────────
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Hydrate the "Your profile" form fields whenever the auth profile changes.
  useEffect(() => {
    if (!profile) return;
    setMyName(profile.full_name ?? '');
    setMyPhone(profile.phone ?? '');
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmailVerified(Boolean(data.user?.email_confirmed_at));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('verify') !== 'email') return;
    window.setTimeout(() => {
      emailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, []);

  async function saveMyProfile() {
    if (!profile) return;
    const trimmedName = myName.trim();
    if (!trimmedName) {
      toast.error(sw.common.error);
      return;
    }
    setSavingMe(true);
    // RLS profiles_update_self only lets a user update their own row, so no server-side
    // authorization check needed here.
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: trimmedName, phone: myPhone.trim() || null })
      .eq('id', profile.id);
    setSavingMe(false);
    if (error) toast.error(error.message);
    else toast.success(sw.profileSection.saved);
  }

  useEffect(() => {
    if (!profile) return;
    const companyId = profile.company_id;

    supabase.from('companies').select('*').eq('id', companyId).single()
      .then(({ data, error }) => {
        setLoadingCompany(false);
        if (error || !data) return;
        const c = data as Company;
        setCompany(c);
        setCompanyName(c.name);
        setHqLocation(c.hq_location);
        setSector(c.sector ?? '');
        setLogoUrl(c.logo_url ?? null);
        setScannerSender(c.scanner_sender_email ?? '');
      });

    supabase.from('profiles').select('*').eq('company_id', companyId).order('role', { ascending: true })
      .then(({ data, error }) => {
        setLoadingMembers(false);
        if (error) setMembersError(error.message);
        else setMembers((data ?? []) as Profile[]);
      });
  }, [profile]);

  async function saveCompanyProfile() {
    if (!company || !isOwner) return;
    setSavingProfile(true);
    setProfileMsg(null);
    const { error } = await supabase.from('companies')
      .update({ name: companyName.trim(), hq_location: hqLocation.trim(), sector: sector.trim() || null })
      .eq('id', company.id);
    setSavingProfile(false);
    setProfileMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: sw.settings.saved });
  }

  // The company's unique scan-to-email inbox address. The Canon printer emails A3 scans
  // here; the inbound-email edge function files the receipts as "pending review".
  const scannerInbox = company ? `${company.scanner_inbox_token}@scan.risip.online` : '';

  async function copyInbox() {
    if (!scannerInbox) return;
    // Modern async clipboard, with the hidden-textarea fallback for HTTP/Safari.
    try {
      await navigator.clipboard.writeText(scannerInbox);
    } catch {
      const el = document.createElement('textarea');
      el.value = scannerInbox;
      el.setAttribute('readonly', '');
      el.style.cssText = 'position:absolute;left:-9999px;top:0;opacity:0';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch { /* user can long-press to copy */ }
      document.body.removeChild(el);
    }
    setCopiedInbox(true);
    window.setTimeout(() => setCopiedInbox(false), 1600);
  }

  async function saveScannerSender() {
    if (!company || !isOwner) return;
    setSavingScanner(true);
    const value = scannerSender.trim().toLowerCase() || null;
    const { error } = await supabase.from('companies')
      .update({ scanner_sender_email: value })
      .eq('id', company.id);
    setSavingScanner(false);
    if (error) toast.error(error.message);
    else {
      setCompany((c) => (c ? { ...c, scanner_sender_email: value } : c));
      toast.success('Scanner settings saved.');
    }
  }

  // Two-step logo flow: user picks a file → LogoCropModal opens → on Confirm we
  // upload the cropped blob (always JPEG, always at <company_id>/logo.jpg so the
  // storage RLS uuid parser doesn't choke on a bare filename with extension).
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);

  async function uploadCroppedLogo(blob: Blob) {
    if (!company || !isOwner) return;
    const path = `${company.id}/logo.jpg`;
    setUploadingLogo(true);
    setProfileMsg(null);
    try {
      const { error: uploadErr } = await supabase.storage.from('company-logos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadErr) {
        // Log the full error so the exact reason (RLS message / mime / size) shows in
        // devtools, not just the summary the toast displays.
        console.error('logo upload failed', uploadErr);
        throw uploadErr;
      }
      // Cache-bust so the header refreshes to the new logo immediately.
      const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path);
      const freshUrl = `${urlData.publicUrl}?v=${Date.now()}`;
      const { error: updateErr } = await supabase.from('companies')
        .update({ logo_url: freshUrl })
        .eq('id', company.id);
      if (updateErr) throw updateErr;
      setLogoUrl(freshUrl);
      setCompany((c) => (c ? { ...c, logo_url: freshUrl } : c));
      toast.success('Logo updated.');
      setPendingLogoFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleLogoFile(file: File | null) {
    if (!file || !company || !isOwner) return;
    setPendingLogoFile(file);
  }

  // "Edit" re-opens the crop modal on the CURRENT logo so the owner can re-scale/
  // reposition without re-picking a file. We fetch the stored logo as a File.
  async function editExistingLogo() {
    if (!logoUrl || !isOwner) return;
    try {
      const res = await fetch(logoUrl);
      const blob = await res.blob();
      setPendingLogoFile(new File([blob], 'logo.jpg', { type: blob.type || 'image/jpeg' }));
    } catch {
      // Fall back to picking a new file if the fetch fails (e.g. CORS).
      logoInput.current?.click();
    }
  }

  async function toggleDeactivation(member: Profile) {
    if (!isOwner || member.id === profile?.id) return;
    setBusyMember(member.id);
    const newVal = member.deactivated_at ? null : new Date().toISOString();
    const { error } = await supabase.from('profiles').update({ deactivated_at: newVal }).eq('id', member.id);
    if (!error) setMembers((ms) => ms.map((m) => (m.id === member.id ? { ...m, deactivated_at: newVal } : m)));
    setBusyMember(null);
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) return setPwMsg({ type: 'err', text: sw.auth.passwordMismatch });
    if (newPassword.length < 8) return setPwMsg({ type: 'err', text: sw.auth.passwordHint });
    setChangingPw(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPw(false);
    if (error) setPwMsg({ type: 'err', text: error.message });
    else {
      setPwMsg({ type: 'ok', text: sw.settings.passwordChanged });
      setNewPassword('');
      setConfirmPassword('');
    }
  }

  async function setStaffPassword() {
    if (staffPw.length < 6) return setStaffPwMsg({ type: 'err', text: 'Password must be at least 6 characters.' });
    setSettingStaffPw(true);
    setStaffPwMsg(null);
    const { error } = await supabase.rpc('set_company_password', { p_password: staffPw });
    setSettingStaffPw(false);
    if (error) setStaffPwMsg({ type: 'err', text: error.message });
    else {
      setStaffPwMsg({ type: 'ok', text: sw.settings.companyPasswordSet });
      setStaffPw('');
    }
  }

  async function deleteCompany() {
    if (!company || !isOwner) return;
    if (deleteInput.trim() !== company.name) return setDeleteError(sw.settings.deleteCompanyMismatch);
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { error } = await supabase.functions.invoke('delete-company', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      await signOut();
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : sw.common.error);
      setDeleting(false);
    }
  }


  if (auth.status === 'loading') {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="mb-8 h-8 w-32 animate-pulse rounded-lg bg-surface-muted" />
        <Card className="p-6 sm:p-8"><CompanyProfileSkeleton /></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-10">
      <header className="mb-4 border-b border-surface-border pb-6">
        <h1 className="text-3xl font-semibold text-ink">{sw.nav.settings}</h1>
        <p className="mt-2 text-sm text-ink-muted">{sw.settingsCopy.subtitle}</p>
      </header>

      <div className="divide-y divide-surface-border">
        <section ref={emailSectionRef}>
          <SettingsSection
            icon={<Mail className="h-4 w-4" />}
            title="Email verification"
            description="Verify your email so password resets, security notices, and supplier claim updates can reach the right person."
          >
            <Card className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">
                    {emailVerified ? 'Your email is verified' : 'Your email is not verified yet'}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    Verification protects account recovery and confirms where claim/payment notifications should be sent.
                  </p>
                </div>
                {emailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                    <Check className="h-4 w-4" /> Verified
                  </span>
                ) : (
                  <Button
                    tint="admin"
                    onClick={() => {
                      toast.info('Use the verification email from Risip, or request a fresh code from login/signup.');
                    }}
                  >
                    Why verify?
                  </Button>
                )}
              </div>
            </Card>
          </SettingsSection>
        </section>

        {/* ── Language (any role) ─────────────────────────────────────────── */}
        <SettingsSection
          icon={<Languages className="h-4 w-4" />}
          title={sw.settingsCopy.languageTitle}
          description={sw.settingsCopy.languageDesc}
        >
          <Card className="p-6 sm:p-8">
            <div className="flex flex-wrap gap-2">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => {
                    if (getLang() === opt.code) return;
                    setLang(opt.code as LangCode);
                    // Full reload — the dictionary is bundled at module init, so a
                    // hot swap wouldn't repaint children that read `sw` once.
                    window.location.reload();
                  }}
                  className={
                    'rounded-lg border px-4 py-2 text-sm font-medium transition ' +
                    (getLang() === opt.code
                      ? 'border-role-admin bg-role-admin/10 text-role-admin'
                      : 'border-surface-border text-ink hover:bg-surface-muted')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Card>
        </SettingsSection>

        {/* ── Your profile (self-edit for every role) ───────────────────────── */}
        <SettingsSection
          icon={<User className="h-4 w-4" />}
          title={sw.profileSection.title}
          description={sw.profileSection.desc}
        >
          <Card className="p-6 sm:p-8">
            <div className="flex flex-col gap-4">
              <Input
                label={sw.auth.fullName}
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
              />
              <Input
                label={sw.auth.phone}
                value={myPhone}
                onChange={(e) => setMyPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div className="mt-6">
              <Button tint="admin" disabled={savingMe || !profile} onClick={() => void saveMyProfile()}>
                {savingMe ? sw.common.loading : sw.profileSection.save}
              </Button>
            </div>
          </Card>
        </SettingsSection>

        {/* ── Company profile ─────────────────────────────────────────────── */}
        <SettingsSection
          icon={<Building2 className="h-4 w-4" />}
          title={sw.settings.companyProfile}
          description={sw.settingsCopy.companyProfileDesc}
        >
          <Card className="p-6 sm:p-8">
            {loadingCompany ? (
              <CompanyProfileSkeleton />
            ) : (
              <>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {logoUrl ? (
                      <img src={logoUrl} alt="logo" className="h-20 w-20 shrink-0 rounded-xl border border-surface-border object-contain" />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface-muted">
                        <Building2 className="h-8 w-8 text-ink-muted" />
                      </div>
                    )}
                    {isOwner && <p className="text-xs text-ink-muted">{sw.settings.logoHint}</p>}
                  </div>
                  {isOwner && (
                    <div className="flex shrink-0 gap-2">
                      {logoUrl ? (
                        <>
                          {/* Logo already set → Edit re-scales it, Change picks a new one. */}
                          <Button variant="secondary" tint="admin" disabled={uploadingLogo} onClick={() => void editExistingLogo()}>
                            Edit logo
                          </Button>
                          <Button variant="ghost" disabled={uploadingLogo} onClick={() => logoInput.current?.click()}>
                            Change
                          </Button>
                        </>
                      ) : (
                        <Button variant="secondary" tint="admin" disabled={uploadingLogo} onClick={() => logoInput.current?.click()}>
                          {uploadingLogo ? sw.common.loading : sw.settings.logoUpload}
                        </Button>
                      )}
                    </div>
                  )}
                  <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={(e) => void handleLogoFile(e.target.files?.[0] ?? null)} />
                </div>

                <div className="flex flex-col gap-5">
                  <Input label={sw.settings.companyName} value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!isOwner} />
                  <Input label={sw.settings.hqLocation} value={hqLocation} onChange={(e) => setHqLocation(e.target.value)} disabled={!isOwner} />
                  <Input label={sw.settings.sector} value={sector} onChange={(e) => setSector(e.target.value)} disabled={!isOwner} placeholder={sw.auth.sector} />
                </div>

                {profileMsg && (
                  <p className={`mt-4 text-sm ${profileMsg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{profileMsg.text}</p>
                )}

                {isOwner && (
                  <div className="mt-6">
                    <Button tint="admin" disabled={savingProfile} onClick={() => void saveCompanyProfile()}>
                      {savingProfile ? sw.common.loading : sw.settings.saveProfile}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </SettingsSection>

        {/* ── Scanner & Hardware Integration (owner) ──────────────────────── */}
        {isOwner && (
          <SettingsSection
            icon={<Printer className="h-4 w-4" />}
            title="Scanner & Hardware Integration"
            description="Let your office Canon printer email A3 scans straight into Risip. Scanned receipts arrive as “pending review” for your accountant to approve."
          >
            <Card className="p-6 sm:p-8">
              {/* Unique inbox address for this company's printer. */}
              <label className="mb-2 block text-sm font-medium text-ink">Your scanner inbox address</label>
              <div className="flex items-stretch gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-surface-border bg-surface-muted px-3 py-2">
                  <Mail className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className="truncate font-mono text-sm text-ink" title={scannerInbox}>
                    {scannerInbox || '—'}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  tint="admin"
                  className="shrink-0"
                  disabled={!scannerInbox}
                  onClick={() => void copyInbox()}
                >
                  {copiedInbox ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedInbox ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                On your Canon printer, add this address under “Scan to Email”, set page size to A3,
                and send the scan. Keep it private — anyone with this address can submit receipts.
              </p>

              <div className="my-6 h-px bg-surface-border" />

              {/* Authorized sender — optional hardening so only the printer can submit. */}
              <Input
                label="Authorized Scanner Sender Email"
                type="email"
                value={scannerSender}
                onChange={(e) => setScannerSender(e.target.value)}
                placeholder="office-printer@company.com"
              />
              <p className="mt-2 text-xs text-ink-muted">
                Optional. When set, Risip only accepts scans emailed from this exact address and
                ignores everything else. Leave blank to accept from any sender.
              </p>
              <div className="mt-5">
                <Button tint="admin" disabled={savingScanner} onClick={() => void saveScannerSender()}>
                  {savingScanner ? sw.common.loading : 'Save scanner settings'}
                </Button>
              </div>
            </Card>
          </SettingsSection>
        )}

        {/* ── Members ─────────────────────────────────────────────────────── */}
        <SettingsSection
          icon={<Users className="h-4 w-4" />}
          title={sw.settings.members}
          description={sw.settingsCopy.membersDesc}
        >
          <Card className="p-6 sm:p-8">
            {membersError && <div className="mb-3 text-sm text-red-600">{membersError}</div>}
            <ul className="flex flex-col divide-y divide-surface-border">
              {loadingMembers
                ? Array.from({ length: 3 }).map((_, i) => <MemberRowSkeleton key={i} />)
                : members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{m.full_name}</span>
                          {/* Colored role text, no pill background — lighter, cleaner list. */}
                          <span
                            className={
                              'text-xs font-medium ' +
                              (m.role === 'owner'
                                ? 'text-emerald-600'
                                : m.role === 'accountant'
                                  ? 'text-amber-600'
                                  : 'text-sky-600')
                            }
                          >
                            · {roleLabel[m.role]}
                          </span>
                          {m.deactivated_at && (
                            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                              {sw.settings.deactivated}
                            </span>
                          )}
                        </div>
                        {m.phone && <p className="mt-1 text-xs text-ink-muted">{m.phone}</p>}
                      </div>
                      {isOwner && m.id !== profile?.id && (
                        <Button variant="secondary" tint={m.deactivated_at ? 'admin' : 'neutral'} className="shrink-0"
                          disabled={busyMember === m.id} onClick={() => void toggleDeactivation(m)}>
                          {busyMember === m.id ? sw.common.loading : m.deactivated_at ? sw.settings.reactivate : sw.settings.deactivate}
                        </Button>
                      )}
                    </li>
                  ))}
            </ul>
          </Card>
        </SettingsSection>

        {/* ── Change personal password ────────────────────────────────────── */}
        <SettingsSection
          icon={<KeyRound className="h-4 w-4" />}
          title={sw.settings.changePassword}
          description={sw.settingsCopy.changePasswordDesc}
        >
          <Card className="p-6 sm:p-8">
            <div className="flex flex-col gap-5">
              <PasswordField
                label={sw.settings.newPassword}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                hint={sw.auth.passwordHint}
              />
              <PasswordField
                label={sw.settings.confirmNewPassword}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={confirmPassword.length > 0 && newPassword !== confirmPassword ? sw.auth.passwordMismatch : undefined}
              />
            </div>
            {pwMsg && <p className={`mt-4 text-sm ${pwMsg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{pwMsg.text}</p>}
            <div className="mt-6">
              <Button tint="admin" disabled={changingPw || newPassword.length < 8 || newPassword !== confirmPassword}
                onClick={() => void changePassword()}>
                {changingPw ? sw.common.loading : sw.settings.changePassword}
              </Button>
            </div>
          </Card>
        </SettingsSection>

        {/* ── Staff shared password ───────────────────────────────────────── */}
        {isOwner && (
          <SettingsSection
            icon={<Lock className="h-4 w-4" />}
            title={sw.settings.companyPassword}
            description={sw.settingsCopy.companyPasswordDesc}
          >
            <Card className="p-6 sm:p-8">
              <PasswordField
                label={sw.settings.companyPassword}
                autoComplete="new-password"
                value={staffPw}
                onChange={(e) => setStaffPw(e.target.value)}
                hint="At least 6 characters"
              />
              {staffPwMsg && (
                <p className={`mt-3 text-sm ${staffPwMsg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{staffPwMsg.text}</p>
              )}
              <div className="mt-6">
                <Button tint="admin" disabled={settingStaffPw || staffPw.length < 6} onClick={() => void setStaffPassword()}>
                  {settingStaffPw ? sw.common.loading : sw.settings.setPassword}
                </Button>
              </div>
            </Card>
          </SettingsSection>
        )}

        {/* ── Danger zone ─────────────────────────────────────────────────── */}
        {isOwner && (
          <SettingsSection
            icon={<AlertTriangle className="h-4 w-4" />}
            title={sw.settings.dangerZone}
            description={sw.settingsCopy.dangerZoneDesc}
            danger
          >
            {/* Solid red — this action is destructive and irreversible, so the surface
                should signal that at a glance. All text/inputs go white for contrast. */}
            <div className="rounded-xl bg-red-600 p-6 text-white shadow-sm sm:p-8">
              <p className="mb-5 text-sm text-white/90">{sw.settings.deleteCompanyWarning}</p>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-white">
                    {sw.settings.deleteCompanyTypeHint}
                  </span>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => { setDeleteInput(e.target.value); setDeleteError(null); }}
                    placeholder={company?.name ?? ''}
                    className="w-full rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/60"
                  />
                </label>
                {deleteError && <p className="text-sm text-white">{deleteError}</p>}
                <div>
                  <button
                    type="button"
                    disabled={deleting || deleteInput.trim() !== company?.name}
                    onClick={() => void deleteCompany()}
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {deleting ? sw.common.loading : sw.settings.deleteCompanyConfirm}
                  </button>
                </div>
              </div>
            </div>
          </SettingsSection>
        )}
      </div>

      {pendingLogoFile && (
        <LogoCropModal
          file={pendingLogoFile}
          uploading={uploadingLogo}
          onCancel={() => setPendingLogoFile(null)}
          onConfirm={uploadCroppedLogo}
        />
      )}
    </div>
  );
}
