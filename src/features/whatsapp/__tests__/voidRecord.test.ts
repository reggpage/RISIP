import { describe, expect, it } from 'vitest';
import {
  normalizeVoidTarget,
  parseVoidRequest,
  voidConfirmation,
  voidDone,
  type VoidTarget,
} from '../../../../supabase/functions/_shared/whatsappVoid';
import { parseSellingPriceBatch } from '../../../../supabase/functions/_shared/whatsappSellingPriceBatch';

// MEASURED FAILURE, the owner's own thread: a price change was misread as a
// stock count, the confirmation looked exactly like every other confirmation,
// they answered NDIYO, and four thousand phantom napkins went onto the shelf.
// There was no way to take it back from WhatsApp — the rows had to be deleted
// by somebody with database access.

const target: VoidTarget = {
  id: '5bd3f3c6-d76d-4760-a604-1d191b0f29b4',
  kind: 'sale',
  amount: 34_000,
  partyName: null,
  description: null,
  occurredAt: '2026-08-23T13:26:19.960Z',
  lines: [
    { description: 'nguvu ya sala', quantity: 2 },
    { description: 'Sabuni', quantity: 6 },
  ],
};

describe('taking back a confirmed record', () => {
  it('recognises the ways somebody asks to undo the last one', () => {
    for (const said of [
      'futa ile', 'futa rekodi ya mwisho', 'ondoa mauzo ya mwisho',
      'batilisha ile', 'delete that record', 'undo last entry',
    ]) {
      expect(parseVoidRequest(said), said).toBe(true);
    }
  });

  // "Ghairi" alone already cancels a draft that is waiting. A shopkeeper who
  // types it mid-confirmation means the draft, not the last thing they saved.
  it('leaves the draft-cancel word alone', () => {
    expect(parseVoidRequest('ghairi')).toBe(false);
    expect(parseVoidRequest('hapana')).toBe(false);
  });

  // "Futa daftari" is ambiguous between the product, its price and its count.
  // Guessing which would be the worst possible answer.
  it('refuses a request that does not say WHICH record', () => {
    expect(parseVoidRequest('futa daftari')).toBe(false);
    expect(parseVoidRequest('nimeuza daftari 5')).toBe(false);
    expect(parseVoidRequest('daftari ziko ngapi')).toBe(false);
  });

  it('names exactly what is about to go, before anything changes', () => {
    const said = voidConfirmation(target, 'sw');
    expect(said).toContain('TSh 34,000');
    expect(said).toContain('nguvu ya sala 2');
    expect(said).toContain('Sabuni 6');
    expect(said).toContain('NDIYO / HAPANA');
  });

  // A shopkeeper who can make a number vanish without trace has a tool for
  // hiding money from themselves.
  it('promises the record survives, marked voided', () => {
    expect(voidConfirmation(target, 'sw')).toContain('itabaki kwenye historia');
    expect(voidConfirmation(target, 'en')).toContain('stays in history');
    expect(voidDone(target, 'sw')).toContain('Imeondolewa kwenye hesabu');
  });

  it('checks the shape the database returns rather than trusting it', () => {
    expect(normalizeVoidTarget(null)).toBeNull();
    expect(normalizeVoidTarget({ id: '', amount: 10 })).toBeNull();
    expect(normalizeVoidTarget({ id: 'abc', amount: 'not a number' })).toBeNull();
    const clean = normalizeVoidTarget({
      id: 'abc', kind: 'expense', amount: 5000, occurred_at: '2026-08-23T13:26:19.960Z',
      lines: [{ description: 'umeme', quantity: 1 }, { description: '', quantity: 2 }],
    });
    expect(clean?.lines).toEqual([{ description: 'umeme', quantity: 1 }]);
  });
});

describe('both prices in one short sentence', () => {
  it('takes the trade price when it rides along', () => {
    expect(parseSellingPriceBatch('bei ya velvet iwe 4000 jumla 3500 na sodaa iwe 2000 jumla 1800')?.prices)
      .toEqual([
        { product: 'velvet', retail: 4000, wholesale: 3500, minQty: null },
        { product: 'sodaa', retail: 2000, wholesale: 1800, minQty: null },
      ]);
  });

  it('lets one carry a trade price and the other not', () => {
    expect(parseSellingPriceBatch('bei ya velvet iwe 4000 jumla 3500 na sodaa iwe 2000')?.prices)
      .toEqual([
        { product: 'velvet', retail: 4000, wholesale: 3500, minQty: null },
        { product: 'sodaa', retail: 2000, wholesale: null, minQty: null },
      ]);
  });

  // Saving two of three prices and dropping the third is worse than saving
  // none: the shop would never know which one did not take.
  it('refuses the whole list when a trade price is above retail', () => {
    expect(parseSellingPriceBatch('bei ya velvet iwe 4000 jumla 5000 na sodaa iwe 2000')).toBeNull();
  });
});
