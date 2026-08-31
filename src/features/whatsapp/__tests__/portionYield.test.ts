import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parsePortionYield,
  portionYieldConfirmation,
  portionYieldPieces,
  portionYieldQuestion,
} from '../../../../supabase/functions/_shared/whatsappPortionYield';

// A butcher buys beef by the kilo and sells it as skewers. Nothing in the
// ledger can connect the two until the shop says how many skewers a kilo
// actually yields — and that number is the SHOP'S. One kijiwe cuts big and
// gets twelve from a kilo; the one next door gets twenty.
//
// The owner's own wording: "kilo moja inatoa wastani wa mishikaki mingapi?"
// "Wastani" is doing real work — bone, fat and offcuts mean it never comes out
// the same twice, and a system that treats an average as a law reports theft
// every day until nobody believes it.

describe('teaching Risip what a portion is cut from', () => {
  const expected = {
    kind: 'portion_yield',
    portionName: 'mishikaki',
    productName: 'nyama ya ngombe',
    baseUnit: 'kilo',
    perBaseUnit: 18,
    baseQuantity: 0.055556,
  };

  it.each([
    'kilo 1 ya nyama ya ngombe inatoa mishikaki 18',
    'kilo moja ya nyama ya ngombe inatoa wastani wa mishikaki 18',
    'mishikaki ni nyama ya ngombe, kilo 1 inatoa 18',
    'mishikaki 18 kwa kilo ya nyama ya ngombe',
  ])('reads %s', (said) => {
    expect(parsePortionYield(said)).toEqual(expected);
  });

  it('keeps the ratio as what one portion consumes', () => {
    const reading = parsePortionYield('kilo 1 ya nyama ya ngombe inatoa mishikaki 18')!;
    // 18 skewers to the kilo, so forty of them is 2.2 kilos off the shelf.
    expect(reading.baseQuantity * 40).toBeCloseTo(2.222, 3);
  });

  it('builds the one-piece recipe wa_save_combo expects', () => {
    const reading = parsePortionYield('kilo 1 ya nyama ya ngombe inatoa mishikaki 18')!;
    expect(portionYieldPieces(reading)).toEqual([
      { key: 'nyama ya ngombe', name: 'nyama ya ngombe', quantity: 0.055556, unit: 'kilo' },
    ]);
  });

  it('is not fooled by an ordinary sale', () => {
    expect(parsePortionYield('nimeuza mishikaki 5 kwa 5000')).toBeNull();
    expect(parsePortionYield('nimenunua nyama kilo 5 kwa 100000')).toBeNull();
  });

  it('refuses a yield that cannot be one', () => {
    // One portion per kilo is not a portion, and a thousand is a typo.
    expect(parsePortionYield('kilo 1 ya nyama inatoa mishikaki 1')).toBeNull();
    expect(parsePortionYield('kilo 1 ya nyama inatoa mishikaki 900')).toBeNull();
  });
});

describe('the words it uses', () => {
  it('asks for an average, and says so', () => {
    const question = portionYieldQuestion('mishikaki', 'nyama ya ngombe', 'kilo', 'sw');
    expect(question).toContain('wastani');
    expect(question).toContain('kilo moja');
    // Why it is worth answering, in one line.
    expect(question).toContain('nitaupunguza');
  });

  it('shows both directions before saving anything', () => {
    const reading = parsePortionYield('kilo 1 ya nyama ya ngombe inatoa mishikaki 18')!;
    const confirmation = portionYieldConfirmation(reading, 'sw');
    expect(confirmation).toContain('0.0556 kilo');
    expect(confirmation).toContain('mishikaki 18 (wastani)');
    expect(confirmation).toContain('*1*');
  });
});

describe('how the webhook uses it', () => {
  const webhook = () => readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

  it('saves it as a one-piece recipe through the existing combo RPC', () => {
    const source = webhook();
    expect(source).toContain('const portionYield = parsePortionYield(writeBody);');
    expect(source).toContain('p_pieces: portionYieldPieces(portionYield),');
  });

  it('is owner and accountant only, like every other pricing setting', () => {
    expect(webhook()).toContain("await audit(db, identity, waMessageId, 'portion_yield', 'role', 'blocked');");
  });

  // wa_save_combo refuses a piece that is not a product of this business, and
  // that is the ordinary case here — the meat must exist before a skewer can be
  // cut from it. "Could not save" would leave the shopkeeper with nowhere to go.
  it('names the missing product instead of failing blankly', () => {
    expect(webhook()).toContain("'portion_yield', 'unknown_product', 'failed'");
  });
});
