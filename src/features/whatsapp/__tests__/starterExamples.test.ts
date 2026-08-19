import { describe, expect, it } from 'vitest';
import { starterExample } from '../../../../supabase/functions/_shared/whatsappStarterExamples';

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
