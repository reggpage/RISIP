import { describe, expect, it } from 'vitest';
import { exportFilename, recordsToCsv, type ExportLabels } from '@/features/dailyRecords/exportRecords';
import type { DailyRecordWithDetails } from '@/features/dailyRecords/dailyRecords';

// THE SHOP'S NUMBERS, PORTABLE.
//
// A CSV a shopkeeper opens in Excel to do their own thing with. It copies the
// ledger and computes nothing, so the only ways it can be wrong are the
// mechanical ones — a comma inside a product name, a quote in a note, a
// Swahili character Excel mangles — and those are exactly what this pins.

const labels: ExportLabels = {
  headers: { date: 'Tarehe', kind: 'Aina', party: 'Mhusika', description: 'Maelezo', amount: 'Kiasi', payment: 'Malipo', status: 'Hali' },
  kind: { sale: 'Mauzo', expense: 'Matumizi', stock_purchase: 'Ununuzi', debt_issued: 'Mkopo', customer_payment: 'Malipo ya mteja', stock_loss: 'Upotevu', owner_use: 'Nyumbani', supplier_payable: 'Deni la muuzaji', supplier_payment: 'Malipo kwa muuzaji', whole_animal_procurement: 'Ng\'ombe', whole_animal_breakdown: 'Breakdown' },
  status: { pending_confirmation: 'Inasubiri', confirmed: 'Imethibitishwa', voided: 'Imeghairiwa' },
  payment: { cash: 'Taslimu', mobile_money: 'Simu', bank: 'Benki', other: 'Nyingine' },
};

const rec = (over: Partial<DailyRecordWithDetails>): DailyRecordWithDetails => ({
  id: 'r1', company_id: 'c', project_id: null, recorded_by: null, source: 'whatsapp',
  source_message_id: null, kind: 'sale', status: 'confirmed', amount: 25000, currency: 'TZS',
  party_name: null, description: null, occurred_at: '2026-09-02T08:00:00Z',
  confirmed_by: null, confirmed_at: null, voided_by: null, voided_at: null, void_reason: null,
  payment_method: null, lines: [], ...over,
} as DailyRecordWithDetails);

describe('the CSV a shop can open in Excel', () => {
  it('has the header row and one line per record', () => {
    const csv = recordsToCsv([rec({}), rec({ id: 'r2' })], labels);
    const lines = csv.replace(/^\ufeff/, '').split('\r\n');
    expect(lines[0]).toBe('Tarehe,Aina,Mhusika,Maelezo,Kiasi,Malipo,Hali');
    expect(lines).toHaveLength(3);
  });

  it('writes the day in East Africa time, not UTC', () => {
    // 2 Sep 08:00 UTC is still 2 Sep in Dar; but a late-evening UTC time is the
    // trap. 21:30 UTC on the 2nd is 00:30 on the 3rd in Dar.
    const csv = recordsToCsv([rec({ occurred_at: '2026-09-02T21:30:00Z' })], labels);
    expect(csv).toContain('2026-09-03');
  });

  it('writes the amount as a bare number Excel can sum', () => {
    const csv = recordsToCsv([rec({ amount: 74200 })], labels);
    // No "TSh", no thousands comma — a comma here would split the cell.
    expect(csv).toContain(',74200,');
    expect(csv).not.toContain('74,200');
    expect(csv).not.toContain('TSh');
  });

  it('quotes a product name that contains a comma', () => {
    const csv = recordsToCsv([rec({ description: 'daftari, kalamu na wino' })], labels);
    expect(csv).toContain('"daftari, kalamu na wino"');
  });

  it('doubles a quote inside a field, the way spreadsheets read it back', () => {
    const csv = recordsToCsv([rec({ party_name: 'Asha "mama duka"' })], labels);
    expect(csv).toContain('"Asha ""mama duka"""');
  });

  it('keeps a newline inside a field from breaking the row', () => {
    const csv = recordsToCsv([rec({ description: 'mstari mmoja\nmstari wa pili' })], labels);
    const body = csv.replace(/^\ufeff/, '').split('\r\n');
    // Header + exactly one data row, even though the field has a newline.
    expect(body).toHaveLength(2);
    expect(csv).toContain('"mstari mmoja\nmstari wa pili"');
  });

  it('starts with a BOM so Excel reads Swahili as UTF-8', () => {
    expect(recordsToCsv([rec({})], labels).charCodeAt(0)).toBe(0xFEFF);
  });

  it('translates kind, status and payment', () => {
    const csv = recordsToCsv([rec({ kind: 'stock_purchase', status: 'pending_confirmation', payment_method: 'mobile_money' })], labels);
    expect(csv).toContain('Ununuzi');
    expect(csv).toContain('Inasubiri');
    expect(csv).toContain('Simu');
  });

  it('leaves a missing party, description or payment empty, not "null"', () => {
    const csv = recordsToCsv([rec({ party_name: null, description: null, payment_method: null })], labels);
    expect(csv).not.toContain('null');
  });

  it('orders oldest first, the way a statement reads', () => {
    const csv = recordsToCsv([
      rec({ id: 'new', occurred_at: '2026-09-05T08:00:00Z', amount: 500 }),
      rec({ id: 'old', occurred_at: '2026-09-01T08:00:00Z', amount: 100 }),
    ], labels);
    expect(csv.indexOf(',100,')).toBeLessThan(csv.indexOf(',500,'));
  });
});

describe('the filename', () => {
  it('is dated so a folder of exports never collides', () => {
    expect(exportFilename()).toMatch(/^risip-rekodi-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
