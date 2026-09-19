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
//
// DESIGN: bank statement, not brochure. Black on white, ruled columns, one
// weight of line, no colour. A trader files this next to bank slips and TRA
// receipts; it has to look like it belongs in that pile, and it has to survive
// a monochrome shop printer without losing a single distinction.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
// Pure JS, no Node builtins: it returns the module grid and we draw it with
// pdf-lib, so no image encoder and no polyfill are involved.
import qrcode from 'https://esm.sh/qrcode-generator@1.4.4';
// pdf-lib only embeds the 14 standard PDF fonts on its own. Anything else —
// Poppins included — needs fontkit registered first.
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import { corsHeaders } from '../_shared/cors.ts';
import { sendWhatsAppDocument } from '../_shared/whatsappApi.ts';

const LOGO_URL = 'https://www.risip.online/icon-192.png';
// Poppins, the family the rest of Risip uses. Google's own font repository,
// pinned by path rather than by a CSS API that would hand back woff2 — fontkit
// wants a real TTF.
const POPPINS = {
  regular: 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf',
  semibold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-SemiBold.ttf',
};

// Fetched once per cold start, not per invoice.
const assetCache = new Map<string, Uint8Array | null>();
async function asset(url: string): Promise<Uint8Array | null> {
  if (assetCache.has(url)) return assetCache.get(url) ?? null;
  let bytes: Uint8Array | null = null;
  try {
    const res = await fetch(url);
    bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    // An invoice in Helvetica, or without a logo, is still a valid invoice.
    // An invoice that failed to build because a CDN was slow is not.
    bytes = null;
  }
  assetCache.set(url, bytes);
  return bytes;
}

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
  supplierContactName: string | null;
  supplierPhone: string | null;
  supplierWhatsapp: string | null;
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
  doc.registerFontkit(fontkit);
  // A4, the paper a Tanzanian shop actually prints on.
  const page = doc.addPage([595.28, 841.89]);

  // Poppins where it can be had, Helvetica where it cannot. Subset so the PDF
  // stays small enough to arrive over mobile data: the full family is ~160KB
  // per weight, the glyphs an invoice actually uses are a fraction of that.
  const [regularTtf, semiboldTtf] = await Promise.all([
    asset(POPPINS.regular), asset(POPPINS.semibold),
  ]);
  const font = regularTtf
    ? await doc.embedFont(regularTtf, { subset: true })
    : await doc.embedFont(StandardFonts.Helvetica);
  const bold = semiboldTtf
    ? await doc.embedFont(semiboldTtf, { subset: true })
    : await doc.embedFont(StandardFonts.HelveticaBold);

  // Monochrome only. Three greys do all the work a colour palette would.
  const black = rgb(0, 0, 0);
  const grey = rgb(0.45, 0.45, 0.45);
  const hair = rgb(0.72, 0.72, 0.72);
  const L = 50, R = 545;

  let y = 0;
  const text = (s: string, x: number, size: number, f = font, color = black) =>
    page.drawText(s, { x, y, size, font: f, color });
  // Money right-aligns on its last digit. That is the entire reason a
  // statement is readable at a glance.
  const right = (s: string, edge: number, size: number, f = font, color = black) =>
    page.drawText(s, { x: edge - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  const rule = (at: number, thickness = 0.75, color = hair) =>
    page.drawLine({ start: { x: L, y: at }, end: { x: R, y: at }, thickness, color });

  // ── Masthead ────────────────────────────────────────────────────────────
  const logo = await asset(LOGO_URL);
  if (logo) {
    try {
      const png = await doc.embedPng(logo);
      page.drawImage(png, { x: L, y: 762, width: 38, height: 38 });
    } catch { /* a bad logo must never cost the invoice */ }
  }
  y = 788;
  text('RISIP', logo ? L + 48 : L, 17, bold);
  y = 772;
  text(sw ? 'Mfumo wa biashara' : 'Business system', logo ? L + 48 : L, 8, font, grey);

  y = 788;
  right(sw ? 'ANKARA' : 'INVOICE', R, 17, bold);
  y = 772;
  right(claim.invoiceNo, R, 9, bold, grey);

  rule(752, 1.2, black);

  // ── Parties ─────────────────────────────────────────────────────────────
  const mid = 310;
  y = 734;
  text(sw ? 'MUUZAJI' : 'SUPPLIER', L, 8, bold, grey);
  text(sw ? 'MNUNUZI' : 'BUYER', mid, 8, bold, grey);
  y = 718;
  text(claim.supplierName, L, 11, bold);
  text(claim.buyerName, mid, 11, bold);

  // The contact block. An invoice about a trade between two shops that does
  // not say how to reach the other shop sends the trader back to the app.
  y = 702;
  if (claim.supplierContactName) text(claim.supplierContactName, L, 9, font, grey);
  if (claim.supplierPhone) { y -= 12; text(`${sw ? 'Simu' : 'Phone'}: ${claim.supplierPhone}`, L, 9); }
  if (claim.supplierWhatsapp && claim.supplierWhatsapp !== claim.supplierPhone) {
    y -= 12; text(`WhatsApp: ${claim.supplierWhatsapp}`, L, 9);
  }

  y = 674;
  text(`${sw ? 'Tarehe ya oda' : 'Order date'}: ${day(claim.placedAt)}`, mid, 9, font, grey);
  y -= 12;
  text(`${sw ? 'Imefikishwa' : 'Delivered'}: ${day(claim.deliveredAt)}`, mid, 9, font, grey);

  rule(648);

  // ── Line items ──────────────────────────────────────────────────────────
  const cQty = 360, cUnit = 450, cAmt = R;
  y = 630;
  text(sw ? 'BIDHAA' : 'DESCRIPTION', L, 8, bold, grey);
  right(sw ? 'IDADI' : 'QTY', cQty, 8, bold, grey);
  right(sw ? 'BEI' : 'UNIT PRICE', cUnit, 8, bold, grey);
  right(sw ? 'KIASI' : 'AMOUNT', cAmt, 8, bold, grey);
  rule(622);

  y = 604;
  text(claim.productName, L, 10);
  right(`${money(claim.quantity)}${claim.unit ? ` ${claim.unit}` : ''}`, cQty, 10);
  right(money(claim.unitPrice), cUnit, 10);
  right(money(claim.total), cAmt, 10);

  rule(588);

  // ── Total ───────────────────────────────────────────────────────────────
  // Double rule under the total: the statement convention for "this is the
  // figure", achieved without a single drop of ink that is not black.
  y = 568;
  right(sw ? 'JUMLA KUU' : 'TOTAL DUE', cUnit, 9, bold, grey);
  right(`${claim.currency} ${money(claim.total)}`, cAmt, 13, bold);
  page.drawLine({ start: { x: cUnit - 70, y: 560 }, end: { x: R, y: 560 }, thickness: 0.75, color: black });
  page.drawLine({ start: { x: cUnit - 70, y: 557 }, end: { x: R, y: 557 }, thickness: 0.75, color: black });

  // ── QR + settlement note ────────────────────────────────────────────────
  // The QR opens a WhatsApp chat with the supplier. On a printed slip it is
  // the only part a phone can act on, which is why it earns the space.
  const waNumber = (claim.supplierWhatsapp ?? claim.supplierPhone ?? '').replace(/\D/g, '');
  const qrTarget = waNumber
    ? `https://wa.me/${waNumber}`
    : `${claim.invoiceNo} ${claim.supplierName} ${claim.currency} ${money(claim.total)}`;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(qrTarget);
    qr.make();
    const count = qr.getModuleCount();
    const box = 90;
    const cell = box / count;
    const qx = L, qy = 430;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!qr.isDark(r, c)) continue;
        page.drawRectangle({
          x: qx + c * cell,
          y: qy + box - (r + 1) * cell,
          width: cell, height: cell, color: black,
        });
      }
    }
    y = qy - 14;
    text(sw ? 'Scan kuwasiliana na muuzaji' : 'Scan to message the supplier', qx, 7, font, grey);
  } catch { /* no QR is survivable; a failed invoice is not */ }

  y = 500;
  text(sw ? 'MALIPO' : 'PAYMENT', 165, 8, bold, grey);
  y = 484;
  text(
    sw ? 'Malipo hufanyika kati ya maduka yenyewe.'
       : 'Payment is settled directly between the two shops.',
    165, 10, bold,
  );
  y -= 14;
  text(
    sw ? 'Risip haipokei fedha za bidhaa.'
       : 'Risip does not collect money for goods.',
    165, 9, font, grey,
  );
  if (claim.supplierPhone) {
    y -= 18;
    text(`${sw ? 'Piga' : 'Call'}: ${claim.supplierPhone}`, 165, 10, bold);
  }

  // ── Foot ────────────────────────────────────────────────────────────────
  rule(96);
  y = 82;
  text(sw ? 'Imetengenezwa na Risip' : 'Generated by Risip', L, 8, font, grey);
  right(claim.invoiceNo, R, 8, font, grey);
  y = 70;
  text(
    sw ? 'Hati hii ni kumbukumbu ya manunuzi kati ya maduka mawili.'
       : 'This document records a purchase between two shops.',
    L, 8, font, grey,
  );

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
      if (up.error) throw new Error('upload_failed');
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
