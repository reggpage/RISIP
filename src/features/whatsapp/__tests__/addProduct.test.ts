import { describe, expect, it } from 'vitest';
import {
  parseAddProduct,
  productAlreadyExists,
  productLooksLikeExisting,
} from '../../../../supabase/functions/_shared/whatsappAddProduct';

describe('adding a product from WhatsApp', () => {
  it('takes a bare name, because the invoice is not always to hand', () => {
    expect(parseAddProduct('ongeza bidhaa sukari'))
      .toEqual({ kind: 'add_product', product: 'sukari', unitCost: null, unit: null });
  });

  it('takes the buying price stated in the same breath', () => {
    expect(parseAddProduct('ongeza bidhaa sukari bei ya kununua 2500 kwa kilo'))
      .toEqual({ kind: 'add_product', product: 'sukari', unitCost: 2500, unit: 'kilo' });
  });

  it('keeps a multi-word name whole', () => {
    expect(parseAddProduct('ongeza bidhaa kitabu cha nyimbo bei ya kununua 3500')?.product)
      .toBe('kitabu cha nyimbo');
  });

  it('accepts the other ways people say it', () => {
    expect(parseAddProduct('weka bidhaa mkasi')?.product).toBe('mkasi');
    expect(parseAddProduct('add product stapler')?.product).toBe('stapler');
  });

  it('refuses when a price was clearly meant but could not be read', () => {
    // Dropping the number silently would put the product on the list with no
    // cost, and every margin after that would be blank without saying why.
    expect(parseAddProduct('ongeza bidhaa sukari bei ya kununua ngapi')).toBeNull();
  });

  it('leaves everything that is not an add alone', () => {
    expect(parseAddProduct('nimeuza sukari 2 kwa 5000')).toBeNull();
    expect(parseAddProduct('bei ya kununua sukari ni 2500')).toBeNull();
    expect(parseAddProduct('sukari ziko ngapi')).toBeNull();
    expect(parseAddProduct('')).toBeNull();
  });
});

describe('noticing the product is already there', () => {
  it('names what it already knows, and adds nothing', () => {
    const reply = productAlreadyExists('atlasi', { soldQuantity: 3, onHand: 14, unitCost: 12000 }, 'sw');
    expect(reply).toContain('ipo tayari');
    expect(reply).toContain('store 14');
    expect(reply).toContain('imeuzwa 3');
    expect(reply).toContain('TSh 12,000');
    expect(reply).toMatch(/Sijaongeza nakala/);
  });

  it('asks rather than decides when the name is merely close', () => {
    // Only the shopkeeper knows whether "daftari kubwa" is "daftari".
    const reply = productLooksLikeExisting('atlas', 'atlasi', 'sw');
    expect(reply).toContain('tayari una “atlasi”');
    expect(reply).toMatch(/NDIYO/);
    expect(reply).toMatch(/HAPANA/);
  });

  it('copes with a product that has no numbers yet', () => {
    const reply = productAlreadyExists('mkasi', { soldQuantity: 0, onHand: null, unitCost: null }, 'sw');
    expect(reply).toContain('ipo tayari');
    expect(reply).not.toContain('()');
  });
});
