// Builds a PDF invoice for every delivered marketplace order and sends it to
// the shop that placed it.
//
// Same shape as generate-invoice: pdf-lib, upload to the private `invoices`
// bucket, no Node polyfills. Driven by pg_cron through net.http_post, so it
// needs no external scheduler and no server of the operator's own.
//
// Money note: nothing here computes a price. unit_price came from the
// supplier's own wholesale price at the moment the order was placed, and the
// total was fixed in marketplace_claim_invoices. This renders what was agreed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { corsHeaders } from '../_shared/cors.ts';
import { sendWhatsAppDocument } from '../_shared/whatsappApi.ts';

type Claim = {
  orderId: string;
  invoiceNo: string;
  productName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  total: number;
  currency: string;
  placedAt: string;
  deliveredAt: string | null;
  buyerCompanyId: string;
  buyerName: string;
  supplierName: string;
  buyerPhone: string | null;
  lang: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

const money = (n: number) => Math.round(n).toLocaleString('en-US');
const day = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');

async function buildPdf(claim: Claim): Promise<Uint8Array> {
  const sw = claim.lang === 'sw';
  const doc = await PDFDocument.create();
  // A4, the paper a Tanzanian shop actually prints on.
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.09, 0.13);
  const muted = rgb(0.42, 0.45, 0.5);
  const line = rgb(0.85, 0.87, 0.9);

  // Brand red, the colour the sidebar uses. One accent, used three times, so
  // the page reads as Risip without becoming a poster.
  const brand = rgb(0.53, 0.05, 0.12);

  let y = 780;
  const text = (s: string, x: number, size: number, f = font, color = ink) => {
    page.drawText(s, { x, y, size, font: f, color });
  };
  // Right-align against a column edge, so figures line up on their last digit
  // rather than their first — the whole point of a money column.
  const right = (s: string, edge: number, size: number, f = font, color = ink) => {
    page.drawText(s, { x: edge - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  };

  page.drawRectangle({ x: 0, y: 792, width: 595.28, height: 50, color: brand });
  y = 810;
  text('RISIP', 50, 18, bold, rgb(1, 1, 1));
  right(sw ? 'ANKARA' : 'INVOICE', 545, 18, bold, rgb(1, 1, 1));

  y = 755;
  text(claim.invoiceNo, 50, 20, bold);
  y -= 16;
  text(sw ? 'Ankara ya mzigo kati ya maduka' : 'Shop-to-shop restock invoice', 50, 9, font, muted);

  y = 720;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: line });

  // Who owes whom. Named plainly: this is the document a trader files.
  y -= 30;
  text(sw ? 'MUUZAJI' : 'SUPPLIER', 50, 9, bold, muted);
  text(sw ? 'MNUNUZI' : 'BUYER', 320, 9, bold, muted);
  y -= 16;
  text(claim.supplierName, 50, 12, bold);
  text(claim.buyerName, 320, 12, bold);

  y -= 34;
  text(sw ? 'Tarehe ya oda' : 'Ordered', 50, 9, bold, muted);
  text(sw ? 'Tarehe ya kufikishwa' : 'Delivered', 320, 9, bold, muted);
  y -= 15;
  text(day(claim.placedAt), 50, 11);
  text(day(claim.deliveredAt), 320, 11);

  y -= 44;
  page.drawRectangle({ x: 50, y: y - 8, width: 495, height: 26, color: rgb(0.96, 0.97, 0.98) });
  text(sw ? 'BIDHAA' : 'ITEM', 60, 9, bold, muted);
  right(sw ? 'IDADI' : 'QTY', 360, 9, bold, muted);
  right(sw ? 'BEI' : 'UNIT PRICE', 450, 9, bold, muted);
  right(sw ? 'JUMLA' : 'AMOUNT', 535, 9, bold, muted);

  y -= 30;
  text(claim.productName, 60, 11);
  right(`${money(claim.quantity)}${claim.unit ? ` ${claim.unit}` : ''}`, 360, 11);
  right(money(claim.unitPrice), 450, 11);
  right(money(claim.total), 535, 11);

  y -= 18;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: line });

  // The figure the trader is looking for, given its own block so the eye lands
  // on it without reading the rest.
  y -= 44;
  page.drawRectangle({ x: 330, y: y - 12, width: 215, height: 44, color: rgb(0.98, 0.95, 0.96) });
  y += 10;
  text(sw ? 'JUMLA KUU' : 'TOTAL DUE', 342, 9, bold, muted);
  y -= 20;
  right(`${claim.currency} ${money(claim.total)}`, 535, 16, bold, brand);

  // Payment is explicitly out of scope: Risip records the trade, the two shops
  // settle it between themselves. Saying so ON the document, in a box rather
  // than in small print, is what stops a shop believing Risip took the money.
  y -= 70;
  page.drawRectangle({ x: 50, y: y - 16, width: 495, height: 36, color: rgb(0.97, 0.98, 0.99) });
  page.drawRectangle({ x: 50, y: y - 16, width: 3, height: 36, color: brand });
  y += 6;
  text(
    sw
      ? 'Malipo hufanyika kati ya maduka yenyewe.'
      : 'Payment is settled directly between the two shops.',
    64, 10, bold,
  );
  y -= 14;
  text(
    sw ? 'Risip haipokei fedha za bidhaa.' : 'Risip does not collect money for goods.',
    64, 9, font, muted,
  );

  y = 60;
  page.drawLine({ start: { x: 50, y: y + 16 }, end: { x: 545, y: y + 16 }, thickness: 1, color: line });
  text(sw ? 'Imetengenezwa na Risip' : 'Generated by Risip', 50, 8, font, muted);
  right(day(claim.deliveredAt), 545, 8, font, muted);

  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'not_configured' }, 503);

  // Shared secret in a header, the same way ops-watch is called from pg_cron.
  // The service key is deliberately NOT the credential: pg_cron would have to
  // hold it, and a scheduler that can do anything is a scheduler worth
  // stealing. This secret can only run invoices.
  const expected = Deno.env.get('MARKETPLACE_INVOICE_SECRET') ?? '';
  const given = req.headers.get('x-invoice-secret') ?? '';
  if (!expected || given !== expected) return json({ error: 'unauthorized' }, 401);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.rpc('marketplace_claim_invoices', { p_limit: 10 });
  if (error) return json({ error: 'claim_failed', code: error.code }, 500);
  const claims = (data ?? []) as Claim[];
  const result = { claimed: claims.length, built: 0, sent: 0, failed: 0 };

  for (const claim of claims) {
    let path: string | null = null;
    let sent = false;
    let failure: string | null = null;
    try {
      const bytes = await buildPdf(claim);
      // First path segment is the order id, so the bucket keeps the shape its
      // storage policies expect (a uuid, then the file).
      path = `${claim.orderId}/invoice.pdf`;
      const up = await db.storage.from('invoices')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (up.error) throw new Error(`upload_failed`);
      result.built += 1;

      if (claim.buyerPhone) {
        // Meta fetches this itself, so an hour is ample and the file stays
        // private afterwards.
        const signed = await db.storage.from('invoices').createSignedUrl(path, 3600);
        if (signed.error || !signed.data?.signedUrl) throw new Error('sign_failed');
        const sw = claim.lang === 'sw';
        const out = await sendWhatsAppDocument(
          claim.buyerPhone,
          signed.data.signedUrl,
          `${claim.invoiceNo}.pdf`,
          sw
            ? `Ankara ${claim.invoiceNo} — ${claim.supplierName}. Jumla ${claim.currency} ${money(claim.total)}.`
            : `Invoice ${claim.invoiceNo} from ${claim.supplierName}. Total ${claim.currency} ${money(claim.total)}.`,
        );
        sent = out.ok;
        if (out.messageId) console.info('marketplace_invoice_sent', claim.invoiceNo, out.messageId);
        if (!out.ok) {
          // 131047 is Meta refusing a message outside the 24h window. It needs
          // an approved template with a document header, not a retry.
          failure = out.code === 131047
            ? 'outside_service_window_template_required'
            : `meta_${out.status ?? 'no_response'}_${out.code ?? 'unknown'}`;
        }
      } else {
        failure = 'buyer_has_no_verified_whatsapp';
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : 'invoice_failed';
    }

    if (sent) result.sent += 1; else result.failed += 1;
    // The PDF is recorded even when the send fails: the buyer can still open it
    // in the app, which needs nobody's approval.
    await db.rpc('marketplace_mark_invoice', {
      p_order_id: claim.orderId, p_path: path, p_sent: sent, p_error: failure,
    });
  }

  return json(result);
});
