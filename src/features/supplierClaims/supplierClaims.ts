import { supabase } from '@/lib/supabase';

export type SupplierConnectionStatus = 'pending' | 'connected' | 'declined';
export type SupplierClaimStatus =
  | 'submitted'
  | 'viewed'
  | 'approved_for_payment'
  | 'paid'
  | 'received_confirmed'
  | 'disputed';

export type SupplierConnection = {
  id: string;
  target_company_id: string;
  supplier_name: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  supplier_tin: string | null;
  note: string | null;
  status: SupplierConnectionStatus;
  public_token: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierClaim = {
  id: string;
  connection_id: string;
  target_company_id: string;
  title: string;
  claim_note: string | null;
  amount: number | null;
  status: SupplierClaimStatus;
  public_token: string;
  viewed_at: string | null;
  paid_at: string | null;
  received_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function createSupplierKnock(input: {
  target_company_id: string;
  supplier_name: string;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  supplier_tin?: string;
  note?: string;
}) {
  const { data, error } = await (supabase as any).rpc('public_supplier_knock', {
    p_target_company_id: input.target_company_id,
    p_supplier_name: input.supplier_name,
    p_contact_name: input.contact_name,
    p_contact_email: input.contact_email ?? null,
    p_contact_phone: input.contact_phone ?? null,
    p_supplier_tin: input.supplier_tin ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return (data?.[0]?.connection_token ?? null) as string | null;
}

export async function submitSupplierClaim(input: {
  connection_token: string;
  title: string;
  claim_note?: string;
  amount?: number | null;
}) {
  const { data, error } = await (supabase as any).rpc('public_supplier_submit_claim', {
    p_connection_token: input.connection_token,
    p_title: input.title,
    p_claim_note: input.claim_note ?? null,
    p_amount: input.amount ?? null,
  });
  if (error) throw error;
  return (data?.[0]?.claim_token ?? null) as string | null;
}

export async function fetchSupplierConnections(companyId: string) {
  const { data, error } = await (supabase as any)
    .from('supplier_connections')
    .select('*')
    .eq('target_company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupplierConnection[];
}

export async function fetchSupplierClaims(companyId: string) {
  const { data, error } = await (supabase as any)
    .from('supplier_claims')
    .select('*')
    .eq('target_company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupplierClaim[];
}

export async function updateSupplierConnection(id: string, patch: Partial<SupplierConnection>) {
  const { error } = await (supabase as any).from('supplier_connections').update(patch).eq('id', id);
  if (error) throw error;
}

export async function updateSupplierClaim(id: string, patch: Partial<SupplierClaim>) {
  const { error } = await (supabase as any).from('supplier_claims').update(patch).eq('id', id);
  if (error) throw error;
}
