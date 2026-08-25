import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveTransactionDate } from '../../../../supabase/functions/_shared/whatsappDateRange';

const NOW = new Date('2026-08-25T09:00:00.000Z'); // 12:00 Dar es Salaam
const migration = readFileSync('supabase/migrations/0133_historical_sale_pricing.sql', 'utf8');
const webhook = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8');

describe('historical transaction dates', () => {
  it('resolves jana, juzi and an explicit date to one validated day', () => {
    expect(resolveTransactionDate('niliuza nyama kilo 2 jana', NOW)).toEqual({
      kind: 'historical', occurredAt: '2026-08-23T21:00:00.000Z', label: 'jana',
    });
    expect(resolveTransactionDate('juzi niliuza soseji 5', NOW)).toEqual({
      kind: 'historical', occurredAt: '2026-08-22T21:00:00.000Z', label: 'juzi',
    });
    expect(resolveTransactionDate('tarehe 7 Mei 2025 niliuza nyama', NOW)).toMatchObject({
      kind: 'historical', occurredAt: '2025-05-06T21:00:00.000Z',
    });
  });

  it('preserves current behaviour when no date or today is stated', () => {
    expect(resolveTransactionDate('nimeuza nyama kilo 2', NOW)).toEqual({ kind: 'current', occurredAt: null });
    expect(resolveTransactionDate('leo nimeuza nyama kilo 2', NOW)).toEqual({ kind: 'current', occurredAt: null });
  });

  it('refuses future dates and broad ranges for a single transaction', () => {
    expect(resolveTransactionDate('kesho nitauza nyama', NOW)).toEqual({ kind: 'invalid', reason: 'future' });
    expect(resolveTransactionDate('wiki iliyopita niliuza nyama', NOW)).toEqual({ kind: 'invalid', reason: 'range' });
  });
});

describe('historical pricing wiring', () => {
  it('selects both price and cost effective at or before occurred_at', () => {
    expect(migration.match(/effective_from <= p_priced_at/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain('order by private.product_key(s.product_key), s.effective_from desc, s.created_at desc');
    expect(migration).toContain('order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc');
  });

  it('uses timestamp-aware RPCs for base and converted units', () => {
    expect(migration).toContain('wa_product_pricing(\n  p_company_id uuid,\n  p_product_keys text[],\n  p_priced_at timestamptz');
    expect(migration).toContain('wa_price_sale_unit(\n  p_company_id uuid,\n  p_product text,\n  p_unit text,\n  p_quantity numeric,\n  p_priced_at timestamptz');
    expect(webhook).toContain("...(occurredAt ? { p_priced_at: occurredAt } : {})");
  });

  it('stores occurred_at and never silently falls back to today', () => {
    expect(webhook).toContain('p_occurred_at: withPayment.occurredAt ?? new Date().toISOString()');
    expect(webhook).toContain("sijatumia bei ya leo");
    expect(webhook).toContain("I did not use today's price");
  });

  it('carries the validated date through Claude and quantity continuation', () => {
    expect(webhook).toContain('resolveTransactionDate(interpreted.occurredAtWording)');
    expect(webhook).toContain('resumedQuantityOccurredAt = quantityPending.occurredAt ?? null');
    expect(webhook).toContain('occurredAt: wantedDate.occurredAt');
  });
});
