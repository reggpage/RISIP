import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDailyRecordBatchConfirmation,
  parseDailyRecordBatch,
  resumeDailyRecordBatchClarification,
} from '../../../../supabase/functions/_shared/whatsappDailyRecordBatch';

const mixed = [
  'nimeuza daftari 10 kila moja 1500',
  'nimeuza kalamu 20 kila moja 500',
  '',
  'Matumizi',
  'Chakula-12,000 asubuhi na jioni',
  'Nauli-7500',
  'Nimemkopa bakita nguvu ya sala 10 bei ni 9000',
].join('\n');

describe('WhatsApp mixed daily-record batches', () => {
  it('parses comma-separated sale totals as separate lines without dropping money', () => {
    const parsed = parseDailyRecordBatch(
      'nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500',
      'sw',
    );
    expect(parsed).toMatchObject({
      kind: 'parsed',
      records: [{
        kind: 'sale',
        amount: 9_000,
        lines: [
          { description: 'daftari', quantity: 5, unit_amount: 1_500 },
          { description: 'kalamu', quantity: 3, unit_amount: 500 },
        ],
      }],
    });
  });

  it('parses na-separated sale totals as separate lines', () => {
    const parsed = parseDailyRecordBatch(
      'nimeuza daftari 5 kwa 7500 na kalamu 3 kwa 1500',
      'sw',
    );
    expect(parsed).toMatchObject({
      kind: 'parsed',
      records: [{ kind: 'sale', amount: 9_000 },
      ],
    });
  });

  it('refuses the whole sale list and names any item whose numbers were not understood', () => {
    const parsed = parseDailyRecordBatch(
      'nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500, rula 4 kwa bei fulani 2000',
      'sw',
    );
    expect(parsed).toMatchObject({
      kind: 'unreadable',
      unreadable: ['rula 4 kwa bei fulani 2000'],
    });
    if (parsed.kind !== 'unreadable') return;
    expect(parsed.message).toContain('rula 4 kwa bei fulani 2000');
    expect(parsed.message).toContain('Hakuna rekodi mpya iliyohifadhiwa');
  });

  it('understands the known sale and expense sections and asks targeted debt questions', () => {
    const parsed = parseDailyRecordBatch(mixed, 'sw');
    expect(parsed.kind).toBe('clarify');
    if (parsed.kind !== 'clarify') return;
    expect(parsed.state.records).toMatchObject([
      { kind: 'sale', amount: 25_000 },
      { kind: 'expense', amount: 19_500 },
    ]);
    expect(parsed.state.records[1].lines).toEqual([
      { description: 'Chakula asubuhi na jioni', quantity: 1, unit_amount: 12_000 },
      { description: 'Nauli', quantity: 1, unit_amount: 7_500 },
    ]);
    expect(parsed.question).toContain('Bakita amechukua bidhaa kwako');
    expect(parsed.question).toContain('TSh 9,000');
    expect(parsed.question).toContain('bei ya kila');
    expect(parsed.question).toContain('Hakuna rekodi mpya iliyohifadhiwa bado');
  });

  it('resumes the exact batch and computes customer debt only after both answers', () => {
    const parsed = parseDailyRecordBatch(mixed, 'sw');
    if (parsed.kind !== 'clarify') throw new Error('expected clarification');
    const resumed = resumeDailyRecordBatchClarification(
      parsed.state,
      'Bakita amenikopa; bei ya kila moja',
    );
    expect(resumed.kind).toBe('resolved');
    if (resumed.kind !== 'resolved') return;
    expect(resumed.records).toHaveLength(3);
    expect(resumed.records[2]).toMatchObject({
      kind: 'debt_issued',
      partyName: 'Bakita',
      amount: 90_000,
      lines: [{ description: 'nguvu ya sala', quantity: 10, unit_amount: 9_000 }],
    });
    const confirmation = buildDailyRecordBatchConfirmation(resumed.records, 'sw');
    expect(confirmation).toContain('rekodi 3 tofauti');
    expect(confirmation).toContain('Jumla: *TSh 25,000*');
    expect(confirmation).toContain('Jumla: *TSh 19,500*');
    expect(confirmation).toContain('Jumla: *TSh 90,000*');
    expect(confirmation).toContain('NDIYO');
  });

  it('does not misclassify a supplier payable as an expense or customer debt', () => {
    const parsed = parseDailyRecordBatch(mixed, 'sw');
    if (parsed.kind !== 'clarify') throw new Error('expected clarification');
    const resumed = resumeDailyRecordBatchClarification(
      parsed.state,
      'Mimi nimekopa kutoka kwa Bakita; bei ya kila moja',
    );
    expect(resumed.kind).toBe('unsupported_payable');
    if (resumed.kind !== 'unsupported_payable') return;
    expect(resumed.message).toContain('supplier-payable');
    expect(resumed.message).toContain('ENDELEA BILA MKOPO');
  });

  it('parses a clear sale plus expense message as two separate records', () => {
    const parsed = parseDailyRecordBatch([
      'nimeuza daftari 10 kila moja 1500',
      'Matumizi',
      'Nauli-7500',
    ].join('\n'), 'sw');
    expect(parsed).toMatchObject({
      kind: 'parsed',
      records: [
        { kind: 'sale', amount: 15_000 },
        { kind: 'expense', amount: 7_500 },
      ],
    });
  });

  it('keeps create, confirm and cancel transactional behind service-role batch RPCs', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0084_whatsapp_daily_record_batches.sql'), 'utf8');
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(migration).toContain('wa_create_daily_record_batch_drafts');
    expect(migration).toContain('wa_confirm_daily_record_batch');
    expect(migration).toContain('wa_cancel_daily_record_batch');
    expect(migration).toContain("v_source || '#' || v_item.ordinality::text");
    expect(migration).toContain('jsonb_array_length(p_records) > 10');
    expect(migration).toContain('to service_role');
    // The batch parser now stands aside for a till roll that names no money at
    // all, so the call is conditional — but it is still the only thing that
    // reads a multi-line record message.
    expect(webhook).toContain(': parseDailyRecordBatch(writeBody, lang);');
    expect(webhook).toContain("if (batch.kind === 'unreadable')");
    expect(webhook).toContain('if (batch.records.length === 1)');
    // Phase 5 added a trailing argument: the message itself, so a payment method
    // the trader stated is not lost between the parser that ignored it and the
    // ledger column that exists for it.
    expect(webhook).toContain('createDailyRecordDraft(db, identity, waMessageId, guardedRecord, lang, body ?? undefined)');
    expect(webhook).toContain("db.rpc('wa_create_daily_record_batch_drafts'");
    expect(webhook).toContain("db.rpc('wa_confirm_daily_record_batch'");
    expect(webhook).toContain("db.rpc('wa_cancel_daily_record_batch'");
    expect(webhook).not.toContain("from('daily_records').update");
  });
});
