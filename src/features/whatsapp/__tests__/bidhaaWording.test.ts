import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDailyRecordConfirmation } from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import { parseStockCountBatch } from '../../../../supabase/functions/_shared/whatsappStockBatch';
import { businessWelcome } from '../../../../supabase/functions/_shared/whatsappStarterExamples';

// The shop's own instruction: these are bidhaa, not "stock" and not "hisa".
// Swahili replies say bidhaa. What a trader may TYPE is untouched — "stock" is
// vocabulary shops already have, and taking it away would break working habits.

describe('Swahili replies call them bidhaa', () => {
  it('labels goods coming in as Ununuzi wa bidhaa', () => {
    const confirmation = buildDailyRecordConfirmation({
      kind: 'stock_purchase',
      amount: 90000,
      partyName: null,
      description: null,
      lines: [{ description: 'viazi', quantity: 2, unit_amount: 45000, unit: 'gunia' }],
      confidence: 0.99,
    }, 'sw');
    expect(confirmation).toContain('Ununuzi wa bidhaa');
    expect(confirmation).not.toContain('Ununuzi wa stock');
  });

  it('leaves no Swahili reply calling them stock or hisa', () => {
    const files = [
      'whatsappDailyRecords.ts', 'whatsappDailyRecordBatch.ts', 'whatsappStock.ts',
      'whatsappPortions.ts', 'whatsappHypotheticalProfit.ts', 'whatsappStarterExamples.ts',
      'whatsappConversationMemory.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared', file), 'utf8');
      // Only the phrases that were actually printed at a shopkeeper. The same
      // files still MATCH on "stock" and "hisa" in their input patterns, and
      // deliberately so — a broader sweep here would be asserting the opposite
      // of what was asked for.
      for (const printed of [
        'Ununuzi wa stock',
        'hesabu ya stock yote',
        'hesabu ya stock sasa',
        'stock yote iliyopo',
        'Unit ya stock',
        'manunuzi ya stock',
        'stock iliyopo sasa*',
        'haina stock inayoweza',
        'ukiuza stock yote',
        'stock count ya kuanzia',
      ]) {
        expect(source, `${file} :: ${printed}`).not.toContain(printed);
      }
    }
  });
});

describe('what a trader may type is not narrowed', () => {
  const lines = 'viazi 4\nmayai 12';

  // The welcome now says "hesabu bidhaa". A suggestion the parser rejects is
  // worse than no suggestion, so the two are checked against each other here.
  it('accepts the words the welcome message teaches', () => {
    const welcome = businessWelcome('Asha', 'Duka la Asha', 'Retail & General Stores', "Duka la Mang'aa / Rejareja", 'sw');
    expect(welcome).toContain('*hesabu bidhaa*');
    expect(parseStockCountBatch(`hesabu bidhaa\n${lines}`)).not.toBeNull();
  });

  it('still accepts stock, which shops already use', () => {
    expect(parseStockCountBatch(`hesabu stock\n${lines}`)).not.toBeNull();
    expect(parseStockCountBatch(`stock count\n${lines}`)).not.toBeNull();
  });
});
