import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { messageStatesDirection } from '../../../../supabase/functions/_shared/whatsappDirection';

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

describe('the gate in the webhook', () => {
  const branch = webhook.slice(
    webhook.indexOf('const ambiguousKind = event.kind'),
    webhook.indexOf('const ambiguousKind = event.kind') + 2400,
  );

  it('no longer waits for the model to volunteer it', () => {
    expect(branch).toContain('const directionUnstated = ambiguousKind');
    expect(branch).toContain('!messageStatesDirection(said)');
    // The model's own signal still works when it does send it.
    expect(branch).toContain("event.missingFields.includes('direction') || directionUnstated");
  });

  it('gates only the three readings that actually collide', () => {
    expect(branch).toContain("event.kind === 'sale'");
    expect(branch).toContain("event.kind === 'stock_purchase'");
    expect(branch).toContain("event.kind === 'stock_count'");
  });

  it('does not ask when a named customer or credit already settles it', () => {
    // "Juma daftari 3 kwa deni" needs no question: goods left the shop.
    expect(branch).toContain('Boolean(event.partyWording) || Boolean(event.creditWording)');
  });

  it('records why the model-dependent version could not work', () => {
    const at = webhook.indexOf('const ambiguousKind = event.kind');
    expect(webhook.slice(Math.max(0, at - 900), at))
      .toContain('never fires, because the model does');
  });
});
