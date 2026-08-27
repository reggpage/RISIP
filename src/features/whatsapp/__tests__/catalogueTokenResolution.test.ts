import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  catalogueTokenResolution,
  cataloguePrefixResolution,
  nearestCatalogueName,
} from '../../../../supabase/functions/_shared/whatsappProductResolver';

// MEASURED FAILURE, from a real shop's catalogue.
//
//   catalogue: "Anton wa Padua"
//   trader:    "Antoni 4"
//   Risip:     "Antoni haipo..." and an offer to REGISTER A NEW PRODUCT
//
// Every resolver above this one compares whole strings. "antoni" against
// "anton wa padua" is nowhere near one edit, so nothing matched and a shop was
// invited to create a duplicate of a product it already sells — the worst
// possible outcome, because from then on its sales are split across two names.
//
// A trader almost never types a product's full registered name. They type the
// word they call it by, and that word is usually one of the words in the name.

const CATALOGUE = ['Anton wa Padua', 'Nguvu ya Sala', 'Feni ya Hisense', 'Daftari', 'Punch'];

describe('a product is found by the word the shop calls it', () => {
  it('resolves Antoni to Anton wa Padua', () => {
    const resolution = catalogueTokenResolution('Antoni', CATALOGUE);
    expect(resolution?.kind).toBe('matched');
    if (resolution?.kind === 'matched') expect(resolution.match.productName).toBe('Anton wa Padua');
  });

  it('resolves a word from the middle or the end of a name', () => {
    for (const [asked, expected] of [
      ['Padua', 'Anton wa Padua'],
      ['Hisense', 'Feni ya Hisense'],
      ['Sala', 'Nguvu ya Sala'],
    ] as const) {
      const resolution = catalogueTokenResolution(asked, CATALOGUE);
      expect(resolution?.kind, asked).toBe('matched');
      if (resolution?.kind === 'matched') expect(resolution.match.productName, asked).toBe(expected);
    }
  });

  it('forgives the same single keystroke the whole-name resolver forgives', () => {
    const resolution = catalogueTokenResolution('Ngovu', CATALOGUE);
    expect(resolution?.kind).toBe('matched');
    if (resolution?.kind === 'matched') expect(resolution.match.productName).toBe('Nguvu ya Sala');
  });
});

describe('it asks rather than guessing', () => {
  it('returns both when a word names two products', () => {
    // "Closest wins" on a product name is how the wrong meat leaves the shelf.
    const resolution = catalogueTokenResolution('Nguvu', ['Nguvu ya Sala', 'Nguvu ya Asubuhi']);
    expect(resolution?.kind).toBe('ambiguous');
    if (resolution?.kind === 'ambiguous') expect(resolution.candidates).toHaveLength(2);
  });

  it('says nothing at all when nothing is close', () => {
    expect(catalogueTokenResolution('mchele', CATALOGUE)).toBeNull();
    expect(catalogueTokenResolution('zzzz', CATALOGUE)).toBeNull();
  });

  it('refuses to match on a fragment too short to be evidence', () => {
    // Below four letters one edit reaches half the catalogue.
    expect(catalogueTokenResolution('ant', CATALOGUE)).toBeNull();
    expect(catalogueTokenResolution('ya', CATALOGUE)).toBeNull();
  });

  it('ignores the short joining words inside a name', () => {
    // "wa" and "ya" are in half the names in a Tanzanian catalogue and mean
    // nothing on their own.
    expect(catalogueTokenResolution('wa', CATALOGUE)).toBeNull();
  });
});

describe('it is the LAST rung, not a replacement for the ones above', () => {
  it('leaves exact and prefix matching untouched', () => {
    expect(cataloguePrefixResolution('Feni', CATALOGUE)?.kind).toBe('matched');
    expect(nearestCatalogueName('Daftar', CATALOGUE)).toBe('Daftari');
  });

  it('runs only after the database, the near-miss and the prefix have all failed', () => {
    const webhook = readFileSync(
      resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8',
    );
    const chain = webhook.slice(
      webhook.indexOf('async function resolveProductForRead'),
      webhook.indexOf('function admin(): Admin'),
    );
    const rpc = chain.indexOf("db.rpc('wa_resolve_company_product_read'");
    const near = chain.indexOf('nearestCatalogueName(asked, names)');
    const prefix = chain.indexOf('cataloguePrefixResolution(asked, names)');
    const token = chain.indexOf('catalogueTokenResolution(asked, names)');
    expect(rpc).toBeGreaterThan(-1);
    expect(near).toBeGreaterThan(rpc);
    expect(prefix).toBeGreaterThan(near);
    expect(token).toBeGreaterThan(prefix);
  });
});
