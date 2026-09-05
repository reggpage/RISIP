import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buchaReportFacts, buildBuchaReportReply, type BuchaReportingSnapshot } from '../../../../supabase/functions/_shared/whatsappBuchaReports';
import { canReadCompanyReporting } from '../../../../supabase/functions/_shared/whatsappAssistant';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260905090000_phase9_reporting_integrity.sql'), 'utf8');

describe('Phase 9 reporting integrity', () => {
  it('keeps company financial reporting owner/accountant only', () => {
    expect(canReadCompanyReporting('owner')).toBe(true);
    expect(canReadCompanyReporting('accountant')).toBe(true);
    expect(canReadCompanyReporting('worker')).toBe(false);
  });

  it('uses confirmed records and historical base-unit costs', () => {
    expect(migration).toContain("status = 'confirmed'");
    expect(migration).toContain('coalesce(l.stock_base_quantity, l.quantity) as base_quantity');
    expect(migration).toContain('coalesce(pc.base_unit_cost, pc.unit_cost)');
    expect(migration).toContain('pc.effective_from <= sl.occurred_at');
  });

  it('separates settled sales from actual cash and counts animals, not procurement rows', () => {
    expect(migration).toContain("'settled_sales'");
    expect(migration).toContain("'cash_sales', coalesce((v_methods->>'cash')::numeric, 0)");
    expect(migration).toContain("'count', coalesce(sum(animal_count), 0)");
    expect(migration).toContain("br.status = 'confirmed'");
  });

  it('does not multiply record-level loss amounts by line count', () => {
    expect(migration).toMatch(/with records as \([\s\S]*sum\(amount\)[\s\S]*\), lines as \(/i);
    expect(migration).not.toContain('coalesce(sum(r.amount), 0)');
  });

  it('gives the model complete, directionally correct reporting evidence', () => {
    const snapshot: BuchaReportingSnapshot = {
      sales: { total: 120_000, settled_sales: 70_000, cash_sales: 40_000, credit_sales: 50_000, by_payment_method: { cash: 40_000, mobile_money: 30_000, credit: 50_000 } },
      expenses: 5_000,
      customer_payments: 10_000,
      customer_receivables: [{ party_name: 'Musa', outstanding: 40_000 }],
      supplier_payables: [{ supplier_name: 'Asha', outstanding: 90_000 }],
      stock_loss: { amount: 2_000 },
      owner_use: { amount: 1_000 },
      whole_animals: { count: 2, pending_breakdown: 0 },
      profit: { estimated_profit: 43_000, cogs: 70_000, coverage: 1, valuation_complete: true },
    };
    const facts = buchaReportFacts(snapshot, 'today', 'sw');
    expect(facts).toContain('settled_sales=70000');
    expect(facts).toContain('payment_method_cash=40000');
    expect(facts).toContain('customer_receivables_total=40000');
    expect(facts).toContain('supplier_payables_total=90000');
    expect(buildBuchaReportReply(snapshot, 'ai_debtors', 'today', 'sw')).toContain('Madeni ya wateja kwa biashara');
  });

  it('exposes loss, owner-use and whole-animal reporting as AI tools', () => {
    const assistant = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/whatsappAssistant.ts'), 'utf8');
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    for (const name of ['get_stock_loss_report', 'get_owner_use_report', 'get_whole_animal_report']) {
      expect(assistant).toContain(`'${name}'`);
      expect(webhook).toContain(`name === '${name}'`);
    }
    expect(webhook).toContain("? 'ai_stock_loss'");
    expect(webhook).toContain("? 'ai_owner_use' : 'ai_whole_animals'");
  });
});
