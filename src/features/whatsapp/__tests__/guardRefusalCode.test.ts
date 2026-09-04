import { describe, expect, it } from 'vitest';
import { guardRefusalCode } from '../../../../supabase/functions/_shared/whatsappTelemetry';

// A REFUSAL THAT DOES NOT SAY WHY IS NOT A MEASUREMENT.
//
// The assistant declines its own answer for three separate reasons, and the
// only question anybody asks of this column is which one fired: a guard that is
// too strict and a model inventing totals look identical from outside, and they
// have opposite fixes. Sixty days of production had seven refusals; three
// carried no cause at all, because only one of the three reasons was kept.

describe('which guard refused, and what it saw', () => {
  it('keeps the shape of a figure no tool returned', () => {
    expect(guardRefusalCode('model_ungrounded_number:2x1')).toBe('ungrounded_number:2x1');
  });

  it('keeps unsafe profit wording, which used to vanish', () => {
    expect(guardRefusalCode('model_profit_wording:faida,mapato')).toBe('profit_wording:faida,mapato');
  });

  it('keeps a false date caveat, which used to vanish', () => {
    expect(guardRefusalCode('model_false_date_caveat:sina_tarehe')).toBe('false_date_caveat:sina_tarehe');
  });

  it('names the guard, so two reasons cannot be read as one', () => {
    // The bare shape "2x1" and a wording code were indistinguishable before.
    const shape = guardRefusalCode('model_ungrounded_number:2x1');
    const wording = guardRefusalCode('model_profit_wording:2x1');
    expect(shape).not.toBe(wording);
  });
});

describe('what it must not record', () => {
  it('ignores a provider failure, which belongs in its own column', () => {
    expect(guardRefusalCode('provider_400_invalid_request_error')).toBeNull();
    expect(guardRefusalCode('provider_timeout')).toBeNull();
  });

  it('ignores other model failures that are not guard refusals', () => {
    expect(guardRefusalCode('missing_required_tool_call')).toBeNull();
    expect(guardRefusalCode('model_empty')).toBeNull();
  });

  it('ignores a guard name with nothing after the colon', () => {
    // An empty detail is not evidence, and writing the bare word would read in
    // the table as though a cause had been recorded.
    expect(guardRefusalCode('model_profit_wording:')).toBeNull();
    expect(guardRefusalCode('model_ungrounded_number')).toBeNull();
  });

  it('survives no failure at all rather than writing a string', () => {
    expect(guardRefusalCode(null)).toBeNull();
    expect(guardRefusalCode(undefined)).toBeNull();
    expect(guardRefusalCode('')).toBeNull();
  });

  it('does not match a guard name buried in the middle of something else', () => {
    expect(guardRefusalCode('provider_500_model_profit_wording:faida')).toBeNull();
  });

  it('keeps the column short enough to store', () => {
    expect(guardRefusalCode(`model_profit_wording:${'x'.repeat(500)}`)!.length).toBeLessThanOrEqual(200);
  });
});
