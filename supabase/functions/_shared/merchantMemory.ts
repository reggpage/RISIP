type MerchantLike = {
  vendor_name?: string | null;
  vendor?: string | null;
  vendor_tin?: string | null;
  vendor_vrn?: string | null;
  category?: string | null;
};

function normalizeWords(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function keysFor(row: MerchantLike): string[] {
  const tin = String(row.vendor_tin ?? '').replace(/\D/g, '');
  const vrn = String(row.vendor_vrn ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const name = normalizeWords(row.vendor_name ?? row.vendor);
  return [
    tin.length === 9 ? `tin:${tin}` : null,
    vrn.length >= 5 ? `vrn:${vrn}` : null,
    name.length >= 3 ? `name:${name}` : null,
  ].filter((key): key is string => Boolean(key));
}

// Applies only a human-confirmed company entry. TIN is checked first, which
// lets a known station win even when the model guessed a visually similar logo.
export async function applyCompanyMerchantMemory<T extends MerchantLike>(admin: any, companyId: string | null | undefined, row: T): Promise<T> {
  if (!companyId) return row;
  const keys = keysFor(row);
  if (!keys.length) return row;
  const { data, error } = await admin
    .from('merchant_memory')
    .select('match_key, vendor_name, vendor_tin, vendor_vrn, category')
    .eq('company_id', companyId)
    .in('match_key', keys);
  if (error || !data?.length) return row;
  const match = keys.map((key) => data.find((entry: any) => entry.match_key === key)).find(Boolean);
  if (!match) return row;
  const vendorKey = Object.prototype.hasOwnProperty.call(row, 'vendor_name') ? 'vendor_name' : 'vendor';
  return {
    ...row,
    [vendorKey]: match.vendor_name,
    vendor_tin: match.vendor_tin ?? row.vendor_tin,
    vendor_vrn: match.vendor_vrn ?? row.vendor_vrn,
    category: match.category ?? row.category,
  } as T;
}
