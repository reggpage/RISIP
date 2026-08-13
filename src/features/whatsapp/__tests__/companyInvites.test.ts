import { describe, expect, it } from 'vitest';
import { buildCompanyInviteShareText } from '../companyInvites';

describe('company WhatsApp invite copy', () => {
  it('gives a Swahili worker the exact onboarding route and code', () => {
    const message = buildCompanyInviteShareText({
      companyName: 'Duka la Asha', code: 'ABCD2345', role: 'worker', days: 14, lang: 'sw', startUrl: 'https://wa.me/255700000000?text=Hi',
    });
    expect(message).toContain('Duka la Asha');
    expect(message).toContain('Mfanyakazi');
    expect(message).toContain('Jiunge na biashara niliyoalikwa');
    expect(message).toContain('ABCD2345');
    expect(message).toContain('siku 14');
  });

  it('keeps the role explicit in English', () => {
    const message = buildCompanyInviteShareText({
      companyName: 'Asha Shop', code: 'EFGH6789', role: 'accountant', days: 7, lang: 'en',
    });
    expect(message).toContain('Accountant');
    expect(message).toContain('Join a business I was invited to');
    expect(message).toContain('EFGH6789');
  });
});
