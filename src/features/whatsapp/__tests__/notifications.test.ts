import { describe, expect, it } from 'vitest';
import {
  isProactiveNotificationStop,
  notificationStoppedReply,
  notificationTemplateParameters,
  proactiveTemplatePayload,
  type ClaimedNotification,
} from '../../../../supabase/functions/_shared/whatsappNotifications';

const daily: ClaimedNotification = {
  delivery_id: 'delivery-1',
  phone_e164: '+255624107354',
  lang: 'sw',
  notification_kind: 'daily_summary',
  template_name: 'risip_daily_summary',
  parameters: {
    business_name: 'St. Ritha bookshop',
    business_date: '2026-08-24',
    sales: 2393250,
    expenses: 25700,
    note_key: 'no_issues',
  },
};

describe('proactive WhatsApp notifications', () => {
  it('recognises explicit opt-out commands without treating ordinary cancel text as STOP', () => {
    expect(isProactiveNotificationStop('STOP')).toBe(true);
    expect(isProactiveNotificationStop('SITISHA')).toBe(true);
    expect(isProactiveNotificationStop('zima taarifa')).toBe(true);
    expect(isProactiveNotificationStop('ghairi mauzo haya')).toBe(false);
  });

  it('keeps normal WhatsApp use available after STOP', () => {
    expect(notificationStoppedReply('sw')).toContain('Bado unaweza kutumia Risip');
    expect(notificationStoppedReply('en')).toContain('still use Risip');
  });

  it('formats the daily summary variables in the saved language', () => {
    const values = notificationTemplateParameters(daily);
    expect(values).toEqual([
      'St. Ritha bookshop',
      'Jumatatu, 24 Agosti',
      'TSh 2,393,250',
      'TSh 25,700',
      'Hakuna tatizo leo.',
    ]);
  });

  it('builds a Swahili template payload for the intended recipient', () => {
    const payload = proactiveTemplatePayload(daily);
    expect(payload.to).toBe('255624107354');
    expect(payload.template.name).toBe('risip_daily_summary');
    expect(payload.template.language.code).toBe('sw');
    expect(payload.template.components[0].parameters).toHaveLength(5);
  });

  it('keeps a debt reminder to one debtor and one balance', () => {
    const debt: ClaimedNotification = {
      ...daily,
      lang: 'en',
      notification_kind: 'debt_reminder',
      template_name: 'risip_debt_reminder',
      parameters: { debtor_name: 'Juma', amount: 25000, recorded_date: '2026-08-12' },
    };
    expect(notificationTemplateParameters(debt)).toEqual(['Juma', 'TSh 25,000', 'August 12']);
    expect(proactiveTemplatePayload(debt).template.components[0].parameters).toHaveLength(3);
  });

  it('rejects empty or invalid template parameters before calling Meta', () => {
    expect(() => proactiveTemplatePayload({ ...daily, parameters: { ...daily.parameters, sales: 'bad' } })).toThrow();
    expect(() => proactiveTemplatePayload({ ...daily, parameters: { ...daily.parameters, business_name: '' } })).toThrow();
  });
});
