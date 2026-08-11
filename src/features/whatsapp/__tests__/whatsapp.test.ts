import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MAX_MEDIA_BYTES,
  buildFailureReply,
  buildReceiptReply,
  buildReviewUrl,
  maskPhone,
  normalizeE164,
  parseLinkToken,
  sha256Hex,
  timingSafeEqualHex,
  validateMedia,
  verifyMetaSignature,
} from '../../../../supabase/functions/_shared/whatsapp';

const APP_SECRET = 'test-app-secret';

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

describe('verifyMetaSignature', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  it('accepts a signature produced with the app secret', async () => {
    await expect(verifyMetaSignature(body, sign(body), APP_SECRET)).resolves.toBe(true);
  });

  it('rejects a signature made with the wrong secret', async () => {
    await expect(verifyMetaSignature(body, sign(body, 'attacker'), APP_SECRET)).resolves.toBe(false);
  });

  it('rejects when the body has been tampered with after signing', async () => {
    const signature = sign(body);
    const tampered = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ evil: true }] });
    await expect(verifyMetaSignature(tampered, signature, APP_SECRET)).resolves.toBe(false);
  });

  it('rejects a missing, malformed or non-hex header', async () => {
    await expect(verifyMetaSignature(body, null, APP_SECRET)).resolves.toBe(false);
    await expect(verifyMetaSignature(body, 'sha1=abc', APP_SECRET)).resolves.toBe(false);
    await expect(verifyMetaSignature(body, 'sha256=zzzz', APP_SECRET)).resolves.toBe(false);
  });

  it('rejects everything when no app secret is configured', async () => {
    await expect(verifyMetaSignature(body, sign(body), '')).resolves.toBe(false);
  });
});

describe('timingSafeEqualHex', () => {
  it('matches identical strings and rejects different ones', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false);
  });

  it('rejects length mismatches without throwing', () => {
    expect(timingSafeEqualHex('abc', 'abcdef')).toBe(false);
    expect(timingSafeEqualHex('', 'a')).toBe(false);
  });
});

describe('sha256Hex', () => {
  // Must agree with Postgres encode(digest(t,'sha256'),'hex'), which is how the
  // linking token is stored — if these diverge, no token can ever be redeemed.
  it('matches the known SHA-256 of a fixed input', async () => {
    await expect(sha256Hex('risip-test')).resolves.toBe(
      'cb6d99a03f3e58199c244b20e2a737d8ebbc6541e684888f286d31b549a77877',
    );
  });
});

describe('parseLinkToken', () => {
  const token = 'a'.repeat(48);

  it('reads the token out of a LINK message regardless of case or spacing', () => {
    expect(parseLinkToken(`LINK ${token}`)).toBe(token);
    expect(parseLinkToken(`link   ${token}`)).toBe(token);
    expect(parseLinkToken(`  Link ${token}  `)).toBe(token);
  });

  it('ignores ordinary messages and malformed tokens', () => {
    expect(parseLinkToken('hello')).toBeNull();
    expect(parseLinkToken('LINK short')).toBeNull();
    expect(parseLinkToken('LINK ' + 'a'.repeat(200))).toBeNull();
    expect(parseLinkToken(null)).toBeNull();
    expect(parseLinkToken('')).toBeNull();
  });

  it('does not treat a token with injected whitespace as valid', () => {
    expect(parseLinkToken(`LINK ${token} extra`)).toBeNull();
  });
});

describe('normalizeE164', () => {
  it('normalises Tanzanian local and international forms to one value', () => {
    // A wa_id, a local 0-prefixed number and a +255 number are the same person.
    expect(normalizeE164('255754000111')).toBe('+255754000111');
    expect(normalizeE164('0754000111')).toBe('+255754000111');
    expect(normalizeE164('+255 754 000 111')).toBe('+255754000111');
    expect(normalizeE164('754000111')).toBe('+255754000111');
  });

  it('rejects empty or implausible input', () => {
    expect(normalizeE164('')).toBeNull();
    expect(normalizeE164(null)).toBeNull();
    expect(normalizeE164('abc')).toBeNull();
    expect(normalizeE164('12')).toBeNull();
    expect(normalizeE164('1'.repeat(20))).toBeNull();
  });
});

describe('maskPhone', () => {
  it('never reveals the middle digits', () => {
    const masked = maskPhone('+255754000111');
    expect(masked.endsWith('111')).toBe(true);
    expect(masked).not.toContain('754000');
  });

  it('handles missing values safely', () => {
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone('+2557')).toBe('***');
  });
});

describe('validateMedia', () => {
  it('accepts supported image types', () => {
    expect(validateMedia('image/jpeg', 1000)).toEqual({ ok: true, mediaType: 'image/jpeg' });
    expect(validateMedia('image/PNG; charset=x', 1000)).toEqual({ ok: true, mediaType: 'image/png' });
  });

  it('rejects documents, audio and video', () => {
    expect(validateMedia('application/pdf', 1000)).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(validateMedia('audio/ogg', 1000)).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(validateMedia('video/mp4', 1000)).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(validateMedia(null, 1000)).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('rejects oversized media', () => {
    expect(validateMedia('image/jpeg', MAX_MEDIA_BYTES + 1)).toEqual({ ok: false, reason: 'too_large' });
    expect(validateMedia('image/jpeg', MAX_MEDIA_BYTES)).toEqual({ ok: true, mediaType: 'image/jpeg' });
  });
});

describe('reply messages', () => {
  it('states that the receipt still needs confirmation', () => {
    const reply = buildReceiptReply({
      vendor: 'TotalEnergies',
      total: 183024,
      reviewUrl: 'https://risip.online/receipts?receipt=abc',
    });
    expect(reply).toContain('TotalEnergies');
    expect(reply).toContain('TZS 183,024');
    expect(reply.toLowerCase()).toContain('confirmation');
    expect(reply).toContain('https://risip.online/receipts?receipt=abc');
  });

  it('still produces one usable message when extraction found nothing', () => {
    const reply = buildReceiptReply({ vendor: null, total: null, reviewUrl: 'https://risip.online/receipts' });
    expect(reply).toContain('Receipt received.');
    expect(reply).toContain('https://risip.online/receipts');
  });

  it('explains unsupported media and size failures distinctly', () => {
    expect(buildFailureReply('https://x.test', 'unsupported_type')).toContain('photo');
    expect(buildFailureReply('https://x.test', 'too_large')).toContain('too large');
  });
});

describe('buildReviewUrl', () => {
  it('deep links to the authenticated receipts page, with no bypass token', () => {
    expect(buildReviewUrl('https://risip.online', 'abc')).toBe('https://risip.online/receipts?receipt=abc');
    expect(buildReviewUrl('https://risip.online/', null)).toBe('https://risip.online/receipts');
    // The URL must never carry a credential or signed grant.
    expect(buildReviewUrl('https://risip.online', 'abc')).not.toMatch(/token|secret|key=/i);
  });
});
