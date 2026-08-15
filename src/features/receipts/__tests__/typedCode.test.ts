import { describe, expect, it } from 'vitest';
import { parseTypedVerificationCode, typedCodeRejected } from '../../../../supabase/functions/_shared/typedCode';
import { qrCorrectionReply } from '../../../../supabase/functions/_shared/qrFollowUp';
import type { TraReceipt } from '../../../../supabase/functions/_shared/traVerify';

describe('a code somebody typed', () => {
  it('reads the ways people would write it', () => {
    expect(parseTypedVerificationCode('kodi ni 18935E214576')).toBe('18935E214576');
    expect(parseTypedVerificationCode('code 18935E214576')).toBe('18935E214576');
    expect(parseTypedVerificationCode('verification code: G2KTYC85636')).toBe('G2KTYC85636');
    expect(parseTypedVerificationCode('18935e214576')).toBe('18935E214576');
  });

  it('refuses a run of only digits', () => {
    // "214576" is the receipt number, printed inches from the code on the same
    // paper. Taking it for a code would send the lookup to a different receipt.
    expect(parseTypedVerificationCode('214576')).toBeNull();
    expect(parseTypedVerificationCode('kodi ni 138955834')).toBeNull();
  });

  it('refuses a run of only letters', () => {
    expect(parseTypedVerificationCode('MAWALENI')).toBeNull();
    expect(parseTypedVerificationCode('kodi ni ndefu')).toBeNull();
  });

  it('does not claim ordinary conversation', () => {
    expect(parseTypedVerificationCode('nimeuza daftari 10 kila moja 1500')).toBeNull();
    expect(parseTypedVerificationCode('faida yangu ni ngapi')).toBeNull();
    expect(parseTypedVerificationCode('')).toBeNull();
  });

  it('names the look-alike characters when TRA rejects it', () => {
    // These are read off thermal paper, where 0/O and 1/I are a coin toss.
    const reply = typedCodeRejected('1B9945E214A7E', 'sw');
    expect(reply).toContain('1B9945E214A7E');
    expect(reply).toMatch(/0 na O/);
    expect(reply).toMatch(/8 na B/);
  });
});

describe('the confirmation reply, after the two faults the owner found', () => {
  const official: TraReceipt = {
    vendorName: 'MAWALENI COMPANY LIMITED', vendorTin: '167691706', vendorVrn: null,
    receiptNumber: '85636', receiptDate: '2026-08-09', receiptTime: '15:22:19',
    totalInclTax: 170531, totalExclTax: 170531, totalTax: 0,
    verificationCode: 'G2KTYC85636',
  };

  it('reports a field that was blank and is now filled', () => {
    // It said "nothing changed" after the vendor went from nothing to MAWALENI
    // COMPANY LIMITED, which is simply untrue.
    const reply = qrCorrectionReply({ vendorName: null, total: 170531 }, official, 'sw');
    expect(reply).toContain('(hakuna) → MAWALENI COMPANY LIMITED');
    expect(reply).not.toMatch(/hakuna kilichobadilika/);
  });

  it('carries a link to the receipt', () => {
    // Without one the confirmation was a dead end; every other reply has one.
    const reply = qrCorrectionReply({ vendorName: null, total: null }, official, 'sw',
      'https://risip.online/receipts?receipt=abc');
    expect(reply).toContain('https://risip.online/receipts?receipt=abc');
    expect(reply).toMatch(/Kagua na kamilisha/);
  });

  it('still says plainly when the reading really was already right', () => {
    const reply = qrCorrectionReply(
      { vendorName: 'MAWALENI COMPANY LIMITED', total: 170531 }, official, 'sw');
    expect(reply).toMatch(/hakuna kilichobadilika/);
  });
});
