// export-project-excel · POST { project_id }
// Builds an .xlsx workbook (SheetJS) with a Summary sheet (Excel SUM formulas) and a
// Receipts Ledger sheet, then returns it as a binary blob for the browser to download.
// Caller must be owner/accountant in the project's company.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MONEY_FMT = '#,##0.00';

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return bad('method not allowed', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return bad('server misconfigured', 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return bad('missing bearer token', 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.slice(7));
  if (userErr || !userData.user) return bad('invalid session', 401);
  const uid = userData.user.id;

  let body: { project_id?: string };
  try { body = await req.json(); } catch { return bad('invalid json'); }
  const project_id = body.project_id;
  if (!project_id) return bad('project_id required');

  const { data: profile } = await admin.from('profiles').select('role, company_id').eq('id', uid).maybeSingle();
  if (!profile) return bad('no profile', 403);
  if (profile.role !== 'owner' && profile.role !== 'accountant') return bad('forbidden', 403);

  const { data: project } = await admin.from('projects').select('id, name, company_id').eq('id', project_id).maybeSingle();
  if (!project) return bad('project not found', 404);
  if (project.company_id !== profile.company_id) return bad('forbidden', 403);

  const { data: receipts, error: rErr } = await admin
    .from('receipts')
    .select('receipt_date, vendor_name, vendor_tin, vendor_vrn, category, verification_code, total_amount, tax_amount')
    .eq('project_id', project_id)
    .eq('status', 'confirmed')
    .order('receipt_date', { ascending: true });
  if (rErr) return bad('query receipts: ' + rErr.message, 500);

  const rows = receipts ?? [];

  // ── Receipts Ledger sheet ──────────────────────────────────────────────────
  const header = ['Date', 'Vendor', 'Vendor TIN', 'Vendor VRN', 'Category', 'Verification Code', 'Net', 'VAT', 'Total'];
  const aoa: unknown[][] = [header];
  for (const r of rows) {
    const total = Number(r.total_amount || 0);
    const vat = Number(r.tax_amount || 0);
    aoa.push([
      r.receipt_date || '', r.vendor_name || '', r.vendor_tin || '', r.vendor_vrn || '',
      r.category || '', r.verification_code || '', total - vat, vat, total,
    ]);
  }
  const ledger = XLSX.utils.aoa_to_sheet(aoa);

  const lastDataRow = rows.length + 1;
  for (let row = 2; row <= lastDataRow; row++) {
    for (const col of ['G', 'H', 'I']) {
      const cell = ledger[col + row];
      if (cell) { cell.t = 'n'; cell.z = MONEY_FMT; }
    }
  }
  ledger['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];

  // ── Summary sheet (SUM formulas referencing the ledger) ────────────────────
  const netRange = `'Receipts Ledger'!G2:G${lastDataRow}`;
  const vatRange = `'Receipts Ledger'!H2:H${lastDataRow}`;
  const totalRange = `'Receipts Ledger'!I2:I${lastDataRow}`;
  const hasData = rows.length > 0;

  const summary = XLSX.utils.aoa_to_sheet([
    ['Risip — Project Expense Summary'],
    [],
    ['Project', project.name],
    ['Confirmed receipts', rows.length],
    [],
    ['Total Net', hasData ? { t: 'n', f: `SUM(${netRange})` } : 0],
    ['Total VAT', hasData ? { t: 'n', f: `SUM(${vatRange})` } : 0],
    ['Total Spent', hasData ? { t: 'n', f: `SUM(${totalRange})` } : 0],
  ]);
  for (const addr of ['B6', 'B7', 'B8']) {
    const cell = summary[addr];
    if (cell) { cell.t = 'n'; cell.z = MONEY_FMT; }
  }
  summary['!cols'] = [{ wch: 20 }, { wch: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');
  XLSX.utils.book_append_sheet(wb, ledger, 'Receipts Ledger');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const safeName = String(project.name).replace(/[^a-z0-9]+/gi, '_').slice(0, 40) || 'project';

  return new Response(out, {
    status: 200,
    headers: {
      ...corsHeaders,
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${safeName}_receipts.xlsx"`,
    },
  });
});
