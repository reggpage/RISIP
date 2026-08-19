import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseBareExpense,
  parseBareQuantityList,
  stripTrailingChatter,
  parseQuantityOnlySale,
  priceLine,
  quantitySaleConfirmation,
} from '../../../../supabase/functions/_shared/whatsappQuantitySale';
import { parseSellingPriceBatch } from '../../../../supabase/functions/_shared/whatsappSellingPriceBatch';
import { parseSellingPrice } from '../../../../supabase/functions/_shared/whatsappSellingPrice';

describe('a sale that names quantities and no money', () => {
  it('reads the owner’s own message', () => {
    // "Nimuza nguvu ya sala 8 marker 7 na anton wa padua 6" — sent for real,
    // and answered with a request for all three prices.
    expect(parseQuantityOnlySale('Nimuza nguvu ya sala 8, marker 7 na anton wa padua 6')?.items)
      .toEqual([
        { product: 'nguvu ya sala', quantity: 8, band: null },
        { product: 'marker', quantity: 7, band: null },
        { product: 'anton wa padua', quantity: 6, band: null },
      ]);
  });

  it('reads a single product', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 5')?.items)
      .toEqual([{ product: 'daftari', quantity: 5, band: null }]);
  });

  it('keeps three-word names whole', () => {
    expect(parseQuantityOnlySale('nimeuza st rita wa kashia 3')?.items)
      .toEqual([{ product: 'st rita wa kashia', quantity: 3, band: null }]);
  });
});

describe('what it must never take', () => {
  it('leaves a sale that states its own prices alone', () => {
    // This is the comma-list case, and it must keep its money.
    expect(parseQuantityOnlySale('nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500')).toBeNull();
    expect(parseQuantityOnlySale('nimeuza daftari 10 kila moja 1500')).toBeNull();
    expect(parseQuantityOnlySale('nimeuza nguvu ya sala 2 kwa 20000')).toBeNull();
    expect(parseQuantityOnlySale('nimeuza daftari 5 jumla 7500')).toBeNull();
  });

  it('leaves anything that is not a sale alone', () => {
    expect(parseQuantityOnlySale('nina daftari 90')).toBeNull();
    expect(parseQuantityOnlySale('hesabu ya stock')).toBeNull();
    expect(parseQuantityOnlySale('bei ya daftari rejareja 1500')).toBeNull();
    expect(parseQuantityOnlySale('')).toBeNull();
  });

  it('refuses a multi-line message, which belongs to the batch parser', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 5\nkalamu 3')).toBeNull();
  });
});

describe('pricing a line from the shop’s own list', () => {
  const pricing = { retail: 10000, wholesale: 9000, wholesaleMinQty: 5 };

  it('uses the trade price once the quantity reaches the threshold', () => {
    expect(priceLine({ product: 'nguvu ya sala', quantity: 8, band: null }, pricing))
      .toEqual({ product: 'nguvu ya sala', quantity: 8, unitPrice: 9000, band: 'wholesale' });
  });

  it('uses retail below the threshold', () => {
    expect(priceLine({ product: 'nguvu ya sala', quantity: 2, band: null }, pricing)?.unitPrice).toBe(10000);
  });

  it('gives the trade price at any quantity when it is by relationship', () => {
    expect(priceLine({ product: 'biblia', quantity: 1, band: null }, { retail: 20000, wholesale: 18000, wholesaleMinQty: null })?.band)
      .toBe('wholesale');
  });

  it('returns nothing when the shop never set a price', () => {
    expect(priceLine({ product: 'marker', quantity: 7, band: null }, { retail: null, wholesale: null, wholesaleMinQty: null }))
      .toBeNull();
  });
});

describe('what the trader is shown', () => {
  it('shows the arithmetic per line and says which price was used', () => {
    const reply = quantitySaleConfirmation([
      { product: 'nguvu ya sala', quantity: 8, unitPrice: 9000, band: 'wholesale' },
      { product: 'daftari', quantity: 2, unitPrice: 1500, band: 'retail' },
    ], 'sw');
    expect(reply).toContain('nguvu ya sala: 8 × TSh 9,000 (jumla) = TSh 72,000');
    expect(reply).toContain('daftari: 2 × TSh 1,500 = TSh 3,000');
    expect(reply).toContain('TSh 75,000');
    expect(reply).toMatch(/NDIYO/);
  });

  it('says the prices came from the trader, not from itself', () => {
    const reply = quantitySaleConfirmation(
      [{ product: 'daftari', quantity: 2, unitPrice: 1500, band: 'retail' }], 'sw');
    expect(reply).toMatch(/ulizoziweka mwenyewe/);
  });
});

describe('a till roll written one product per line', () => {
  it('reads the owner’s real thirty-line paste', () => {
    // The message that failed: quantities only, one per line, after the price
    // list was already set. It was refused outright because it had newlines.
    const sale = parseQuantityOnlySale(
      'nimeuza daftari 10\nnimeuza kalamu 20\nnimeuza penseli 25\nnimeuza rula 8');
    expect(sale?.items).toEqual([
      { product: 'daftari', quantity: 10, band: null },
      { product: 'kalamu', quantity: 20, band: null },
      { product: 'penseli', quantity: 25, band: null },
      { product: 'rula', quantity: 8, band: null },
    ]);
  });

  it('keeps phrase names across lines', () => {
    expect(parseQuantityOnlySale('nimeuza nguvu ya sala 5\nnimeuza kitabu cha hesabu 6')?.items)
      .toEqual([
        { product: 'nguvu ya sala', quantity: 5, band: null },
        { product: 'kitabu cha hesabu', quantity: 6, band: null },
      ]);
  });

  it('keeps a product sold twice as two lines, so each is banded on its own', () => {
    // MEASURED FAILURE: adding these together first meant the COMBINED quantity
    // was compared against the wholesale threshold. Four retail sales of daftari
    // — 10, 20, 10, 8 — became one sale of 48, crossed the 12-piece threshold,
    // and all forty-eight were priced as a trade sale nobody asked for.
    expect(parseQuantityOnlySale('nimeuza daftari 10\nnimeuza daftari 5')?.items)
      .toEqual([
        { product: 'daftari', quantity: 10, band: null },
        { product: 'daftari', quantity: 5, band: null },
      ]);
  });

  it('bands each of them on its own quantity', () => {
    const sale = parseQuantityOnlySale('nimeuza daftari 20\nnimeuza daftari 8')!;
    const pricing = { retail: 1500, wholesale: 1300, wholesaleMinQty: 12 };
    expect(sale.items.map((item) => priceLine(item, pricing))).toEqual([
      { product: 'daftari', quantity: 20, unitPrice: 1300, band: 'wholesale' },
      { product: 'daftari', quantity: 8, unitPrice: 1500, band: 'retail' },
    ]);
  });

  it('still reads several products joined on one of the lines', () => {
    expect(parseQuantityOnlySale('nimeuza kalamu 12 na daftari 8\nnimeuza chaki 6 na duster 4')?.items)
      .toEqual([
        { product: 'kalamu', quantity: 12, band: null },
        { product: 'daftari', quantity: 8, band: null },
        { product: 'chaki', quantity: 6, band: null },
        { product: 'duster', quantity: 4, band: null },
      ]);
  });

  it('refuses the whole paste when one line states a price', () => {
    // Half a till roll priced from the list and half from the message would be
    // two different kinds of number added together.
    expect(parseQuantityOnlySale('nimeuza daftari 10\nnimeuza kalamu 3 kwa 1500')).toBeNull();
  });

  it('refuses the whole paste when one line is not a sale', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 10\nfaida ya leo ni ngapi')).toBeNull();
  });
});

describe('saying which price was charged', () => {
  const pricing = { retail: 1500, wholesale: 1300, wholesaleMinQty: 12 };

  it('treats a line with no word as retail, because that is the default', () => {
    // The owner's rule: "mtu asipoandika rejareja ujue hiyo ni rejareja."
    const sale = parseQuantityOnlySale('nimeuza daftari 5');
    expect(sale?.items[0].band).toBeNull();
    expect(priceLine(sale!.items[0], pricing)).toMatchObject({ unitPrice: 1500, band: 'retail' });
  });

  it('takes "jumla" as the trade price even below the threshold', () => {
    const sale = parseQuantityOnlySale('nimeuza daftari 5 jumla');
    expect(sale?.items[0]).toEqual({ product: 'daftari', quantity: 5, band: 'wholesale' });
    expect(priceLine(sale!.items[0], pricing)).toMatchObject({ unitPrice: 1300, band: 'wholesale' });
  });

  it('takes "rejareja" as retail even above the threshold', () => {
    // A bulk buyer who is not a regular still pays retail, and the person at
    // the counter is the one who knows which this was.
    const sale = parseQuantityOnlySale('nimeuza daftari 20 rejareja');
    expect(sale?.items[0].band).toBe('retail');
    expect(priceLine(sale!.items[0], pricing)).toMatchObject({ unitPrice: 1500, band: 'retail' });
  });

  it('does not swallow the word into the product name', () => {
    expect(parseQuantityOnlySale('nimeuza nguvu ya sala 8 jumla')?.items)
      .toEqual([{ product: 'nguvu ya sala', quantity: 8, band: 'wholesale' }]);
  });

  it('applies the word to every product on its line', () => {
    expect(parseQuantityOnlySale('nimeuza kalamu 12 na daftari 8 jumla')?.items)
      .toEqual([
        { product: 'kalamu', quantity: 12, band: 'wholesale' },
        { product: 'daftari', quantity: 8, band: 'wholesale' },
      ]);
  });

  it('lets each line of a till roll choose for itself', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 20 jumla\nnimeuza kalamu 3')?.items)
      .toEqual([
        { product: 'daftari', quantity: 20, band: 'wholesale' },
        { product: 'kalamu', quantity: 3, band: null },
      ]);
  });
});

describe('closing a day in one paste', () => {
  it('takes the spending written at the foot of the till roll', () => {
    // The owner's real message: forty-eight lines, the last three of which were
    // expenses. The whole paste used to be refused because of those three.
    const sale = parseQuantityOnlySale(
      'nimeuza daftari 10\nnimeuza kalamu 20\n\nMatumizi 15000\nChakula 1200\nNauli 9500');
    expect(sale?.items).toEqual([
      { product: 'daftari', quantity: 10, band: null },
      { product: 'kalamu', quantity: 20, band: null },
    ]);
    expect(sale?.expenses).toEqual([
      { label: 'Matumizi', amount: 15000 },
      { label: 'Chakula', amount: 1200 },
      { label: 'Nauli', amount: 9500 },
    ]);
  });

  it('is not fooled by a quantity into calling it spending', () => {
    // The selling verb is the discriminator, never the size of the number.
    expect(parseQuantityOnlySale('nimeuza daftari 10\nnimeuza kalamu 9500')?.expenses).toEqual([]);
  });

  it('ignores a number too small to be money', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 10\nChakula 40')).toBeNull();
  });

  it('still refuses a paste with a line that is neither', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 10\nfaida ya leo ni ngapi')).toBeNull();
  });

  it('never nets the spending off the takings', () => {
    const reply = quantitySaleConfirmation(
      [{ product: 'daftari', quantity: 10, unitPrice: 1500, band: 'retail' }],
      'sw',
      [{ label: 'Nauli', amount: 9500 }]);
    expect(reply).toContain('Jumla ya mauzo: *TSh 15,000*');
    expect(reply).toContain('Nauli: TSh 9,500');
    expect(reply).toContain('Jumla ya matumizi: *TSh 9,500*');
    expect(reply).not.toContain('5,500');
  });
});

describe('names that contain a digit', () => {
  it('reads a product whose name has a number in it', () => {
    // "karatasi A4 rimu" is a real product on this shelf. Excluding digits from
    // names made that ONE line unreadable, and in an all-or-nothing paste that
    // silently refused the other forty-four.
    expect(parseQuantityOnlySale('nimeuza karatasi A4 rimu 2')?.items)
      .toEqual([{ product: 'karatasi A4 rimu', quantity: 2, band: null }]);
  });

  it('still takes the last number as the quantity', () => {
    expect(parseQuantityOnlySale('nimeuza karatasi A4 rimu 1 na bahasha 20')?.items)
      .toEqual([
        { product: 'karatasi A4 rimu', quantity: 1, band: null },
        { product: 'bahasha', quantity: 20, band: null },
      ]);
  });

  it('will not start a name with a digit', () => {
    expect(parseQuantityOnlySale('nimeuza 4 5')).toBeNull();
  });
});

describe('a name it cannot price, in a long paste', () => {
  it('names it directly above the question instead of hiding it', () => {
    const reply = quantitySaleConfirmation(
      [{ product: 'daftari', quantity: 10, unitPrice: 1500, band: 'retail' }],
      'sw', [], ['biblia']);
    expect(reply).toContain('biblia');
    expect(reply).toMatch(/sijazihesabu/);
    expect(reply.indexOf('biblia')).toBeLessThan(reply.indexOf('NDIYO'));
  });

  it('still shows the total for everything it could price', () => {
    // The alternative — refusing all forty-eight lines over one name — is a
    // request nobody retypes.
    const reply = quantitySaleConfirmation(
      [{ product: 'daftari', quantity: 10, unitPrice: 1500, band: 'retail' }],
      'sw', [], ['biblia']);
    expect(reply).toContain('Jumla ya mauzo: *TSh 15,000*');
  });

  it('says nothing extra when everything was priced', () => {
    const reply = quantitySaleConfirmation(
      [{ product: 'daftari', quantity: 10, unitPrice: 1500, band: 'retail' }], 'sw');
    expect(reply).not.toMatch(/sijazihesabu/);
  });
});

describe('the warning actually reaching the message', () => {
  it('is wired from the pricing result to the confirmation', () => {
    // MEASURED FAILURE: notCounted was computed, typed into the return signature,
    // and then left off the returned object. priced.notCounted was undefined, the
    // default [] took over, and "biblia" vanished from a forty-eight-line paste
    // without a word. Nothing caught it: this file is not in the app's tsconfig
    // project, so tsc never type-checks it.
    const webhook = readFileSync(
      resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    // The stronger guarantee, added when the design moved on: a product the
    // catalogue has never heard of now gets its OWN branch and its own offer.
    // It is never quietly left out of a sale, and never turned into an
    // anonymous one under a name nobody recognises.
    expect(webhook).toContain("return { kind: 'unknown', products: unknown, sale }");
    expect(webhook).toContain('newProductSaleOffer(');
    expect(webhook).toContain('priced.notCounted');
  });
});

describe('the word "mauzo" standing at the top of a list', () => {
  it('applies the header to every line beneath it', () => {
    // The owner's idea: one word says what the block is, instead of every line
    // repeating "nimeuza".
    expect(parseQuantityOnlySale('mauzo\nsukari 2\nkamusi 1')?.items).toEqual([
      { product: 'sukari', quantity: 2, band: null },
      { product: 'kamusi', quantity: 1, band: null },
    ]);
  });

  it('still takes it on one line, the way it already worked', () => {
    expect(parseQuantityOnlySale('mauzo sukari 2, kamusi 1')?.items).toHaveLength(2);
  });

  it('leaves a header with nothing under it alone', () => {
    expect(parseQuantityOnlySale('mauzo')).toBeNull();
  });
});

describe('a sale with no verb in front of it', () => {
  it('reads what the owner actually typed', () => {
    // "sentences should not depend on kitenzi" — their words, after
    // "Nguvu ya sala 21" was answered with a request for a price already saved.
    expect(parseBareQuantityList('Nguvu ya sala 21')?.items)
      .toEqual([{ product: 'Nguvu ya sala', quantity: 21, band: null }]);
    expect(parseBareQuantityList('kitabu cha hesabu 7, biblia 3, nguvu ya sala 20')?.items)
      .toEqual([
        { product: 'kitabu cha hesabu', quantity: 7, band: null },
        { product: 'biblia', quantity: 3, band: null },
        { product: 'nguvu ya sala', quantity: 20, band: null },
      ]);
  });

  it('still lets the band be stated', () => {
    expect(parseBareQuantityList('daftari 20 jumla')?.items)
      .toEqual([{ product: 'daftari', quantity: 20, band: 'wholesale' }]);
  });

  it('leaves a message that already has a verb to the other parser', () => {
    // Two parsers claiming one message is how a sale gets recorded twice.
    expect(parseBareQuantityList('nimeuza daftari 10')).toBeNull();
  });

  it('never claims a question', () => {
    for (const said of [
      'daftari ziko ngapi', 'bidhaa gani inauza sana', 'nani ananidai',
      'mauzo ya leo ni ngapi?',
    ]) {
      expect(parseBareQuantityList(said), said).toBeNull();
    }
  });

  it('never claims a shelf count or a price list', () => {
    for (const said of [
      'nina daftari 90', 'hesabu ya stock', 'store daftari 90',
      'bei ya daftari rejareja 1500', 'ninazo daftari 90',
    ]) {
      expect(parseBareQuantityList(said), said).toBeNull();
    }
  });

  it('never claims anything naming money', () => {
    expect(parseBareQuantityList('daftari 10 kwa 15000')).toBeNull();
    expect(parseBareQuantityList('Nauli 9500')).toBeNull();
  });

  it('is wired so it only claims a message the catalogue recognises', () => {
    // The words alone cannot tell a sale from a shelf count. The catalogue can.
    const webhook = readFileSync(
      resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(webhook).toContain('const bare = parseBareQuantityList(writeBody);');
    expect(webhook).toContain("priced.kind === 'priced' && priced.notCounted.length === 0");
  });
});

describe('the three rules the owner wrote out', () => {
  it('ignores the chatter after the figure', () => {
    // "mihogo 18 leo", "zege 3 tu, leo mambo hovyo" — the number is the message
    // and the rest is how somebody talks.
    expect(stripTrailingChatter('mihogo 18 leo')).toBe('mihogo 18');
    expect(stripTrailingChatter('zege 3 tu, leo mambo hovyo')).toBe('zege 3');
    expect(stripTrailingChatter('chipsi zege 12 leo')).toBe('chipsi zege 12');
    expect(parseBareQuantityList('mihogo 18 leo')?.items)
      .toEqual([{ product: 'mihogo', quantity: 18, band: null }]);
  });

  it('does not cut a word that is part of the name', () => {
    // Only the tail, and only from a closed list. "leo" mid-sentence stays.
    expect(stripTrailingChatter('daftari la leo 5')).toBe('daftari la leo 5');
    expect(stripTrailingChatter('nguvu ya sala 21')).toBe('nguvu ya sala 21');
  });

  it('reads a count written as a word', () => {
    expect(parseBareExpense('mafuta dumu moja 78000'))
      .toEqual([{ label: 'mafuta dumu 1', amount: 78000 }]);
  });

  it('reads buying that carries no verb at all', () => {
    expect(parseBareExpense('nyanya tenga 1 15000 na vitunguu 8000'))
      .toEqual([
        { label: 'nyanya tenga 1', amount: 15000 },
        { label: 'vitunguu', amount: 8000 },
      ]);
    expect(parseBareExpense('soda kreti 5 kwa 60000 kutoka bohari'))
      .toEqual([{ label: 'soda kreti 5', amount: 60000 }]);
  });

  it('needs a wholesale unit or a source, never just a big number', () => {
    // The size of a number proves nothing. "Nauli 9500" once became a sale of
    // nine and a half thousand for exactly this reason.
    expect(parseBareExpense('Nauli 9500')).toBeNull();
    expect(parseBareExpense('nguvu ya sala 21000')).toBeNull();
    expect(parseBareExpense('daftari 10')).toBeNull();
  });

  it('leaves anything with a verb to the parser that owns it', () => {
    expect(parseBareExpense('nimenunua sukari gunia 1 kwa 145000')).toBeNull();
    expect(parseBareExpense('nimeuza soda kreti 2')).toBeNull();
  });
});

describe('the till roll the owner actually pasted', () => {
  const roll = 'mauzo\ndaftari — 100\n daftari kubwa — 55\n daftari la graph — 23\nduster — 11';

  it('reads a dash between the product and its number', () => {
    // MEASURED FAILURE: WhatsApp turns a typed hyphen into an em dash by
    // itself, so this is what a phone produces, not an unusual way to write.
    // It broke the parser outright, the block fell to the daily-record parser,
    // and the owner was asked whether 100 was a price.
    expect(parseQuantityOnlySale(roll)?.items).toEqual([
      { product: 'daftari', quantity: 100, band: null },
      { product: 'daftari kubwa', quantity: 55, band: null },
      { product: 'daftari la graph', quantity: 23, band: null },
      { product: 'duster', quantity: 11, band: null },
    ]);
  });

  it('does not leave a hyphen stuck to the name', () => {
    // "daftari -" matches nothing in any catalogue.
    expect(parseQuantityOnlySale('mauzo\ndaftari - 100\nduster - 11')?.items)
      .toEqual([
        { product: 'daftari', quantity: 100, band: null },
        { product: 'duster', quantity: 11, band: null },
      ]);
  });

  it('keeps a dash that belongs to the name', () => {
    expect(parseQuantityOnlySale('nimeuza t-shirt 4')?.items)
      .toEqual([{ product: 't-shirt', quantity: 4, band: null }]);
  });

  it('takes the band off the header and gives it to every line', () => {
    expect(parseQuantityOnlySale('Mauzo rejareja\ndaftari — 100\nduster — 11')?.items)
      .toEqual([
        { product: 'daftari', quantity: 100, band: 'retail' },
        { product: 'duster', quantity: 11, band: 'retail' },
      ]);
  });

  it('lets each line override the header', () => {
    expect(parseQuantityOnlySale('Mauzo\ndaftari — 100 rejareja\nduster — 11 jumla')?.items)
      .toEqual([
        { product: 'daftari', quantity: 100, band: 'retail' },
        { product: 'duster', quantity: 11, band: 'wholesale' },
      ]);
  });

  it('is a sale, never a price change', () => {
    // MEASURED FAILURE: lines ending in "rejareja" made the price-list parser
    // claim it, and a hundred notebooks SOLD were saved as a price of a hundred
    // shillings. The header decides what the block is.
    expect(parseSellingPriceBatch('Mauzo\ndaftari — 100 rejareja\nduster — 11 jumla')).toBeNull();
    expect(parseSellingPrice('Mauzo\ndaftari — 100 rejareja\nduster — 11 jumla')).toBeNull();
  });

  it('still lets a real price list through', () => {
    expect(parseSellingPriceBatch('kamusi rejareja 15000\nmkasi rejareja 3500')).not.toBeNull();
    expect(parseSellingPrice('bei ya daftari rejareja 1500 jumla 1300 kuanzia 12')).not.toBeNull();
  });
});
