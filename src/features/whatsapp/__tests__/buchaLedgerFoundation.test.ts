import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DailyRecordKind } from '../../../types/db';
import { buildDailyRecordConfirmation } from '../../../../supabase/functions/_shared/whatsappDailyRecords';

// RISIP BUCHA, PHASE 1.
//
// daily_records.kind admitted five values. Until it widened, a butcher could
// not record spoilage at all — not badly, not approximately: there was nowhere
// to put it. Four kinds were added, and the danger in adding them is not that
// they fail loudly; it is that an existing kind quietly changes meaning because
// some function that switches on kind was missed.
//
// These tests pin the four facts that must stay separate, and the places that
// had to change to keep them so.

const sql = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const NEW_KINDS = ['stock_loss', 'owner_use', 'supplier_payable', 'supplier_payment'] as const;
const OLD_KINDS = ['sale', 'expense', 'debt_issued', 'customer_payment', 'stock_purchase'] as const;

describe('the widened ledger', () => {
  const foundation = sql('0120_bucha_ledger_foundation.sql');

  it('admits the four new kinds without dropping the five that existed', () => {
    for (const kind of [...OLD_KINDS, ...NEW_KINDS]) {
      expect(foundation, kind).toContain(`'${kind}'`);
    }
  });

  it('records a payment method but never "deni"', () => {
    expect(foundation).toContain("'cash', 'mobile_money', 'bank', 'other'");
    // Credit already has an accounting meaning — debt_issued. Admitting it as a
    // payment method would let one fact be recorded two incompatible ways.
    expect(foundation).not.toMatch(/payment_method[^;]*'deni'/s);
  });

  it('leaves historical rows unstated rather than inventing a method', () => {
    expect(foundation).toContain('payment_method is null or payment_method = any');
    expect(foundation).not.toMatch(/update public\.daily_records\s+set payment_method/i);
  });
});

describe('the functions that switch on kind', () => {
  const functions = sql('0121_bucha_ledger_functions.sql');

  it('lets goods leave the shelf three ways, not one', () => {
    // Counting only sales would show a shelf still holding meat the shop threw
    // away this morning — the very number used to decide nobody is stealing.
    expect(functions).toContain("r.kind in ('sale', 'stock_purchase', 'stock_loss', 'owner_use')");
    expect(functions).toMatch(/lost_since/);
    expect(functions).toMatch(/taken_since/);
    expect(functions).toContain('- coalesce(m.sold_since, 0) - coalesce(m.lost_since, 0) - coalesce(m.taken_since, 0)');
  });

  it('reports a loss as its own figure and takes it out of profit', () => {
    expect(functions).toContain("'stock_losses', v_losses");
    expect(functions).toContain("round(v_sales - v_cogs - v_expenses - v_losses, 2)");
  });

  it('does not treat goods taken home as a loss to the business', () => {
    // Owner use is reported separately and deliberately NOT subtracted: how a
    // shop accounts for the household is the shop's decision, not an assumption.
    expect(functions).toContain("'owner_use', v_owner_use");
    expect(functions).not.toContain('v_expenses - v_losses - v_owner_use');
  });

  it('allows a valueless inventory event, and only for the two that can be', () => {
    // A spoiled kilo of a product with no recorded buying cost is still a real
    // inventory event. Refusing it would leave stock overstated for ever.
    expect(functions).toContain("v_valueless_ok := v_kind in ('stock_loss', 'owner_use');");
    expect(functions).toContain('p_amount = 0 and not v_valueless_ok');
  });

  it('keeps webhook idempotency exactly as it was', () => {
    expect(functions).toContain('on conflict (company_id, source_message_id)');
    expect(functions).toContain('where source_message_id is not null');
  });

  it('keeps the guard that stops a total being taken on trust', () => {
    expect(functions).toContain("abs(v_line_sum - v_amount) > 0.01");
    expect(functions).toContain("hint = 'line_total_mismatch'");
  });

  it('keeps tenancy on the WhatsApp path', () => {
    expect(functions).toContain('WhatsApp identity is not active in this company');
  });

  it('drops the old signatures so no ambiguous overload survives', () => {
    expect(functions).toContain('drop function if exists public.create_daily_record_draft(text, numeric, text, text, timestamptz, uuid, text, text, jsonb);');
    expect(functions).toContain('drop function if exists public.wa_create_daily_record_draft(uuid, uuid, text, numeric, text, text, timestamptz, text, jsonb);');
  });
});

describe('every new kind is named, in both languages', () => {
  it.each(NEW_KINDS)('%s has a WhatsApp label', (kind) => {
    const record = {
      kind: kind as DailyRecordKind,
      amount: 12000,
      partyName: null,
      description: null,
      lines: [],
      confidence: 0.99,
    };
    for (const lang of ['sw', 'en'] as const) {
      const confirmation = buildDailyRecordConfirmation(record, lang);
      expect(confirmation, `${kind}/${lang}`).not.toContain('undefined');
      expect(confirmation.length, `${kind}/${lang}`).toBeGreaterThan(10);
    }
  });

  it('has a web label for every kind, in both languages', () => {
    const page = src('src/routes/dailyRecords/DailyRecordsPage.tsx');
    for (const key of ['stockLoss', 'ownerUse', 'supplierPayable', 'supplierPayment']) {
      // Once in the Swahili object, once in the English one.
      expect(page.split(`${key}:`).length - 1, key).toBe(2);
    }
    for (const kind of NEW_KINDS) expect(page, kind).toContain(`${kind}: ui.`);
  });

  it('gives a loss the only red on the trend chart', () => {
    // Nothing else on a shop's day is a number that simply disappeared.
    const rules = src('src/features/dailyRecords/uiRules.ts');
    expect(rules).toContain("stockLoss: '#dc2626'");
    const chart = src('src/components/dashboard/DailyRecordsTrendChart.tsx');
    for (const kind of NEW_KINDS) expect(chart, kind).toContain(`${kind}: `);
  });
});

describe('what must not have changed', () => {
  it('keeps the five original kinds meaning what they meant', () => {
    const page = src('src/routes/dailyRecords/DailyRecordsPage.tsx');
    expect(page).toContain('sale: ui.sale');
    expect(page).toContain('expense: ui.expense');
    expect(page).toContain('stock_purchase: ui.stockPurchase');
    expect(page).toContain('debt_issued: ui.debt');
    expect(page).toContain('customer_payment: ui.payment');
  });

  it('still records a plain sale unchanged', () => {
    const confirmation = buildDailyRecordConfirmation({
      kind: 'sale',
      amount: 36000,
      partyName: null,
      description: null,
      lines: [{ description: 'nyama', quantity: 3, unit_amount: 12000, unit: 'kilo' }],
      confidence: 0.99,
    }, 'sw');
    expect(confirmation).toContain('Mauzo');
    expect(confirmation).toContain('36,000');
  });
});
