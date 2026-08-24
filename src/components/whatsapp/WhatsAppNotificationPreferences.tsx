import { useEffect, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { supabase } from '@/lib/supabase';

type Preferences = {
  connected: boolean;
  daily_summary_enabled: boolean;
  debt_reminders_enabled: boolean;
  closing_time: string | null;
  timezone?: string;
};

const COPY = {
  en: {
    title: 'WhatsApp account notifications',
    intro: 'Choose the account updates Risip may send without waiting for you to message first.',
    daily: 'Daily business summary',
    dailyHelp: 'Sent once after closing, and only when the business recorded activity that day.',
    debt: 'Outstanding debt reminders',
    debtHelp: 'One debtor per reminder. Risip never puts several customer balances in one message.',
    time: 'Business closing time',
    timeHelp: 'Uses the company timezone. This must be set before daily summaries can be enabled.',
    privacy: 'You can reply STOP at any time. This turns off both notifications but does not disconnect WhatsApp or stop normal Risip conversations.',
    disconnected: 'Connect your WhatsApp number above before enabling notifications.',
    save: 'Save notification settings',
    saved: 'WhatsApp notification settings saved.',
  },
  sw: {
    title: 'Taarifa za akaunti kupitia WhatsApp',
    intro: 'Chagua taarifa ambazo Risip inaweza kukutumia bila kusubiri uanze mazungumzo.',
    daily: 'Muhtasari wa biashara wa kila siku',
    dailyHelp: 'Hutumwa mara moja baada ya biashara kufunga, na ni siku yenye rekodi pekee.',
    debt: 'Vikumbusho vya madeni yaliyopo',
    debtHelp: 'Kila ujumbe unahusu mdaiwa mmoja. Risip haiweki salio za wateja wengi kwenye ujumbe mmoja.',
    time: 'Muda wa biashara kufunga',
    timeHelp: 'Unatumia timezone ya biashara. Lazima uweke muda kabla ya kuwasha muhtasari wa kila siku.',
    privacy: 'Unaweza kujibu SITISHA wakati wowote. Hii huzima taarifa zote mbili bila kuondoa WhatsApp au kuzuia mazungumzo ya kawaida na Risip.',
    disconnected: 'Unganisha namba yako ya WhatsApp hapo juu kabla ya kuwasha taarifa.',
    save: 'Hifadhi mipangilio ya taarifa',
    saved: 'Mipangilio ya taarifa za WhatsApp imehifadhiwa.',
  },
} as const;

export default function WhatsAppNotificationPreferences() {
  const lang = getLang();
  const copy = COPY[lang];
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [daily, setDaily] = useState(false);
  const [debt, setDebt] = useState(false);
  const [closingTime, setClosingTime] = useState('20:00');

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc('my_whatsapp_notification_preferences').then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.error(friendlyError(error, 'Could not load WhatsApp notification settings.'));
        return;
      }
      const value = (data ?? {}) as Preferences;
      setConnected(Boolean(value.connected));
      setDaily(Boolean(value.daily_summary_enabled));
      setDebt(Boolean(value.debt_reminders_enabled));
      if (value.closing_time) setClosingTime(value.closing_time.slice(0, 5));
    });
    return () => { cancelled = true; };
    // The toast hook returns convenience methods in a fresh object on each
    // render. Fetch once on mount so a toast or state change cannot start a
    // repeated preferences request loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    const { data, error } = await supabase.rpc('set_whatsapp_notification_preferences', {
      p_daily_summary: daily,
      p_debt_reminders: debt,
      p_closing_time: closingTime || null,
    });
    setSaving(false);
    if (error) {
      toast.error(friendlyError(error, 'Could not save WhatsApp notification settings.'));
      return;
    }
    const value = data as Preferences;
    setDaily(Boolean(value.daily_summary_enabled));
    setDebt(Boolean(value.debt_reminders_enabled));
    toast.success(copy.saved);
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <BellRing className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-ink">{copy.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{copy.intro}</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {lang === 'sw' ? 'Inapakia…' : 'Loading…'}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {!connected && <p className="text-sm font-medium text-amber-700">{copy.disconnected}</p>}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={daily}
              disabled={!connected || saving}
              onChange={(event) => setDaily(event.target.checked)}
              className="mt-1 h-4 w-4 accent-emerald-600"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{copy.daily}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-muted">{copy.dailyHelp}</span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={debt}
              disabled={!connected || saving}
              onChange={(event) => setDebt(event.target.checked)}
              className="mt-1 h-4 w-4 accent-emerald-600"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{copy.debt}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-muted">{copy.debtHelp}</span>
            </span>
          </label>

          <label className="block max-w-xs">
            <span className="text-sm font-semibold text-ink">{copy.time}</span>
            <input
              type="time"
              value={closingTime}
              disabled={!connected || saving}
              onChange={(event) => setClosingTime(event.target.value)}
              className="mt-2 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="mt-1 block text-xs leading-relaxed text-ink-muted">{copy.timeHelp}</span>
          </label>

          <p className="border-t border-surface-border pt-4 text-xs leading-relaxed text-ink-muted">
            {copy.privacy}
          </p>
          <Button tint="admin" disabled={!connected || saving} onClick={() => void save()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {copy.save}
          </Button>
        </div>
      )}
    </Card>
  );
}
