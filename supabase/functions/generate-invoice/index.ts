// generate-invoice · POST { project_id, period_start, period_end }
// Aggregates confirmed receipts in the window, renders a category-grouped PDF with
// pdf-lib, uploads to the private `invoices` bucket, and inserts invoice + invoice_receipts
// atomically. Caller must be owner or accountant in the project's company.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { pdfSafe } from '../_shared/pdfText.ts';
import { json, preflight } from '../_shared/cors.ts';

function bad(msg, status = 400) {
  return json({ error: msg }, { status });
}

function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  return 'TSh ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function safeTax(receipt) {
  const tax = Number(receipt.tax_amount || 0);
  const total = Number(receipt.total_amount || 0);
  if (!Number.isFinite(tax) || tax < 0) return 0;
  if (total > 0 && tax > total) return 0;
  return tax;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return bad('method not allowed', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) return bad('server misconfigured', 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return bad('missing bearer token', 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the caller's JWT using the service-role client (most reliable in edge functions).
  const token = authHeader.slice(7);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return bad('invalid session', 401);
  const uid = userData.user.id;

  let body;
  try { body = await req.json(); } catch { return bad('invalid json'); }
  const { project_id, period_start, period_end } = body;
  if (!project_id || !period_start || !period_end) return bad('project_id, period_start, period_end required');

  // Verify caller is owner/accountant in the project's company.
  const { data: profile } = await admin.from('profiles').select('role, company_id, full_name').eq('id', uid).maybeSingle();
  if (!profile) return bad('no profile', 403);
  if (profile.role !== 'owner' && profile.role !== 'accountant') return bad('forbidden', 403);

  const { data: project } = await admin.from('projects').select('id, name, company_id').eq('id', project_id).maybeSingle();
  if (!project) return bad('project not found', 404);
  if (project.company_id !== profile.company_id) return bad('forbidden', 403);

  const { data: company } = await admin.from('companies').select('name, currency').eq('id', profile.company_id).maybeSingle();

  const { data: receipts, error: rErr } = await admin
    .from('receipts')
    .select('id, vendor_name, category, total_amount, tax_amount, receipt_date, receipt_number')
    .eq('project_id', project_id)
    .eq('status', 'confirmed')
    .gte('receipt_date', period_start)
    .lte('receipt_date', period_end)
    .order('receipt_date', { ascending: true });
  if (rErr) return bad(`query receipts: ${rErr.message}`, 500);
  if (!receipts || receipts.length === 0) return bad('no confirmed receipts in this period', 400);

  // Aggregate.
  const totalAmount = receipts.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const taxAmount = receipts.reduce((s, r) => s + safeTax(r), 0);
  const byCat = new Map();
  for (const r of receipts) {
    const key = r.category || 'Other';
    const cur = byCat.get(key) || { count: 0, total: 0, tax: 0 };
    cur.count += 1;
    cur.total += Number(r.total_amount || 0);
    cur.tax += safeTax(r);
    byCat.set(key, cur);
  }
  const catRows = Array.from(byCat.entries()).sort((a, b) => b[1].total - a[1].total);

  // Insert invoice first (so we have an id for the PDF path).
  const { data: invoice, error: iErr } = await admin
    .from('invoices')
    .insert({
      project_id,
      company_id: project.company_id,   // needed by the public invoice page + Excel export
      period_start,
      period_end,
      total_amount: totalAmount,
      tax_amount: taxAmount,
      status: 'draft',
      generated_by: uid,
    })
    .select('id')
    .single();
  if (iErr) return bad(`insert invoice: ${iErr.message}`, 500);
  const invoiceId = invoice.id;
  // Human-readable number so the editor/list/public page never shows a blank.
  const invoiceNumber = 'INV-' + invoiceId.slice(0, 8).toUpperCase();

  const joinRows = receipts.map((r) => ({ invoice_id: invoiceId, receipt_id: r.id }));
  const { error: jErr } = await admin.from('invoice_receipts').insert(joinRows);
  if (jErr) return bad(`insert invoice_receipts: ${jErr.message}`, 500);

  // Render PDF.
  const doc = await PDFDocument.create();
  let page = doc.addPage([595, 842]); // A4 portrait
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;

  // Company names, project names and categories are typed by people. One
  // emoji or one non-Latin character in any of them makes drawText throw, and
  // the whole invoice is lost rather than one character.
  const draw = (text, opts = {}) => {
    page.drawText(pdfSafe(String(text)), {
      x: opts.x || 40,
      y: opts.y ?? y,
      size: opts.size || 10,
      font: opts.bold ? bold : font,
      color: opts.color || rgb(0.06, 0.09, 0.16),
    });
  };

  draw('Risip', { x: 40, y, size: 22, bold: true, color: rgb(0.49, 0.23, 0.93) });
  draw(company?.name || '', { x: 40, y: y - 18, size: 12, bold: true });
  y -= 40;
  draw('ANKARA', { x: 40, y, size: 20, bold: true });
  draw(`#${invoiceId.slice(0, 8).toUpperCase()}`, { x: 40, y: y - 16, size: 10, color: rgb(0.29, 0.34, 0.42) });
  y -= 44;

  draw('Mradi:', { x: 40, y, bold: true });
  draw(project.name, { x: 100, y });
  y -= 14;
  draw('Kipindi:', { x: 40, y, bold: true });
  draw(`${period_start} — ${period_end}`, { x: 100, y });
  y -= 14;
  draw('Imetengenezwa na:', { x: 40, y, bold: true });
  draw(profile.full_name, { x: 150, y });
  y -= 28;

  // Category table.
  draw('Kategoria', { x: 40, y, bold: true });
  draw('Idadi', { x: 260, y, bold: true });
  draw('Jumla', { x: 340, y, bold: true });
  draw('Kodi', { x: 460, y, bold: true });
  y -= 6;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.85, 0.9, 0.94) });
  y -= 12;

  for (const [cat, v] of catRows) {
    // The new sheet has to become the one being drawn on. Adding a page and
    // carrying on with the old one puts the overflow rows off the bottom of
    // the first sheet and leaves the second one blank.
    if (y < 80) { page = doc.addPage([595, 842]); y = 800; }
    draw(cat, { x: 40, y });
    draw(String(v.count), { x: 260, y });
    draw(fmtMoney(v.total), { x: 340, y });
    draw(fmtMoney(v.tax), { x: 460, y });
    y -= 14;
  }

  y -= 8;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.85, 0.9, 0.94) });
  y -= 14;
  draw('JUMLA', { x: 40, y, bold: true, size: 12 });
  draw(fmtMoney(totalAmount), { x: 340, y, bold: true, size: 12 });
  draw(fmtMoney(taxAmount), { x: 460, y, bold: true, size: 12 });

  // Footer.
  for (const sheet of doc.getPages()) {
    sheet.drawText(pdfSafe('Risip · scan risiti, tengeneza ankara.'), {
      x: 40, y: 30, size: 8, font, color: rgb(0.58, 0.64, 0.72),
    });
  }

  const pdfBytes = await doc.save();
  const pdfPath = `${project_id}/${invoiceId}.pdf`;
  const { error: upErr } = await admin.storage
    .from('invoices')
    .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return bad(`upload pdf: ${upErr.message}`, 500);

  const { error: uErr } = await admin.from('invoices')
    .update({ pdf_url: pdfPath, invoice_number: invoiceNumber })
    .eq('id', invoiceId);
  if (uErr) return bad(`patch invoice: ${uErr.message}`, 500);

  return json({
    invoice_id: invoiceId,
    pdf_path: pdfPath,
    total_amount: totalAmount,
    tax_amount: taxAmount,
    receipt_count: receipts.length,
  }, { status: 201 });
});
