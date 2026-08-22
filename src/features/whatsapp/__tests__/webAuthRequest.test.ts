import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppNumber } from '../webAuthPhone';

describe('WhatsApp web authentication phone normalization', () => {
  it('normalizes Tanzanian local and international formats', () => {
    expect(normalizeWhatsAppNumber('0712 345 678')).toBe('+255712345678');
    expect(normalizeWhatsAppNumber('712-345-678')).toBe('+255712345678');
    expect(normalizeWhatsAppNumber('+255 712 345 678')).toBe('+255712345678');
  });

  it('accepts valid international E.164 numbers', () => {
    expect(normalizeWhatsAppNumber('+254 712 345 678')).toBe('+254712345678');
  });

  it('rejects empty, short and oversized values', () => {
    expect(normalizeWhatsAppNumber('')).toBeNull();
    expect(normalizeWhatsAppNumber('123')).toBeNull();
    expect(normalizeWhatsAppNumber('1234567890123456')).toBeNull();
  });
});
