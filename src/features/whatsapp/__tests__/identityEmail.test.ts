import { describe, expect, it } from 'vitest';
import { isSyntheticEmail, waSyntheticEmail } from '../../../../supabase/functions/_shared/waIdentityEmail';

// A WhatsApp-first account is identified by a synthetic address, not by phone,
// because GoTrue's phone provider is off on this project — measured, not assumed:
//   GET /auth/v1/settings -> "phone": false, "email": true
// Enabling it would mean paying Twilio for SMS Risip never sends.

describe('the address an account gets when it starts on WhatsApp', () => {
  it('is derived from the number, digits only', () => {
    expect(waSyntheticEmail('+255700000103')).toBe('wa.255700000103@wa.invalid');
  });

  it('ignores the spacing people actually type', () => {
    expect(waSyntheticEmail('+255 700 000 103')).toBe('wa.255700000103@wa.invalid');
    expect(waSyntheticEmail('255-700-000-103')).toBe('wa.255700000103@wa.invalid');
  });

  it('is stable, so the same number never makes two accounts', () => {
    expect(waSyntheticEmail('+255700000103')).toBe(waSyntheticEmail('255700000103'));
  });

  it('uses .invalid, which can never resolve or be registered by anyone', () => {
    expect(waSyntheticEmail('+255700000103')).toMatch(/@wa\.invalid$/);
  });

  it('refuses a number too short to be one', () => {
    expect(() => waSyntheticEmail('+255')).toThrow(/too short/);
    expect(() => waSyntheticEmail('')).toThrow(/too short/);
  });

  it('recognises its own accounts, and leaves real ones alone', () => {
    expect(isSyntheticEmail('wa.255700000103@wa.invalid')).toBe(true);
    expect(isSyntheticEmail('reaganfraizer13@gmail.com')).toBe(false);
    expect(isSyntheticEmail(null)).toBe(false);
  });
});
