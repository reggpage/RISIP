import { describe, expect, it } from 'vitest';
import { enforceResolvedDateLabel } from '../../../../supabase/functions/_shared/whatsappAssistant';

/**
 * MEASURED, on the owner's own screen:
 *
 *   "Mauzo ya leo (Jumanne, 8 Septemba 2026) (8 Septemba 2026): TSh 44,100"
 *
 * The model had already written the date. The guard that stamps a resolved
 * date onto "leo" only recognised its own full spelling, weekday included, so
 * it did not see the one already there and added a second.
 */
const EVIDENCE = ['period=leo', 'period_dates=2026-09-08', 'period_date_label=Jumanne, 8 Septemba 2026'];

const countOf = (text: string, needle: string) => text.split(needle).length - 1;

describe('stamping the resolved date onto an answer', () => {
  it('leaves a date the model already wrote without the weekday', () => {
    const answer = 'Mauzo ya leo (8 Septemba 2026): TSh 44,100';
    expect(enforceResolvedDateLabel(answer, EVIDENCE)).toBe(answer);
  });

  it('leaves the full label alone', () => {
    const answer = 'Mauzo ya leo (Jumanne, 8 Septemba 2026): TSh 44,100';
    expect(enforceResolvedDateLabel(answer, EVIDENCE)).toBe(answer);
  });

  it('leaves an ISO date alone', () => {
    const answer = 'Mauzo ya leo (2026-09-08): TSh 44,100';
    expect(enforceResolvedDateLabel(answer, EVIDENCE)).toBe(answer);
  });

  it('never writes the day twice, however it was spelled', () => {
    for (const answer of [
      'Mauzo ya leo (8 Septemba 2026): TSh 44,100',
      'Mauzo ya leo (Jumanne, 8 Septemba 2026): TSh 44,100',
      'Leo (8 Septemba 2026) hakuna deni.',
    ]) {
      expect(countOf(enforceResolvedDateLabel(answer, EVIDENCE), '8 Septemba 2026')).toBe(1);
    }
  });

  // The negative control: the guard must still do its job. An answer that
  // names no date at all has to be given one, or the owner is back to reading
  // "leo" with nothing to anchor it.
  it('still stamps the date when the answer has none', () => {
    const stamped = enforceResolvedDateLabel('Mauzo ya leo: TSh 44,100', EVIDENCE);
    expect(stamped).toContain('Jumanne, 8 Septemba 2026');
    expect(countOf(stamped, '8 Septemba 2026')).toBe(1);
  });

  it('stamps yesterday too, and only once', () => {
    const evidence = ['period=jana', 'period_dates=2026-09-07', 'period_date_label=Jumatatu, 7 Septemba 2026'];
    expect(enforceResolvedDateLabel('Mauzo ya jana: TSh 10,000', evidence)).toContain('Jumatatu, 7 Septemba 2026');
    const already = 'Mauzo ya jana (7 Septemba 2026): TSh 10,000';
    expect(enforceResolvedDateLabel(already, evidence)).toBe(already);
  });
});
