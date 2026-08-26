import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export type StoragePlan = Map<string, Set<string>>;

function add(plan: StoragePlan, bucket: string, path: string | null | undefined) {
  const clean = path?.split('?')[0]?.replace(/^\/+/, '').trim();
  if (!clean) return;
  const paths = plan.get(bucket) ?? new Set<string>();
  paths.add(decodeURIComponent(clean));
  plan.set(bucket, paths);
}

function pathFromUrl(bucket: string, value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const marker = `/${bucket}/`;
  const at = value.indexOf(marker);
  return at < 0 ? null : value.slice(at + marker.length).split('?')[0] ?? null;
}

async function listPrefix(
  admin: SupabaseClient,
  plan: StoragePlan,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<void> {
  if (depth > 8) throw new Error(`storage path nesting is too deep for ${bucket}/${prefix}`);
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) add(plan, bucket, path);
      else await listPrefix(admin, plan, bucket, path, depth + 1);
    }
    if (entries.length < 1000) break;
    offset += entries.length;
  }
}

export async function collectCompanyStorage(
  admin: SupabaseClient,
  companyId: string,
): Promise<StoragePlan> {
  const plan: StoragePlan = new Map();
  const [company, projects, receipts, invoices, scanned, retirementDocs, claimReceipts] = await Promise.all([
    admin.from('companies').select('logo_url').eq('id', companyId).maybeSingle(),
    admin.from('projects').select('id').eq('company_id', companyId),
    admin.from('receipts').select('image_url').eq('company_id', companyId),
    admin.from('invoices').select('pdf_url, project_id').in(
      'project_id',
      (await admin.from('projects').select('id').eq('company_id', companyId)).data?.map((row) => row.id) ?? ['00000000-0000-0000-0000-000000000000'],
    ),
    admin.from('scanned_documents').select('file_url').eq('company_id', companyId),
    admin.from('staff_retirement_documents').select('storage_path').eq('company_id', companyId),
    admin.from('supplier_claim_receipts').select('image_url, claim_id').in(
      'claim_id',
      (await admin.from('supplier_claims').select('id').eq('target_company_id', companyId)).data?.map((row) => row.id) ?? ['00000000-0000-0000-0000-000000000000'],
    ),
  ]);
  for (const result of [company, projects, receipts, invoices, scanned, retirementDocs, claimReceipts]) {
    if (result.error) throw result.error;
  }

  add(plan, 'company-logos', pathFromUrl('company-logos', company.data?.logo_url));
  for (const row of receipts.data ?? []) add(plan, 'receipts', pathFromUrl('receipts', row.image_url));
  for (const row of invoices.data ?? []) add(plan, 'invoices', pathFromUrl('invoices', row.pdf_url));
  for (const row of scanned.data ?? []) add(plan, 'receipts', pathFromUrl('receipts', row.file_url));
  for (const row of retirementDocs.data ?? []) add(plan, 'receipts', row.storage_path);
  for (const row of claimReceipts.data ?? []) add(plan, 'receipts', pathFromUrl('receipts', row.image_url));

  // Current and legacy logo paths are both covered. Project prefixes cover
  // receipt/invoice uploads whose URL was not persisted in a row.
  await listPrefix(admin, plan, 'company-logos', companyId);
  await listPrefix(admin, plan, 'company-logos', `${companyId}.`);
  for (const row of projects.data ?? []) {
    await listPrefix(admin, plan, 'receipts', row.id);
    await listPrefix(admin, plan, 'invoices', row.id);
  }
  await listPrefix(admin, plan, 'receipts', companyId);
  return plan;
}

export async function removeStoragePlan(admin: SupabaseClient, plan: StoragePlan) {
  const failures: string[] = [];
  for (const [bucket, paths] of plan) {
    const values = [...paths];
    for (let i = 0; i < values.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(values.slice(i, i + 100));
      if (error) failures.push(`${bucket}: ${error.message}`);
    }
  }
  return { removed: [...plan.entries()].reduce((n, [, paths]) => n + paths.size, 0), failures };
}
