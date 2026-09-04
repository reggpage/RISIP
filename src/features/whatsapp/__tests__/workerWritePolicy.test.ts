import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0167_worker_writes_require_owner_approval.sql'), 'utf8');

describe('worker write policy', () => {
  it('blocks every AI proposal that can write before dispatch', () => {
    for (const name of [
      'propose_product_cost',
      'propose_catalogue_transaction',
      'propose_daily_record',
      'propose_business_event',
      'propose_money_event',
      'propose_record_void',
      'propose_day_close',
    ]) {
      expect(webhook, name).toContain(`'${name}'`);
    }
    expect(webhook).toContain('workerWriteDenied(identity, lang)');
    expect(webhook).toContain('Workers cannot record sales, purchases, or add stock.');
  });

  it('has a database backstop for ledger and stock-count inserts', () => {
    expect(migration).toContain("if private.auth_role() = 'worker'");
    expect(migration).toContain('daily_records_worker_write_gate');
    expect(migration).toContain('stock_counts_worker_write_gate');
    expect(migration).toContain('worker_write_requires_owner_approval');
  });
});
