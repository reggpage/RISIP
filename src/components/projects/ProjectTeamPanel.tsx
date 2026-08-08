import { useState } from 'react';
import { Check, Copy, Crown, Loader2, UserPlus, Wallet, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useProjectTeam } from '@/features/projects/useProjectTeam';
import { createInviteLink } from '@/features/projects/useInviteLinks';
import { supabase } from '@/lib/supabase';
import { formatMoney } from '@/lib/format';

function formatAmountInput(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '';
}

// Team & petty cash control for one project. Owner appoints leaders + sets the budget;
// leaders (and owner) allocate petty cash to members within that budget and invite field
// staff. Uploaders just... upload — they don't see this panel.
export default function ProjectTeamPanel({
  projectId, projectName, isOwner, myUserId, onClose,
}: {
  projectId: string; projectName: string; isOwner: boolean; myUserId: string; onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const team = useProjectTeam(projectId, myUserId);
  const canManage = isOwner || team.myRole === 'leader';

  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [allocUser, setAllocUser] = useState('');
  const [allocAmount, setAllocAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const remaining = Math.max(0, team.budget - team.allocated);

  async function saveBudget() {
    const n = Number(budgetInput.replace(/[^\d.]/g, ''));
    if (!(n >= 0)) { toast.error('Enter a valid number.'); return; }
    setSavingBudget(true);
    const { error } = await supabase.from('projects').update({ petty_cash_budget: n }).eq('id', projectId);
    setSavingBudget(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Budget saved.');
    setBudgetInput('');
    void team.refresh();
  }

  async function toggleLeader(profileId: string, makeLeader: boolean) {
    if (!isOwner) return;
    const { error } = await supabase.from('project_members')
      .update({ role: makeLeader ? 'leader' : 'member' })
      .eq('project_id', projectId).eq('profile_id', profileId);
    if (error) { toast.error(error.message); return; }
    toast.success(makeLeader ? 'Appointed as leader.' : 'Leadership removed.');
    void team.refresh();
  }

  async function allocate() {
    if (!allocUser) { toast.error('Select a member.'); return; }
    const amt = Number(allocAmount.replace(/[^\d.]/g, ''));
    if (!(amt > 0)) { toast.error('Enter a valid amount.'); return; }
    if (!isOwner && amt > remaining) { toast.error(`Amount exceeds the remaining budget (${formatMoney(remaining)}).`); return; }
    setBusy(true);
    const { error } = await supabase.rpc('allocate_project_petty_cash', {
      p_project: projectId, p_user: allocUser, p_amount: amt, p_description: 'Project allocation',
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Top-up request sent. The member must accept it before the funds are available.');
    setAllocAmount('');
    void team.refresh();
  }

  async function invite() {
    setBusy(true);
    try {
      const link = await createInviteLink(projectId, 'worker', myUserId);
      setInviteLink(`${window.location.origin}/join/${link.token}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); }
    catch {
      const el = document.createElement('textarea');
      el.value = inviteLink; el.style.cssText = 'position:absolute;left:-9999px'; document.body.appendChild(el);
      el.select(); try { document.execCommand('copy'); } catch { /* ignore */ } document.body.removeChild(el);
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }

  const memberOptions = team.members.map((m) => ({ value: m.profile_id, label: m.full_name }));

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-ink">
            <Wallet className="h-4 w-4 shrink-0" /> <span className="truncate">Team &amp; funds · {projectName}</span>
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Budget */}
          <div className="mb-5 rounded-xl border border-surface-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-ink-muted">Petty cash budget</div>
                <div className="font-display text-xl font-semibold text-ink">{formatMoney(team.budget)}</div>
              </div>
              <div className="text-right text-xs text-ink-muted">
                Allocated: <span className="font-medium text-ink">{formatMoney(team.allocated)}</span><br />
                Remaining: <span className="font-semibold text-role-admin">{formatMoney(remaining)}</span>
              </div>
            </div>
            {isOwner && (
              <div className="mt-3 flex gap-2">
                <input inputMode="numeric" placeholder="Set new budget" value={budgetInput}
                  onChange={(e) => setBudgetInput(formatAmountInput(e.target.value))}
                  className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm" />
                <Button tint="admin" disabled={savingBudget || !budgetInput} onClick={() => void saveBudget()}>
                  {savingBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            )}
          </div>

          {/* Allocate */}
          {canManage && (
            <div className="mb-5 rounded-xl border border-surface-border p-4">
              <div className="mb-3 text-sm font-semibold text-ink">Send a top-up request</div>
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                <Select value={allocUser} onChange={setAllocUser} placeholder="Select member" options={memberOptions} />
                <input inputMode="numeric" placeholder="Amount" value={allocAmount}
                  onChange={(e) => setAllocAmount(formatAmountInput(e.target.value))}
                  className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm" />
                <Button tint="admin" disabled={busy} onClick={() => void allocate()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Send request
                </Button>
              </div>
              <p className="mt-2 text-xs text-ink-muted">The member must accept before the cash becomes available.</p>
              {!isOwner && <p className="mt-1 text-xs text-ink-muted">You can reserve up to {formatMoney(remaining)} (remaining budget).</p>}
            </div>
          )}

          {/* Members */}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Project members</h3>
            {canManage && (
              <Button variant="secondary" tint="admin" disabled={busy} onClick={() => void invite()} className="!py-1.5">
                <UserPlus className="h-4 w-4" /> Invite member
              </Button>
            )}
          </div>

          {inviteLink && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-role-admin/30 bg-role-admin/5 p-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={inviteLink}>{inviteLink}</span>
              <Button variant="secondary" tint="admin" className="!py-1.5" onClick={() => void copyLink()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}

          {team.loading ? (
            <div className="py-8 text-center text-sm text-ink-muted">Loading…</div>
          ) : team.members.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">No members yet. Use "Invite member".</p>
          ) : (
            <ul className="flex flex-col divide-y divide-surface-border">
              {team.members.map((m) => (
                <li key={m.profile_id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{m.full_name}</span>
                      {m.role === 'leader' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Crown className="h-3 w-3" /> Leader
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-muted">Balance: {formatMoney(m.balance)}</div>
                  </div>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      className="!py-1 text-xs"
                      onClick={async () => {
                        if (m.role === 'leader') {
                          const ok = await confirm({ title: 'Remove leadership?', message: `${m.full_name} will become a regular member.`, confirmLabel: 'Remove' });
                          if (ok) void toggleLeader(m.profile_id, false);
                        } else {
                          void toggleLeader(m.profile_id, true);
                        }
                      }}
                    >
                      <Crown className="h-3.5 w-3.5" /> {m.role === 'leader' ? 'Remove leader' : 'Make leader'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
