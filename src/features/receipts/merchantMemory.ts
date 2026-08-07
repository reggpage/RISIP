import { supabase } from '@/lib/supabase';
import type { MerchantMemory } from '@/types/db';

type MerchantFields = {
  vendor_name: string | null;
  vendor_tin: string | null;
  vendor_vrn: string | null;
  category: string | null;
};

function normalizeWords(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function merchantMemoryKeys(fields: MerchantFields): string[] {
  const keys: string[] = [];
  const tin = digits(fields.vendor_tin);
  const vrn = String(fields.vendor_vrn ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const name = normalizeWords(fields.vendor_name);
  if (tin.length === 9) keys.push(`tin:${tin}`);
  if (vrn.length >= 5) keys.push(`vrn:${vrn}`);
  if (name.length >= 3) keys.push(`name:${name}`);
  return [...new Set(keys)];
}

export async function loadMerchantMemory(): Promise<MerchantMemory[]> {
  const { data, error } = await supabase
    .from('merchant_memory')
    .select('*');
  if (error) throw error;
  return data ?? [];
}

export function applyMerchantMemory<T extends MerchantFields>(row: T, memories: MerchantMemory[]): T {
  const match = merchantMemoryKeys(row)
    .map((key) => memories.find((memory) => memory.match_key === key))
    .find(Boolean);
  if (!match) return row;
  return {
    ...row,
    vendor_name: match.vendor_name,
    vendor_tin: match.vendor_tin ?? row.vendor_tin,
    vendor_vrn: match.vendor_vrn ?? row.vendor_vrn,
    category: match.category ?? row.category,
  };
}

// Save only a human correction. The original AI name is retained as a matching key,
// while a corrected TIN/VRN becomes an even stronger key for later scans.
export async function rememberMerchantCorrection(args: {
  companyId: string;
  userId: string;
  receiptId?: string;
  before: MerchantFields;
  after: MerchantFields;
}): Promise<boolean> {
  const corrected = args.after.vendor_name?.trim();
  if (!corrected) return false;

  const changed = args.before.vendor_name?.trim() !== corrected
    || digits(args.before.vendor_tin) !== digits(args.after.vendor_tin)
    || String(args.before.vendor_vrn ?? '').trim() !== String(args.after.vendor_vrn ?? '').trim()
    || args.before.category !== args.after.category;
  if (!changed) return false;

  const keys = [...new Set([
    ...merchantMemoryKeys(args.before),
    ...merchantMemoryKeys(args.after),
  ])];
  if (!keys.length) return false;

  const rows = keys.map((match_key) => ({
    company_id: args.companyId,
    match_key,
    vendor_name: corrected,
    vendor_tin: digits(args.after.vendor_tin) || null,
    vendor_vrn: String(args.after.vendor_vrn ?? '').trim() || null,
    category: args.after.category || null,
    learned_from_receipt_id: args.receiptId || null,
    created_by: args.userId,
  }));
  const { error } = await supabase
    .from('merchant_memory')
    .upsert(rows, { onConflict: 'company_id,match_key' });
  if (error) throw error;
  return true;
}
