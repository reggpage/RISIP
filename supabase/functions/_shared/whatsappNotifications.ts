import type { Lang } from './whatsappIntent.ts';

export type ProactiveNotificationKind = 'daily_summary' | 'debt_reminder';

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
      language: { code: claim.lang === 'sw' ? 'sw' : 'en_US' },
      components: [{
        type: 'body' as const,
        parameters: values.map((text) => ({ type: 'text' as const, text })),
      }],
    },
  };
}
