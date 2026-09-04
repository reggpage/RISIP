// The shop's records as a statement it can print, file or hand to somebody.
//
// WHY THIS RUNS ON THE SERVER. pdf-lib in the browser is roughly 300KB on top
// of the bundle, paid for by every shopkeeper on every load, most of whom will
// never press the button. It is already a proven dependency in the Deno
// functions here, so the PDF is built where the cost is paid once.
//
// TENANCY IS NOT A PARAMETER. The company is read from the CALLER'S profile,
// never from the request body. A client that asks for another company's
// records is asking a question this function cannot express.
//
// TOTALS COUNT CONFIRMED ROWS ONLY, and the statement says so on its face. A
// pending draft is not money that moved, and a voided record is money that
// un-moved; adding either to a total would produce a figure the dashboard
// disagrees with.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { pdfSafe } from '../_shared/pdfText.ts';
import { KIND_LABELS, buildStatement, type StatementRecord } from '../_shared/recordsStatement.ts';

const BRAND = rgb(0.867, 0.176, 0.290);   // #DD2D4A, --role-admin
const INK = rgb(0.059, 0.090, 0.165);     // #0F172A
const MUTED = rgb(0.278, 0.333, 0.412);   // #475569
const RULE = rgb(0.886, 0.910, 0.941);    // #E2E8F0

const bad = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: message }), {
    status, headers: { 'content-type': 'application/json' },
  });

const money = (n: number) => `TSh ${Math.round(n).toLocaleString('en-US')}`;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return bad('method not allowed', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return bad('server misconfigured', 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return bad('missing bearer token', 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.slice(7));
  if (userErr || !userData.user) return bad('invalid session', 401);

  const { data: profile } = await admin
    .from('profiles')
    .select('role, company_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return bad('no profile', 403);
  // The same wall the reports live behind. A worker may read reports in the
  // app; a downloadable statement of the whole ledger is the owner's business.
  if (profile.role !== 'owner' && profile.role !== 'accountant') return bad('forbidden', 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* an empty body means everything */ }
  const lang = String(body.lang ?? 'sw') === 'en' ? 'en' : 'sw';
  const from = typeof body.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : null;
  const to = typeof body.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.to) ? body.to : null;

  // The page has kind / status / source filters and the CSV button honours
  // them. If the PDF ignored them the two buttons on the same toolbar would
  // hand back different documents from the same screen. Each is checked
  // against a fixed list rather than passed through, so nothing typed by a
  // client reaches the query.
  const oneOf = (value: unknown, allowed: readonly string[]) =>
    typeof value === 'string' && allowed.includes(value) ? value : null;
  const kind = oneOf(body.kind, Object.keys(KIND_LABELS[lang]));
  const status = oneOf(body.status, ['confirmed', 'pending', 'voided']);
  const source = oneOf(body.source, ['whatsapp', 'app', 'other']);

  let query = admin
    .from('daily_records')
    .select('kind, status, amount, party_name, description, occurred_at')
    .eq('company_id', profile.company_id)
    .order('occurred_at', { ascending: true })
    .limit(5000);
  if (from) query = query.gte('occurred_at', `${from}T00:00:00+03:00`);
  if (to) query = query.lt('occurred_at', `${to}T23:59:59.999+03:00`);
  if (kind) query = query.eq('kind', kind);
  if (status) query = query.eq('status', status);
  if (source) query = query.eq('source', source);

  const { data: rows, error } = await query;
  if (error) return bad('could not read records', 500);
  const records = (rows ?? []) as StatementRecord[];
  // Every figure and every label on the page is decided here, under test.
  const statement = buildStatement(records, lang);

  const { data: company } = await admin
    .from('companies').select('name').eq('id', profile.company_id).maybeSingle();
  const businessName = String((company as { name?: string } | null)?.name ?? 'Risip');

  // ── The document ──────────────────────────────────────────────────────
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28;   // A4 portrait
  const H = 841.89;
  const L = 40;       // left margin
  const R = W - 40;   // right edge

  let page = doc.addPage([W, H]);
  let y = 0;

  const text = (s: string, x: number, size: number, opts: { bold?: boolean; color?: typeof INK; right?: boolean } = {}) => {
    const f = opts.bold ? bold : font;
    const safe = pdfSafe(s);
    const width = f.widthOfTextAtSize(safe, size);
    page.drawText(safe, {
      x: opts.right ? x - width : x,
      y, size, font: f, color: opts.color ?? INK,
    });
  };

  const rule = () => {
    page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.5, color: RULE });
  };

  // The one piece of brand, on every sheet, so a page that gets separated from
  // the others still says where it came from.
  const openPage = () => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: BRAND });
    y = H - 60;
  };
  // Opens the sheet already created above the first time, so the statement
  // never starts on a blank page.
  const newPage = () => {
    page = doc.addPage([W, H]);
    openPage();
  };

  openPage();

  // ── Header ────────────────────────────────────────────────────────────
  text(businessName, L, 20, { bold: true });
  y -= 20;
  text(lang === 'sw' ? 'Taarifa ya rekodi' : 'Records statement', L, 11, { color: MUTED });
  const period = from || to
    ? `${from ?? '...'}  ${lang === 'sw' ? 'hadi' : 'to'}  ${to ?? '...'}`
    : (lang === 'sw' ? 'Rekodi zote' : 'All records');
  text(pdfSafe(period), R, 11, { color: MUTED, right: true });
  y -= 16;

  // A filtered statement must say so on its face. Somebody files this paper
  // and reads it back a year later; a page that silently left out half the
  // ledger is worse than no page.
  const applied = [
    kind ? KIND_LABELS[lang][kind] : null,
    status ? (lang === 'sw'
      ? { confirmed: 'zilizothibitishwa', pending: 'zinazosubiri', voided: 'zilizoghairiwa' }[status]
      : status) : null,
    source ? (source === 'whatsapp' ? 'WhatsApp' : source) : null,
  ].filter(Boolean);
  if (applied.length > 0) {
    text(`${lang === 'sw' ? 'Kichujio' : 'Filter'}: ${applied.join(', ')}`, L, 9, { color: MUTED });
  }
  y -= 6;
  rule();
  y -= 18;

  // ── Table ─────────────────────────────────────────────────────────────
  const COL_DATE = L;
  const COL_KIND = L + 78;
  const COL_WHAT = L + 190;
  const COL_AMOUNT = R;

  const header = () => {
    text(lang === 'sw' ? 'TAREHE' : 'DATE', COL_DATE, 8, { bold: true, color: MUTED });
    text(lang === 'sw' ? 'AINA' : 'KIND', COL_KIND, 8, { bold: true, color: MUTED });
    text(lang === 'sw' ? 'MAELEZO' : 'DETAILS', COL_WHAT, 8, { bold: true, color: MUTED });
    text(lang === 'sw' ? 'KIASI' : 'AMOUNT', COL_AMOUNT, 8, { bold: true, color: MUTED, right: true });
    y -= 6;
    rule();
    y -= 14;
  };
  header();

  for (const row of statement.rows) {
    // A new sheet before the row is drawn, never after it has run off the page.
    if (y < 90) {
      newPage();
      header();
    }
    // A row that is not counted is drawn entirely in grey, so the eye can
    // separate what is in the totals from what is only on the page.
    const ink = row.counted ? INK : MUTED;
    text(row.day, COL_DATE, 9, { color: ink });
    text(row.kind, COL_KIND, 9, { color: MUTED });
    text(row.detail, COL_WHAT, 9, { color: ink });
    text(money(row.amount), COL_AMOUNT, 9, { right: true, bold: row.counted, color: ink });
    y -= 16;
  }

  // ── Totals ────────────────────────────────────────────────────────────
  // Nothing at all is a real answer, and it is the whole page. A totals
  // heading with no lines under it reads like the report failed.
  if (records.length === 0) {
    text(lang === 'sw' ? 'Hakuna rekodi kwa kipindi hiki.' : 'No records for this period.',
      L, 10, { color: MUTED });
  } else {
    if (y < 150) newPage();
    y -= 10;
    rule();
    y -= 20;
    text(lang === 'sw' ? 'JUMLA (zilizothibitishwa tu)' : 'TOTALS (confirmed only)', L, 10, { bold: true });
    y -= 18;

    for (const sum of statement.totals) {
      text(`${KIND_LABELS[lang][sum.kind] ?? sum.kind}  (${sum.count})`, L, 10, { color: MUTED });
      text(money(sum.amount), COL_AMOUNT, 10, { right: true, bold: true });
      y -= 16;
      if (y < 60) newPage();
    }

    if (statement.excluded > 0) {
      y -= 6;
      text(lang === 'sw'
        ? `Rekodi ${statement.excluded} hazikuhesabiwa kwenye jumla (zinasubiri au zimeghairiwa).`
        : `${statement.excluded} record(s) excluded from the totals (pending or voided).`,
      L, 8, { color: MUTED });
      y -= 14;
    }
  }

  // ── Footer on every sheet ─────────────────────────────────────────────
  const stamp = new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Dar_es_Salaam',
  }).format(new Date());
  const sheets = doc.getPages();
  sheets.forEach((sheet, i) => {
    sheet.drawText(pdfSafe(`Risip  ${stamp}`), {
      x: L, y: 28, size: 8, font, color: MUTED,
    });
    const label = pdfSafe(`${i + 1} / ${sheets.length}`);
    sheet.drawText(label, {
      x: R - font.widthOfTextAtSize(label, 8), y: 28, size: 8, font, color: MUTED,
    });
  });

  const bytes = await doc.save();
  const name = `risip-rekodi-${from ?? 'zote'}.pdf`;
  return new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
});
