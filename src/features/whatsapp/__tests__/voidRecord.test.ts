import { describe, expect, it } from 'vitest';
import {
  findUnregisteredMeasure,
  normalizeVoidTarget,
  parseVoidRequest,
  voidConfirmation,
  unregisteredMeasureQuestion,
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
    expect(said).toContain('*1* Ndiyo · *2* Hapana');
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

describe('goods the shop weighs, before anybody said how', () => {
  const catalogue = ['daftari', 'kalamu', 'Velvet napkin', 'Sodaa'];

  // The owner's words: "kama mtu akiandika bidhaa za kupima kama unga, chips au
  // mafuta na store yake hakuna usajili wa hizi bidhaa, mwambie kwanza."
  // "Nimeuza unga 3" is three of something, and three of something is a number
  // no report can use afterwards.
  it('stops on a measured good with no measure and no registration', () => {
    for (const said of ['nimeuza unga 3', 'nimeuza sukari 5', 'nimeuza mafuta 2', 'nimeuza viazi 10']) {
      expect(findUnregisteredMeasure(said, catalogue), said).not.toBeNull();
    }
  });

  it('says nothing when the measure is right there in the message', () => {
    for (const said of ['nimeuza unga kilo 3', 'nimeuza mafuta lita 2', 'nimeuza sukari robo']) {
      expect(findUnregisteredMeasure(said, catalogue), said).toBeNull();
    }
  });

  // A product already in the catalogue has been measured once. Asking again
  // every time it is sold would be worse than never asking.
  it('never asks twice about a product the shop already sells', () => {
    expect(findUnregisteredMeasure('nimeuza unga 3', [...catalogue, 'unga'])).toBeNull();
    expect(findUnregisteredMeasure('nimeuza unga 3', [...catalogue, 'unga wa ngano'])).toBeNull();
  });

  it('leaves counted goods entirely alone', () => {
    for (const said of ['nimeuza daftari 5', 'nimeuza kalamu 3', 'nimeuza Velvet napkin 2']) {
      expect(findUnregisteredMeasure(said, catalogue), said).toBeNull();
    }
  });

  it('asks in a way that can be answered', () => {
    const said = unregisteredMeasureQuestion('unga', 'sw');
    expect(said).toContain('unga');
    // It has to show the SHAPE of the reply, not just refuse.
    expect(said).toContain('[kipimo chako]');
    expect(said).toContain('[shilingi]');
  });

  // MEASURED FAILURE, from the owner's own screenshot: this question printed
  // the same three examples for every product on the list, so a shop that had
  // just mentioned eggs was told to answer "Mayai nauza kwa kilo" or "gunia
  // moja ni kilo 100". Nobody sells eggs by the kilo or by the sack. Two
  // impossible suggestions and one usable one reads as a machine that does not
  // know what an egg is — and the shop is the authority on its own measures
  // anyway, so suggesting any unit was the mistake.
  it('never suggests a measure that makes no sense for the product', () => {
    const eggs = unregisteredMeasureQuestion('mayai', 'sw');
    expect(eggs).not.toContain('kilo');
    expect(eggs).not.toContain('gunia');
    // And the same question, for flour, must not have picked up an egg unit.
    expect(unregisteredMeasureQuestion('unga', 'sw')).not.toContain('trei');
  });
});

describe('a measure the shop already named', () => {
  const catalogue = ['daftari', 'kalamu'];

  // MEASURED FAILURE, from the owner's own screenshot:
  //   "nimeingiza trei 3 na mayai 15 leo"
  // was answered "siwezi kujua '3' ni kilo tatu, gunia tatu au vipande
  // vitatu" — about a sentence whose SECOND WORD is the measure. The cause
  // was a third private copy of the measure vocabulary in whatsappVoid.ts
  // that was missing "trei" (and mita, futi, boksi, rimu, dazeni, kipande,
  // katoni, kreti...). It now reads the one shared UNITS list.
  it('says nothing when the measure is right there in the message', () => {
    for (const said of [
      'nimeingiza trei 3 na mayai 15 leo',
      'nimeuza mayai trei 3',
      'nimeuza mayai dazeni 2',
      'nimeuza mafuta dumu 1',
      'nimeuza sukari kiroba 2',
    ]) {
      expect(findUnregisteredMeasure(said, catalogue), said).toBeNull();
    }
  });

  // The guard must still fire when NO measure is named at all — that is the
  // whole reason it exists.
  it('still asks when the sentence names no measure anywhere', () => {
    expect(findUnregisteredMeasure('nimeuza mayai 3', catalogue)).not.toBeNull();
    expect(findUnregisteredMeasure('nimeuza unga 5', catalogue)).not.toBeNull();
  });
});
