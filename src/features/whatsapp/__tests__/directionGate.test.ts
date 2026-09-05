import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { messageStatesDirection } from '../../../../supabase/functions/_shared/whatsappDirection';
import { validateAiEventDirection } from '../../../../supabase/functions/_shared/whatsappAiDirection';

// THE SERVER ASKS. IT DOES NOT WAIT FOR THE MODEL TO ADMIT IT DOES NOT KNOW.
//
// The owner's rule, given twice and the second time in anger: "kila record
// yenye idadi ya bidhaa ai inabidi iulize swali kwanza". Every record carrying
// product quantities asks first — MAUZO, STOCK or MANUNUZI — unless the message
// already said which.
//
// MEASURED, and it is why this moved out of the model's hands. The tool was
// given a `direction` entry in missing_fields and a description spelling out
// that a bare list is three different messages wearing the same clothes. Handed
// nine products with no verb anywhere, the model chose stock_count and drafted
// it, setting no missing field at all — telemetry 14:35:49,
// propose_business_event / stock_count / drafted. A guard that waits for the
// model to say "I don't know" never fires, because the model did not think it
// did not know.
//
// THE ASYMMETRY SETS THE WORD LIST. Asking when we need not costs one tap. Not
// asking when we should have erases a day's takings and overwrites the shelf in
// the same stroke. So only unmistakable words count as a direction, and
// anything doubtful is deliberately left out — leaving it out means we ask.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('messages that DO say what happened', () => {
  const stated = [
    'nimeuza daftari 5',
    'niliuza biblia 3 jana',
    'tumeuza chaki 60',
    'mauzo ya leo: daftari 9',
    'nimenunua sabuni 20',
    'nilinunua mafuta 5',
    'manunuzi: kikokoto 13',
    'nimeongeza stock daftari 40',
    'nimehesabu bidhaa zilizopo',
    'nilizonazo daftari 90',
    'birika ziwe 100',
    'stock: daftari 90',
    'Juma amechukua daftari 3 kwa deni',
    'sukari imeoza kilo 4',
    'sold 12 pens',
    'stock count leo',
  ];
  for (const said of stated) {
    it(`does not ask for "${said}"`, () => {
      expect(messageStatesDirection(said)).toBe(true);
    });
  }
});

describe('messages that do NOT say, and must be asked about', () => {
  const bare = [
    'Nguvu ya sala 9\nPuch 17\nDasan 7 biblia 30 rosali 7 kitabu 20 atlas 8 kikokoto 13 chaki 60',
    'daftari 90',
    'daftari 90\nkalamu 240',
    'biblia 30 rosali 7',
    'chaki 60, atlas 8',
    '',
  ];
  for (const said of bare) {
    it(`asks for "${said.slice(0, 40).replace(/\n/g, ' / ') || '(empty)'}"`, () => {
      expect(messageStatesDirection(said)).toBe(false);
    });
  }

  it('is not fooled by a product name that merely contains a verb’s letters', () => {
    // "kitabu" is a book, not a purchase. If a word like this ever silently
    // counted as a direction, the gate would stop asking and nobody would know.
    expect(messageStatesDirection('kitabu 20')).toBe(false);
    expect(messageStatesDirection('rosali 7')).toBe(false);
    expect(messageStatesDirection('atlas 8')).toBe(false);
  });
});

describe('the AI meaning boundary in the webhook', () => {
  const branch = webhook.slice(
    webhook.indexOf('const direction = validateAiEventDirection(input)'),
    webhook.indexOf('const direction = validateAiEventDirection(input)') + 2400,
  );

  it('requires an explicit AI interpretation and asks when ambiguous', () => {
    expect(branch).toContain('validateAiEventDirection(input)');
    expect(validateAiEventDirection({ kind: 'sale' })).toBe('invalid');
    expect(validateAiEventDirection({ kind: 'sale', direction: 'unclear' })).toBe('clarify');
    expect(validateAiEventDirection({ kind: 'sale', direction: null })).toBe('invalid');
  });

  it('rejects contradictory direction and ledger kind', () => {
    expect(validateAiEventDirection({ kind: 'stock_purchase', direction: 'sale' })).toBe('invalid');
    expect(validateAiEventDirection({ kind: 'sale', direction: 'purchase' })).toBe('invalid');
    expect(validateAiEventDirection({ kind: 'stock_count', direction: 'purchase' })).toBe('invalid');
  });

  it('keeps customer credit and supplier liability in opposite directions', () => {
    expect(validateAiEventDirection({ kind: 'credit_sale', direction: 'sale' })).toBe('known');
    expect(validateAiEventDirection({ kind: 'supplier_credit_purchase', direction: 'purchase' })).toBe('known');
    expect(validateAiEventDirection({ kind: 'supplier_credit_purchase', direction: 'sale' })).toBe('invalid');
  });

  it('does not let a legacy word list overrule the model in the executor', () => {
    expect(webhook).not.toContain('messageStatesDirection(said)');
    expect(validateAiEventDirection({ kind: 'sale', direction: 'sale', missing_fields: ['direction'] })).toBe('clarify');
  });
});
