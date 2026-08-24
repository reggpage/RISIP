import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitCombo } from '../../../../supabase/functions/_shared/whatsappCombos';

// A butcher's "mshikaki" is one ingredient and nothing else:
//
//   mshikaki = nyama ya ngombe, kilo 0.055
//
// Selling forty must take 2.2 kilos of beef off the shelf. 0114 built exactly
// the machinery for this — a saved phrase resolving into per-product sale lines
// — but required TWO pieces, because a nickname for a single product is just
// that product renamed. A portion is a different thing.

const catalogue = [{ key: 'nyama ya ngombe', name: 'Nyama ya ngombe' }];
const portion = [{ name: 'mshikaki', pieces: [{ key: 'nyama ya ngombe', name: 'Nyama ya ngombe', quantity: 0.055, unit: 'kilo' }] }];

describe('a portion is a one-piece recipe', () => {
  it('resolves the skewer into the meat it is cut from', () => {
    const split = splitCombo('mshikaki', catalogue, portion);
    expect(split).not.toBeNull();
    if (!split || 'kind' in split) throw new Error('expected a split');
    expect(split.source).toBe('saved');
    expect(split.pieces).toEqual([
      { key: 'nyama ya ngombe', name: 'Nyama ya ngombe', quantity: 0.055, unit: 'kilo' },
    ]);
  });

  it('keeps a fractional quantity exactly, because the ratio is an average', () => {
    const split = splitCombo('mshikaki', catalogue, portion);
    if (!split || 'kind' in split) throw new Error('expected a split');
    expect(split.pieces[0].quantity).toBeCloseTo(0.055, 6);
  });

  // The webhook dropped every saved combo with fewer than two pieces before
  // splitCombo ever saw it. That filter was the last gate in the way.
  it('is no longer discarded by the webhook before it is used', () => {
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(webhook).toContain('combo.pieces.length >= 1');
    expect(webhook).not.toContain('combo.pieces.length >= 2');
  });

  it('still refuses to call a plain product a combination', () => {
    // No saved recipe, one known product: the ordinary path owns it.
    expect(splitCombo('nyama ya ngombe', catalogue, [])).toBeNull();
  });
});
