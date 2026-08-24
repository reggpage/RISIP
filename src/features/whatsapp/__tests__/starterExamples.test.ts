import { describe, expect, it } from 'vitest';
import { businessWelcome, starterExample } from '../../../../supabase/functions/_shared/whatsappStarterExamples';
import { parseNewProductLine } from '../../../../supabase/functions/_shared/whatsappNewProduct';

describe('examples a shopkeeper recognises', () => {
  it('shows a bakery cakes, not a dictionary', () => {
    // MEASURED FAILURE: "Allen's cake" was welcomed with Kamusi, Daftari and a
    // kilo of sugar. The owner: "mifano haiendani na biashara kabisa".
    const eg = starterExample('Food & Beverages', 'Bakery');
    expect(eg.register.join(' ')).toMatch(/Keki|Mkate/);
    expect(eg.register.join(' ')).not.toMatch(/Kamusi|Daftari/);
  });

  it('shows a chips kijiwe its own goods', () => {
    const eg = starterExample('Food & Beverages', 'Kijiwe cha Chips');
    expect(eg.register.join(' ')).toMatch(/Chips/);
    expect(eg.sold.join(' ')).toMatch(/zege|kavu/);
  });

  it('falls back to the category, then to a general shop', () => {
    expect(starterExample('Food & Beverages', 'Something Unlisted').register.join(' '))
      .toMatch(/Wali|Chai/);
    expect(starterExample(null, null).register.join(' ')).toMatch(/Sukari|Sabuni|Soda/);
  });

  it('always gives all three shapes, so the welcome is never half-written', () => {
    for (const sub of ['Bakery', 'Mama Lishe', 'Kijiwe cha Chips', null]) {
      const eg = starterExample(null, sub);
      expect(eg.register.length, String(sub)).toBeGreaterThan(0);
      expect(eg.sold.length, String(sub)).toBeGreaterThan(0);
      expect(eg.onShelf.length, String(sub)).toBeGreaterThan(0);
    }
  });
});

describe('the welcome message teaches what actually works', () => {
  const welcome = businessWelcome('Asha', 'Duka la Asha', 'Retail & General Stores', "Duka la Mang'aa / Rejareja", 'sw');

  it('teaches three words, one for each thing a shop does', () => {
    expect(welcome).toContain('*nasajili bidhaa*');
    expect(welcome).toContain('*mauzo*');
    expect(welcome).toContain('*hesabu bidhaa*');
    expect(welcome).not.toContain('*naongeza bidhaa*');
    expect(welcome).toContain('nimenunua sabuni 20 kila moja TSh 1,500');
  });

  it('shows one line with both prices, and says which is used by default', () => {
    // A shop shown only retail examples never registers a wholesale price, and
    // then gets asked "rejareja au jumla?" on every sale.
    expect(welcome).toMatch(/rejareja \d+ jumla \d+ kuanzia \d+/);
    expect(welcome).toContain('Usipotaja rejareja au jumla, natumia rejareja');
    expect(welcome).toContain('nusu');
    expect(welcome).toContain('robo');
  });

  it('does not print the same product twice in the price list', () => {
    const lines = welcome.split('\n').filter((line) => line.includes('@'));
    const names = lines.map((line) => line.replace(/^_/, '').split(' ')[0].toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('every registration example it prints actually parses', () => {
    const eg = starterExample('Retail & General Stores', "Duka la Mang'aa / Rejareja");
    for (const line of [...eg.register, eg.bulk]) {
      expect(parseNewProductLine(line), line).not.toBeNull();
    }
  });

  it('every trade has a working bulk example', () => {
    for (const sub of ['Kijiwe cha Chips', 'Mama Lishe', 'Bakery', 'Genge la Mboga na Matunda',
      'Duka la Vinywaji na Grocery', null]) {
      const eg = starterExample(null, sub);
      const parsed = parseNewProductLine(eg.bulk);
      expect(parsed, String(sub)).not.toBeNull();
      expect(parsed?.wholesale, String(sub)).toBeGreaterThan(0);
      expect(parsed?.wholesaleMinQty, String(sub)).toBeGreaterThan(0);
    }
  });
});
