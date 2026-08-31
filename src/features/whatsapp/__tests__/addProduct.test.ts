import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addProductNameQuestion,
  isAddProductStart,
  parseAddProduct,
  parseAddProductName,
  productAlreadyExists,
  productLooksLikeExisting,
} from '../../../../supabase/functions/_shared/whatsappAddProduct';

describe('adding a product from WhatsApp', () => {
  it('recognises a request that starts the guided flow before a name is known', () => {
    expect(isAddProductStart('naongeza bidhaa')).toBe(true);
    expect(isAddProductStart('nataka kuongeza bidhaa')).toBe(true);
    expect(isAddProductStart('I want to add a product')).toBe(true);
    expect(isAddProductStart('ongeza bidhaa sukari')).toBe(false);
    expect(addProductNameQuestion('sw')).toContain('bidhaa gani');
  });

  it('accepts a natural product name but not a command or amount', () => {
    expect(parseAddProductName("Nyama ya ng'ombe")).toBe("Nyama ya ng'ombe");
    expect(parseAddProductName('12,000')).toBeNull();
    expect(parseAddProductName('hapana')).toBeNull();
  });

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

describe('product topic switching in the webhook', () => {
  const webhook = () => readFileSync(
    resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

  it('cancels a pending daily draft through the RPC before routing the new topic', () => {
    const source = webhook();
    const start = source.indexOf('const switchesPendingDailyTopic');
    const end = source.indexOf('// A bare list such as', start);
    const guard = source.slice(start, end);
    expect(guard).toContain("db.rpc('wa_cancel_daily_record_draft'");
    expect(guard).toContain("db.rpc('wa_cancel_daily_record_batch'");
    expect(guard).toContain('await clearAssistantMemory(db, identity)');
    expect(guard).toContain('dailyConversation = null');
    expect(guard).toContain('convo = null');
    expect(guard.indexOf("db.rpc('wa_cancel_daily_record_draft'")).toBeLessThan(guard.indexOf('dailyConversation = null'));
  });

  it('releases a parked question for anything that is not its answer', () => {
    // This used to assert the contents of startsAnotherTopic — a list of
    // fourteen parsers naming the subjects a parked question was willing to be
    // interrupted by. The list had to grow every time a shop said something
    // new, and it met "namaanisha anton" with the same question a third time.
    //
    // The list is gone. A confirmation, a rejection or a cancel is an answer;
    // everything else releases, and needs no list at all.
    const source = webhook();
    expect(source).not.toContain('function startsAnotherTopic');
    const rule = source.slice(
      source.indexOf('function releasesParkedQuestion'),
      source.indexOf('async function resolveProductForRead'),
    );
    expect(rule).toContain('isDailyRecordConfirmation(text) || isDailyRecordRejection(text) || isCancel(text)');
    expect(rule).toContain('return true;');
  });

  it('parks “naongeza bidhaa” as a name question instead of sending it to stale AI context', () => {
    const source = webhook();
    expect(source).toContain("options: { kind: 'add_product_setup', step: 'name' }");
    expect(source).toContain('await replyQuietly(phone, addProductNameQuestion(lang))');
    expect(source).toContain('writeBody = `ongeza bidhaa ${addProductSetupPending.product}');
  });

  it('clears AI memory after a daily draft is confirmed or declined', () => {
    const source = webhook();
    const start = source.indexOf('if (dailyBatchConversation)');
    const end = source.indexOf('// ── A buying price', start);
    const confirmation = source.slice(start, end);
    expect(confirmation.match(/clearAssistantMemory\(db, identity\)/g)?.length).toBeGreaterThanOrEqual(4);
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
    expect(reply).toContain('*1*');
    expect(reply).toContain('*2*');
  });

  it('copes with a product that has no numbers yet', () => {
    const reply = productAlreadyExists('mkasi', { soldQuantity: 0, onHand: null, unitCost: null }, 'sw');
    expect(reply).toContain('ipo tayari');
    expect(reply).not.toContain('()');
  });
});
