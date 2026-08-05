import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json, preflight } from '../_shared/cors.ts';

type ReceiptInput = {
  vendor_name?: string;
  receipt_date?: string;
  total_amount?: number | null;
  tax_amount?: number | null;
  category?: string;
  verification_code?: string;
  note?: string;
  file_name?: string;
  file_type?: string;
  file_base64?: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const body = await req.json();
    const connectionToken = String(body.connection_token ?? '').trim();
    const title = String(body.title ?? '').trim();
    const claimNote = body.claim_note ? String(body.claim_note) : null;
    const receipts = Array.isArray(body.receipts) ? body.receipts.slice(0, 5) as ReceiptInput[] : [];
    const explicitAmount = body.amount === null || body.amount === undefined ? null : Number(body.amount);

    if (!connectionToken) return json({ error: 'Connection token is required.' }, { status: 400 });
    if (!title) return json({ error: 'Claim title is required.' }, { status: 400 });
    if (receipts.length === 0 && !explicitAmount) {
      return json({ error: 'Add at least one receipt or claim amount.' }, { status: 400 });
    }

    const { data: connection, error: connectionError } = await admin
      .from('supplier_connections')
      .select('id, target_company_id, status')
      .eq('public_token', connectionToken)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) return json({ error: 'Connection token was not found.' }, { status: 404 });
    if (connection.status !== 'connected') {
      return json({ error: 'The company has not approved this supplier connection yet.' }, { status: 403 });
    }

    const receiptAmount = receipts.reduce((sum, receipt) => sum + safeAmount(receipt.total_amount), 0);
    const amount = explicitAmount ?? (receiptAmount > 0 ? receiptAmount : null);

    const { data: claim, error: claimError } = await admin
      .from('supplier_claims')
      .insert({
        connection_id: connection.id,
        target_company_id: connection.target_company_id,
        title,
        claim_note: claimNote,
        amount,
      })
      .select('id, public_token')
      .single();

    if (claimError) throw claimError;

    const rows = [];
    for (const receipt of receipts) {
      let imagePath: string | null = null;
      if (receipt.file_base64 && receipt.file_name) {
        const bytes = decodeBase64(receipt.file_base64);
        const extension = fileExtension(receipt.file_name);
        imagePath = `${connection.target_company_id}/supplier-claims/${claim.id}/${crypto.randomUUID()}${extension}`;
        const { error: uploadError } = await admin.storage
          .from('receipts')
          .upload(imagePath, bytes, {
            contentType: receipt.file_type || 'application/octet-stream',
            upsert: false,
          });
        if (uploadError) throw uploadError;
      }

      rows.push({
        claim_id: claim.id,
        vendor_name: clean(receipt.vendor_name),
        receipt_date: clean(receipt.receipt_date),
        total_amount: nullableAmount(receipt.total_amount),
        tax_amount: nullableAmount(receipt.tax_amount),
        category: clean(receipt.category),
        verification_code: clean(receipt.verification_code),
        image_url: imagePath,
        note: clean(receipt.note),
      });
    }

    if (rows.length > 0) {
      const { error: receiptError } = await admin.from('supplier_claim_receipts').insert(rows);
      if (receiptError) throw receiptError;
    }

    if (claimNote) {
      await admin.from('supplier_claim_messages').insert({
        claim_id: claim.id,
        sender_role: 'supplier',
        message: claimNote,
      });
    }

    return json({ claim_token: claim.public_token });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Could not submit claim.';
    return json({ error: message }, { status: 400 });
  }
});

function clean(value: unknown): string | null {
  const next = String(value ?? '').trim();
  return next || null;
}

function nullableAmount(value: unknown): number | null {
  const amount = safeAmount(value);
  return amount > 0 ? amount : null;
}

function safeAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function fileExtension(name: string): string {
  const match = name.match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : '';
}
