import { describe, expect, it } from 'vitest';
import { findUnsafeProfitWording, tidyReplyText } from '../../../../supabase/functions/_shared/whatsappAssistant';

/**
 * MEASURED, on the owner's own screen, 9 September 2026:
 *
 *   "Faida: TSh 6,685,740 (imefunikwa kikamilifu) Wachangiaji wakuu:
 *    Printer (TSh 6,000,000), Biblia (TSh 1,920,000), vest (TSh 1,020,000)."
 *
 * Those three are revenue and add to 8,940,000, which is more than the profit
 * the same sentence had just stated. Every figure was grounded, so the
 * ungrounded-number guard passed it; the fault is that they are attached to
 * the wrong noun.
 */
const ADVISER_EVIDENCE = [
  'business=St. Ritha bookshop',
  'period=mwezi huu',
  'period_dates=2026-09-01..2026-09-09',
  'revenue=12457700',
  'expenses=0',
  'estimated_profit=6685740',
  'profit_coverage_pct=100',
  'top_mover=Printer|qty=15|revenue=6000000|margin=1500000',
  'top_mover=Biblia|qty=160|revenue=1920000|margin=480000',
  'top_mover=vest|qty=34|revenue=1020000|margin=306000',
];

describe('a product’s sales quoted as its profit', () => {
  it('refuses the answer the owner was actually shown', () => {
    const answer = 'Faida: TSh 6,685,740 (imefunikwa kikamilifu) Wachangiaji wakuu: Printer (TSh 6,000,000), Biblia (TSh 1,920,000), vest (TSh 1,020,000).';
    const issues = findUnsafeProfitWording(answer, ADVISER_EVIDENCE);
    expect(issues).toContain('revenue_as_profit:Printer');
    expect(issues).toContain('revenue_as_profit:Biblia');
    expect(issues).toContain('revenue_as_profit:vest');
  });

  it('accepts the same figures once they are called sales', () => {
    const answer = 'Faida: TSh 6,685,740. Wachangiaji wakuu wa mauzo: Printer (TSh 6,000,000), Biblia (TSh 1,920,000).';
    expect(findUnsafeProfitWording(answer, ADVISER_EVIDENCE)).toEqual([]);
  });

  it('accepts the margin figure quoted as profit, because that is what it is', () => {
    const answer = 'Faida: TSh 6,685,740. Printer imeleta faida ya TSh 1,500,000.';
    expect(findUnsafeProfitWording(answer, ADVISER_EVIDENCE)).toEqual([]);
  });

  // The negative controls. None of these may be refused.
  it('leaves an ordinary profit answer alone', () => {
    expect(findUnsafeProfitWording('Faida ghafi ya leo ni TSh 17,140.', ADVISER_EVIDENCE)).toEqual([]);
  });

  it('leaves a sales sentence alone even when it names every product', () => {
    const answer = 'Mauzo: TSh 12,457,700. Printer (TSh 6,000,000), Biblia (TSh 1,920,000).';
    expect(findUnsafeProfitWording(answer, ADVISER_EVIDENCE)).toEqual([]);
  });

  it('says nothing when the evidence has no product ranking at all', () => {
    const answer = 'Faida: TSh 6,685,740. Printer (TSh 6,000,000).';
    expect(findUnsafeProfitWording(answer, ['revenue=12457700', 'estimated_profit=6685740'])).toEqual([]);
  });

  it('still catches the old COGS label fault it was written for', () => {
    const evidence = ['estimated_profit=17140', 'cogs=26960'];
    expect(findUnsafeProfitWording('Gharama za bidhaa: TSh 26,960.', evidence)).toContain('cogs_label');
  });
});

describe('tidying a reply before it goes out', () => {
  it('replaces the long dash the model writes in ranges', () => {
    expect(tidyReplyText('Mwezi huu (1–9 Septemba) biashara inaenda vizuri')).toBe('Mwezi huu (1-9 Septemba) biashara inaenda vizuri');
    expect(tidyReplyText('a — b')).toBe('a - b');
  });

  it('closes the gap a trailing product name leaves before a comma', () => {
    expect(tidyReplyText('Vestline , bidhaa')).toBe('Vestline, bidhaa');
    expect(tidyReplyText('Ice cream , zina stock')).toBe('Ice cream, zina stock');
    expect(tidyReplyText('imeisha .')).toBe('imeisha.');
  });

  it('changes no digit of any figure', () => {
    const before = 'Mauzo: TSh 12,457,700 na faida TSh 6,685,740 (1–9 Septemba)';
    const after = tidyReplyText(before);
    expect(after.replace(/\D/gu, '')).toBe(before.replace(/\D/gu, ''));
  });

  it('leaves the minus sign on a loss alone', () => {
    expect(tidyReplyText('Faida ghafi: TSh -782,860')).toBe('Faida ghafi: TSh -782,860');
  });
});
