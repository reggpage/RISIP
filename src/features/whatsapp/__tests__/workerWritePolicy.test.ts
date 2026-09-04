import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0169_workers_can_record.sql'), 'utf8');

describe('worker write policy', () => {
  it('does not block worker business-event or money-event proposals', () => {
    expect(webhook).not.toContain('workerWriteDenied');
    expect(webhook).not.toContain('workerWriteTools');
    expect(webhook).toContain("name === 'propose_business_event'");
    expect(webhook).toContain("name === 'propose_money_event'");
    expect(webhook).toContain("kind: 'daily_record_confirmation'");
  });

  it('removes only the old worker database gates', () => {
    expect(migration).toContain('drop trigger if exists daily_records_worker_write_gate');
    expect(migration).toContain('drop trigger if exists stock_counts_worker_write_gate');
    expect(migration).not.toContain('create trigger');
    expect(migration).toContain('no owner approval step is required');
  });

  it('lets a worker confirm only their own draft and record stock', () => {
    expect(migration).toContain('create or replace function public.confirm_daily_record');
    expect(migration).toContain("v_role = 'worker' and v_record.recorded_by = v_actor");
    expect(migration).toContain('create or replace function public.wa_record_stock_count');
    expect(migration).toContain('create or replace function public.wa_record_stock_counts');
    expect(migration).not.toContain("only an owner or accountant may record a stock count");
  });
});
