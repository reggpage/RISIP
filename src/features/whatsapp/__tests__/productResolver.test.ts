import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cataloguePrefixResolution,
  normalizeProductReadResolution,
  productReadClarification,
  productReadMatchNotice,
} from '../../../../supabase/functions/_shared/whatsappProductResolver';

describe('company-scoped product read resolver', () => {
  it('keeps exact names quiet and identifies a loose match explicitly', () => {
    const exact = normalizeProductReadResolution([{
      product_key: 'atlasi', product_name: 'Atlasi', match_kind: 'exact', match_score: 1, ambiguous: false,
    }], 'atlasi');
    expect(productReadMatchNotice(exact, 'sw')).toBe('');

    const loose = normalizeProductReadResolution([{
      product_key: 'atlasi', product_name: 'Atlasi', match_kind: 'trailing_vowel', match_score: 0.95, ambiguous: false,
    }], 'atlas');
    expect(productReadMatchNotice(loose, 'sw')).toContain('“atlas” kuwa “Atlasi”');
  });

  it('asks instead of guessing when the database marks candidates ambiguous', () => {
    const resolution = normalizeProductReadResolution([
      { product_key: 'biblia', product_name: 'Biblia', match_kind: 'trigram', match_score: 0.8, ambiguous: true },
      { product_key: 'biblia kubwa', product_name: 'Biblia kubwa', match_kind: 'trigram', match_score: 0.77, ambiguous: true },
    ], 'bibilia');
    expect(resolution.kind).toBe('ambiguous');
    if (resolution.kind !== 'ambiguous') return;
    expect(productReadClarification(resolution, 'sw')).toContain('Biblia au Biblia kubwa');
  });

  it('keeps the migration read-only and company-catalogue scoped', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0101_product_read_resolver.sql'), 'utf8');
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(migration).toContain('create extension if not exists pg_trgm');
    expect(migration).toContain('company_product_catalog(null, null, false)');
    expect(migration).toContain('latest_stock as (');
    expect(migration).toContain('select product_key from latest_stock');
    expect(migration).toContain("extensions.similarity(c.product_key, i.wanted) >= 0.45");
    expect(migration).not.toContain('create or replace function public.set_product_cost');
    expect(migration).not.toContain('create or replace function public.wa_set_stock_count');
    expect(webhook).toContain("db.rpc('wa_resolve_company_product_read'");
    expect(webhook).toContain('const byPrefix = cataloguePrefixResolution(asked, names);');
  });

  it('expands one unique short product name and asks when the prefix is shared', () => {
    expect(cataloguePrefixResolution('nguvu', ['Nguvu ya Sala']))
      .toMatchObject({ kind: 'matched', match: { productName: 'Nguvu ya Sala' } });
    expect(cataloguePrefixResolution('nguvu', ['Nguvu', 'Nguvu ya Sala']))
      .toMatchObject({
        kind: 'ambiguous',
        candidates: [{ productName: 'Nguvu' }, { productName: 'Nguvu ya Sala' }],
      });
  });

  it('resolves a unique real-world partial such as feni without guessing', () => {
    expect(cataloguePrefixResolution('feni', ['Feni ya ukutani']))
      .toMatchObject({ kind: 'matched', match: { productName: 'Feni ya ukutani' } });
    expect(cataloguePrefixResolution('feni', ['Feni ya ukutani', 'Feni ndogo']))
      .toMatchObject({
        kind: 'ambiguous',
        candidates: [
          { productName: 'Feni ya ukutani' },
          { productName: 'Feni ndogo' },
        ],
      });
  });
});
