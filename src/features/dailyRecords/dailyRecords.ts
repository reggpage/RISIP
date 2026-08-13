import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { DailyRecord, DailyRecordAudit, DailyRecordLine } from '@/types/db';

export type DailyRecordWithDetails = DailyRecord & {
  lines: DailyRecordLine[];
  recordedByName: string | null;
};

export type DailyRecordSummary = {
  sales: number;
  expenses: number;
  debtIssued: number;
  customerPayments: number;
  cashMovement: number;
};

export type DailyRecordsState =
  | { status: 'loading'; records: DailyRecordWithDetails[]; error: null }
  | { status: 'ready'; records: DailyRecordWithDetails[]; error: null }
  | { status: 'error'; records: DailyRecordWithDetails[]; error: Error };

function asNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export function getDailyRecordSummary(
  records: DailyRecordWithDetails[],
  date = new Date(),
): DailyRecordSummary {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const today = records.filter((record) => {
    if (record.status !== 'confirmed') return false;
    const occurred = new Date(record.occurred_at);
    return occurred.getFullYear() === year && occurred.getMonth() === month && occurred.getDate() === day;
  });

  const sum = (kind: DailyRecord['kind']) =>
    today.filter((record) => record.kind === kind).reduce((total, record) => total + asNumber(record.amount), 0);
  const sales = sum('sale');
  const expenses = sum('expense');
  const customerPayments = sum('customer_payment');

  return {
    sales,
    expenses,
    debtIssued: sum('debt_issued'),
    customerPayments,
    cashMovement: sales + customerPayments - expenses,
  };
}

export async function confirmDailyRecord(id: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_daily_record', { p_daily_record_id: id });
  if (error) throw error;
}

export async function voidDailyRecord(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_daily_record', { p_daily_record_id: id, p_reason: reason });
  if (error) throw error;
}

export async function getDailyRecordAudit(id: string): Promise<DailyRecordAudit[]> {
  const { data, error } = await supabase
    .from('daily_record_audit_log')
    .select('*')
    .eq('daily_record_id', id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DailyRecordAudit[];
}

async function loadDailyRecords(): Promise<DailyRecordWithDetails[]> {
  const { data: recordData, error: recordError } = await supabase
    .from('daily_records')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(1000);
  if (recordError) throw recordError;

  const records = (recordData ?? []) as DailyRecord[];
  if (records.length === 0) return [];

  const ids = records.map((record) => record.id);
  const recordedByIds = Array.from(new Set(records.map((record) => record.recorded_by).filter(Boolean))) as string[];

  const [{ data: lineData, error: lineError }, { data: profileData, error: profileError }] = await Promise.all([
    supabase
      .from('daily_record_lines')
      .select('*')
      .in('daily_record_id', ids)
      .order('line_number', { ascending: true }),
    recordedByIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', recordedByIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lineError) throw lineError;
  if (profileError) throw profileError;

  const lines = (lineData ?? []) as DailyRecordLine[];
  const names = new Map((profileData ?? []).map((profile) => [profile.id, profile.full_name]));

  return records.map((record) => ({
    ...record,
    lines: lines.filter((line) => line.daily_record_id === record.id),
    recordedByName: record.recorded_by ? names.get(record.recorded_by) ?? null : null,
  }));
}

export function useDailyRecords(): DailyRecordsState & { reload: () => void } {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<DailyRecordsState>({ status: 'loading', records: [], error: null });

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ status: 'loading', records: current.records, error: null }));
    void loadDailyRecords()
      .then((records) => {
        if (!cancelled) setState({ status: 'ready', records, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            records: [],
            error: error instanceof Error ? error : new Error('Could not load daily records.'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return { ...state, reload };
}

