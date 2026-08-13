import { describe, expect, it } from 'vitest';
import { shouldInterpretReadWithAi, validateSemanticReadIntent } from '../../../../supabase/functions/_shared/whatsappReadIntentAi';

describe('semantic read-intent fallback', () => {
  it('only considers business questions', () => {
    expect(shouldInterpretReadWithAi('Which of my products moved fastest today?')).toBe(true);
    expect(shouldInterpretReadWithAi('approve receipt 123')).toBe(false);
    expect(shouldInterpretReadWithAi('hello there')).toBe(false);
  });

  it('accepts only allow-listed read tools', () => {
    expect(validateSemanticReadIntent({ kind: 'product_analytics', rank_by: 'quantity', period: 'today', product_names: ['nguvu ya sala'] })).toMatchObject({ kind: 'product_analytics' });
    expect(validateSemanticReadIntent({ kind: 'read_tool', tool: 'ai_debtors', period: 'today' })).toMatchObject({ kind: 'read_tool' });
    expect(validateSemanticReadIntent({ kind: 'read_tool', tool: 'approve_receipt', period: 'today' })).toBeNull();
    expect(validateSemanticReadIntent({ kind: 'write_tool', tool: 'delete_all' })).toBeNull();
  });
});
