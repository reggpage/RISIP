import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateAiTransactionCandidate } from '../../../../supabase/functions/_shared/whatsappTransactionAi';
import { parseQuantityOnlySale } from '../../../../supabase/functions/_shared/whatsappQuantitySale';

// MEASURED FAILURE, straight after the model was put in front of the parsers:
//
//   nimeuza nguvu ya sala 7 jumla
//   -> "nguvu ya sala 7 — umeuza kwa bei gani? rejareja … jumla …"
//
// The sentence had already answered that question. The deterministic parser
// read "jumla" perfectly — it always had — but the tool schema the model fills
// in had nowhere to put the word, so it was dropped on the way through and the
// server had to ask. Putting the model first is right; losing a word the trader
// said is not.
//
// The model carries the WORD. The server decides what it is worth.

const candidate = (wording: unknown) => validateAiTransactionCandidate({
  kind: 'sale',
  party_name: null,
  payment_method: null,
  missing_fields: [],
  credit_wording: null,
  occurred_at_wording: null,
  price_band_wording: wording,
  lines: [{ product: 'nguvu ya sala', quantity: 7, unit: null }],
});

const bandOf = (wording: unknown) => {
  const result = candidate(wording);
  expect(result).not.toBeNull();
  return (result as { sale: { items: Array<{ band: string | null }> } }).sale.items[0].band;
};

describe('the price the trader named survives the model', () => {
  it.each([
    ['jumla', 'wholesale'],
    ['wholesale', 'wholesale'],
    ['rejareja', 'retail'],
    ['retail', 'retail'],
  ])('reads %s as %s', (wording, band) => {
    expect(bandOf(wording)).toBe(band);
  });

  it('asks when the trader said nothing', () => {
    expect(bandOf(null)).toBeNull();
  });

  it('asks rather than guessing at a word it does not know', () => {
    expect(bandOf('kitu kingine')).toBeNull();
  });

  it('carries a word, never a number', () => {
    const tool = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/whatsappAssistant.ts'), 'utf8');
    const schema = tool.slice(tool.indexOf('price_band_wording'), tool.indexOf('price_band_wording') + 400);
    expect(schema).toContain("type: 'string'");
    expect(schema).not.toContain('number');
  });
});

describe('the deterministic reading is unchanged', () => {
  // It always read this correctly. The regression was upstream of it.
  it.each([
    ['nimeuza nguvu ya sala 7 jumla', 'wholesale'],
    ['nimeuza punch 4 rejareja', 'retail'],
    ['nimeuza punch 4 leo', null],
  ])('still reads %s', (said, band) => {
    expect(parseQuantityOnlySale(said)?.items[0].band ?? null).toBe(band);
  });
});
