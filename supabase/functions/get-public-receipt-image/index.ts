// get-public-receipt-image · POST { public_token, receipt_id }
// Anon-callable. Returns a 10-minute signed URL for a receipt image, but ONLY if that
// receipt genuinely belongs to the invoice identified by public_token (via the
// invoice_receipts join). This lets a client verify receipts on the public invoice page
// without exposing the private receipts bucket.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'server misconfigured' }, 500);

  let body: { public_token?: string; receipt_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const publicToken = body.public_token;
  const receiptId = body.receipt_id;
  if (!publicToken || !receiptId) return json({ error: 'public_token and receipt_id required' }, 400);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Resolve the invoice from the public token.
  const { data: invoice } = await admin.from('invoices').select('id').eq('public_token', publicToken).maybeSingle();
  if (!invoice) return json({ error: 'invoice not found' }, 404);

  // 2. Confirm the receipt belongs to that invoice.
  const { data: link } = await admin
    .from('invoice_receipts')
    .select('receipt_id')
    .eq('invoice_id', invoice.id)
    .eq('receipt_id', receiptId)
    .maybeSingle();
  if (!link) return json({ error: 'receipt not part of this invoice' }, 403);

  // 3. Look up the storage path and sign it.
  const { data: receipt } = await admin.from('receipts').select('image_url').eq('id', receiptId).maybeSingle();
  if (!receipt?.image_url) return json({ signed_url: null }); // manual entry, no image

  const { data: signed, error: sErr } = await admin.storage
    .from('receipts')
    .createSignedUrl(receipt.image_url, 600);
  if (sErr) return json({ error: sErr.message }, 500);

  return json({ signed_url: signed.signedUrl });
});
