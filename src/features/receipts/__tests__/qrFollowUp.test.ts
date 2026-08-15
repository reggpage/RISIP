import { describe, expect, it } from 'vitest';
import { askForQrCloseUp, qrCorrectionReply } from '../../../../supabase/functions/_shared/qrFollowUp';
import type { TraReceipt } from '../../../../supabase/functions/_shared/traVerify';

const official: TraReceipt = {
  vendorName: 'NEW MUAMBAO',
  vendorTin: '138955834',
  vendorVrn: '40033547C',
  receiptNumber: '214576',
  receiptDate: '2026-08-15',
  receiptTime: '14:52:56',
  totalInclTax: 58000,
  totalExclTax: 49152.54,
  totalTax: 8847.46,
  verificationCode: '18935E214576',
};

describe('asking for a closer photo', () => {
  it('says the figures are unconfirmed, not that the receipt failed', () => {
    // The receipt is saved either way. What is missing is confirmation, and
    // saying "failed" would suggest the person has to send it again.
    const sw = askForQrCloseUp('sw');
    expect(sw).toMatch(/Sikuweza kuthibitisha/);
    expect(sw).toMatch(/QR/);
    expect(sw).toMatch(/karibu/);
    expect(askForQrCloseUp('en')).toMatch(/close-up/);
  });

  it('explains what a closer photo buys, so it is worth the effort', () => {
    expect(askForQrCloseUp('sw')).toMatch(/taarifa halisi kutoka TRA/);
    expect(askForQrCloseUp('en')).toMatch(/real figures from TRA/);
  });
});

describe('reporting what the close-up corrected', () => {
  it('names the numbers rather than only saying it worked', () => {
    // "Verified" alone hides whether anything was actually wrong, which is the
    // one thing the person wants to know.
    const reply = qrCorrectionReply({ vendorName: 'NEW MLAMBAO', total: 50000 }, official, 'sw');
    expect(reply).toContain('NEW MLAMBAO → NEW MUAMBAO');
    expect(reply).toContain('TSh 50,000 → TSh 58,000');
    expect(reply).toMatch(/Imethibitishwa na TRA/);
  });

  it('says plainly when the first reading was already right', () => {
    const reply = qrCorrectionReply({ vendorName: 'NEW MUAMBAO', total: 58000 }, official, 'sw');
    expect(reply).toMatch(/hakuna kilichobadilika/);
    expect(reply).not.toMatch(/→/);
  });

  it('does not report a difference that is only spacing or case', () => {
    expect(qrCorrectionReply({ vendorName: ' new muambao ', total: 58000 }, official, 'sw'))
      .toMatch(/hakuna kilichobadilika/);
  });

  it('reports only the field that moved', () => {
    const reply = qrCorrectionReply({ vendorName: 'NEW MUAMBAO', total: 50000 }, official, 'sw');
    expect(reply).toContain('TSh 50,000 → TSh 58,000');
    expect(reply).not.toContain('Muuzaji');
  });

  it('always states the confirmed total, so the reply stands on its own', () => {
    expect(qrCorrectionReply({ vendorName: null, total: null }, official, 'en'))
      .toContain('TSh 58,000');
  });
});
