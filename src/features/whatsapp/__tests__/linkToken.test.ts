import { describe, expect, it } from 'vitest';
import {
  evaluateLinkToken,
  linkFailureMessage,
} from '../../../../supabase/functions/_shared/whatsapp';

const NOW = new Date('2026-08-10T12:00:00.000Z');
const future = new Date(NOW.getTime() + 10 * 60_000).toISOString();
const past = new Date(NOW.getTime() - 60_000).toISOString();

describe('evaluateLinkToken', () => {
  it('accepts a fresh, unused, unrevoked token', () => {
    expect(evaluateLinkToken({ expires_at: future, used_at: null, revoked_at: null }, NOW))
      .toEqual({ ok: true });
  });

  it('refuses a token that was already redeemed', () => {
    expect(evaluateLinkToken({ expires_at: future, used_at: past, revoked_at: null }, NOW))
      .toEqual({ ok: false, reason: 'used' });
  });

  it('refuses a token superseded by a newer one', () => {
    expect(evaluateLinkToken({ expires_at: future, used_at: null, revoked_at: past }, NOW))
      .toEqual({ ok: false, reason: 'revoked' });
  });

  it('refuses an expired token, including exactly at expiry', () => {
    expect(evaluateLinkToken({ expires_at: past, used_at: null, revoked_at: null }, NOW))
      .toEqual({ ok: false, reason: 'expired' });
    expect(evaluateLinkToken({ expires_at: NOW.toISOString(), used_at: null, revoked_at: null }, NOW))
      .toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses an unknown token hash', () => {
    expect(evaluateLinkToken(null, NOW)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('refuses a token with an unparseable expiry rather than defaulting to valid', () => {
    expect(evaluateLinkToken({ expires_at: 'not-a-date', used_at: null, revoked_at: null }, NOW))
      .toEqual({ ok: false, reason: 'expired' });
  });

  it('revocation wins over expiry so the message names the real cause', () => {
    expect(evaluateLinkToken({ expires_at: past, used_at: null, revoked_at: past }, NOW))
      .toEqual({ ok: false, reason: 'revoked' });
  });
});

describe('linkFailureMessage', () => {
  it('returns a distinct, non-leaky message for every reason', () => {
    const reasons = ['unknown', 'revoked', 'used', 'expired'] as const;
    const messages = reasons.map(linkFailureMessage);
    expect(new Set(messages).size).toBe(reasons.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
      // Must never echo a token, hash or account identifier back over WhatsApp.
      expect(message).not.toMatch(/[0-9a-f]{16,}/i);
    }
  });
});
