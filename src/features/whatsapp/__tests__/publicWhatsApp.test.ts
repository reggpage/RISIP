import { describe, expect, it } from 'vitest';
import { buildRisipWhatsAppUrl, risipWhatsAppNumber } from '../publicWhatsApp';

describe('public Risip WhatsApp links', () => {
  it('uses the official contact number in wa.me format', () => {
    expect(risipWhatsAppNumber()).toBe('255750513538');
  });

  it('prefills a Swahili support message without sending it', () => {
    const url = buildRisipWhatsAppUrl('support', 'sw');
    expect(url).toContain('https://wa.me/255750513538?text=');
    expect(decodeURIComponent(url ?? '')).toContain('nataka kuanza kutumia Risip');
    expect(decodeURIComponent(url ?? '')).toContain('Tafadhali nisaidie kuanza');
  });

  it('uses the login command for an English sign in link', () => {
    expect(decodeURIComponent(buildRisipWhatsAppUrl('login', 'en') ?? '')).toContain('text=login');
  });
});
