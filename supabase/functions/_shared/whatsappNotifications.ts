import type { Lang } from './whatsappIntent.ts';
import { closeReminderReply } from './whatsappDayClose.ts';

export type ProactiveNotificationKind = 'daily_summary' | 'debt_reminder' | 'close_reminder';

export type ClaimedNotification = {
  delivery_id: string;
  phone_e164: string;
  lang: Lang;
  notification_kind: ProactiveNotificationKind;
  template_name: string;
  parameters: Record<string, unknown>;
};

export function isProactiveNotificationStop(text: string | null | undefined): boolean {
  const said = String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return /^(stop|unsubscribe|stop messages|stop notifications|sitisha|sitisha taarifa|zima taarifa|acha taarifa)$/.test(said);
}

export function notificationStoppedReply(lang: Lang): string {
  return lang === 'sw'
    ? 'Taarifa za kila siku na vikumbusho vya madeni zimezimwa. Bado unaweza kutumia Risip hapa kawaida. Unaweza kuziwasha tena kwenye Settings.'
    : 'Daily summaries and debt reminders are off. You can still use Risip here normally. You can enable them again in Settings.';
}

function amount(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('notification amount is invalid');
  return `TSh ${Math.round(parsed).toLocaleString('en-US')}`;
}

function localDate(value: unknown, lang: Lang, weekday: boolean): string {
  const raw = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('notification date is invalid');
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  try {
    return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-US', {
      ...(weekday ? { weekday: 'long' as const } : {}),
      day: 'numeric',
      month: 'long',
    }).format(date);
  } catch {
    return raw;
  }
}

export function notificationTemplateParameters(claim: ClaimedNotification): string[] {
  const p = claim.parameters ?? {};
  if (claim.notification_kind === 'daily_summary') {
    const note = p.note_key === 'expenses_exceed_sales'
      ? (claim.lang === 'sw' ? '⚠️ Matumizi yamezidi mauzo leo.' : '⚠️ Expenses were higher than sales today.')
      : (claim.lang === 'sw' ? 'Hakuna tatizo leo.' : 'No issues today.');
    return [
      String(p.business_name ?? '').trim(),
      localDate(p.business_date, claim.lang, true),
      amount(p.sales),
      amount(p.expenses),
      note,
    ];
  }
  return [
    String(p.debtor_name ?? '').trim(),
    amount(p.amount),
    localDate(p.recorded_date, claim.lang, false),
  ];
}

/**
 * A queued notification that is an ORDINARY message, not a template.
 *
 * Only legal because the person messaged today, which is exactly what
 * wa_queue_close_reminders checks before queueing one: it requires a confirmed
 * record whose source is whatsapp on the same local day. Inside that 24-hour
 * window Risip may write freely, so the reminder can say what it needs to say
 * and costs nothing.
 *
 * The other half of this — the person who sent NOTHING today, and therefore has
 * no window — needs an approved template and is not queued at all yet.
 */
export function isPlainTextNotification(claim: ClaimedNotification): boolean {
  return String((claim.parameters ?? {}).channel ?? '') === 'text';
}

export function proactiveTextPayload(claim: ClaimedNotification) {
  const p = claim.parameters ?? {};
  const name = String(p.full_name ?? '').trim() || null;
  const recorded = Math.max(0, Math.round(Number(p.recorded_today ?? 0)));
  const body = closeReminderReply(name, recorded, claim.lang);
  return {
    messaging_product: 'whatsapp' as const,
    recipient_type: 'individual' as const,
    to: claim.phone_e164.replace(/D/g, ''),
    type: 'text' as const,
    text: { body, preview_url: false },
  };
}

/** Whichever shape this notification is actually sent as. */
export function proactiveSendPayload(claim: ClaimedNotification) {
  return isPlainTextNotification(claim)
    ? proactiveTextPayload(claim)
    : proactiveTemplatePayload(claim);
}

export function proactiveTemplatePayload(claim: ClaimedNotification) {
  const values = notificationTemplateParameters(claim);
  if (values.some((value) => !value)) throw new Error('notification template parameter is empty');
  return {
    messaging_product: 'whatsapp' as const,
    recipient_type: 'individual' as const,
    to: claim.phone_e164.replace(/\D/g, ''),
    type: 'template' as const,
    template: {
      name: claim.template_name,
      // 'en', NOT 'en_US'.
      //
      // Meta treats these as two different languages with no fallback between
      // them. risip_daily_summary and risip_debt_reminder — the only two
      // templates this function ever sends — are registered as "English" in
      // WhatsApp Manager, so 'en_US' returns 132001, "Template name does not
      // exist in the translation", and the English shop gets nothing.
      //
      // It had never shown up because no template had ever been sent: every
      // row in the Manager read "Messages sent 0". It would have shown up on
      // the first English shop that closed a day.
      //
      // The other templates in the account (risip_start_onboarding,
      // risip_login_link, hello_world) ARE registered as English (US) — but
      // nothing here sends them, so they are not this line's business. If one
      // of these two is ever re-registered as English (US), this must change
      // with it.
      language: { code: claim.lang === 'sw' ? 'sw' : 'en' },
      components: [{
        type: 'body' as const,
        parameters: values.map((text) => ({ type: 'text' as const, text })),
      }],
    },
  };
}
