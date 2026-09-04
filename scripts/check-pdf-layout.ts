// Checks the two PDFs Risip hands to people, without a browser and without a
// live session.
//
// WHY THIS EXISTS. A PDF is the one thing here that nobody sees until a real
// shopkeeper presses a button, and the ways it fails are silent: pdf-lib
// THROWS on a character its font cannot encode, so one emoji in a company name
// loses the whole document; and a page break that adds a sheet without
// switching to it prints the overflow over the header instead of onto the new
// page. Neither shows up in tsc, the boot gate, or the unit tests.
//
// So both documents are actually rendered here, in Node, with every piece of
// text and its position recorded, and the page is then held to four rules:
// nothing overprints anything, nothing lands off the sheet, every sheet
// carries its footer, and every character is one the font can encode.
//
// Run it with: npx vite-node scripts/check-pdf-layout.ts

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { pdfSafe } from '../supabase/functions/_shared/pdfText';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/(?=[A-Za-z]:)/, ''), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── recording every mark made on a page ──────────────────────────────────
type Drawn = { page: number; x: number; y: number; w: number; text: string };
let drawn: Drawn[] = [];
let sheets = new Map<PDFPage, number>();

const realDrawText = PDFPage.prototype.drawText;
PDFPage.prototype.drawText = function (text: string, opts: any) {
  if (!sheets.has(this)) sheets.set(this, sheets.size + 1);
  drawn.push({
    page: sheets.get(this)!, x: opts.x, y: opts.y,
    w: opts.font.widthOfTextAtSize(text, opts.size), text,
  });
  return realDrawText.call(this, text, opts);
};
const reset = () => { drawn = []; sheets = new Map(); };

/** The faults a page can carry that neither a type-check nor a test can see. */
function faultsIn(pages: number, opts: { footer: string; sheetHeight: number }): string[] {
  const faults: string[] = [];

  // Two pieces of text sharing a baseline and overlapping in x are printed on
  // top of each other. This is what a mishandled page break looks like.
  const byLine = new Map<string, Drawn[]>();
  for (const d of drawn) {
    const key = `${d.page}:${Math.round(d.y)}`;
    byLine.set(key, [...(byLine.get(key) ?? []), d]);
  }
  for (const [key, line] of byLine) {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i - 1].x + sorted[i - 1].w > sorted[i].x + 0.01) {
        faults.push(`overprint on ${key}: "${sorted[i - 1].text}" over "${sorted[i].text}"`);
      }
    }
  }

  // A sheet that gets separated from the others still has to say where it came
  // from, and a sheet with nothing on it means rows went somewhere else.
  for (let n = 1; n <= pages; n += 1) {
    const on = drawn.filter((d) => d.page === n);
    if (on.length === 0) faults.push(`sheet ${n} is blank`);
    else if (!on.some((d) => d.text.startsWith(opts.footer))) faults.push(`sheet ${n} has no footer`);
    else if (on.length === 1) faults.push(`sheet ${n} carries nothing but the footer`);
  }

  for (const d of drawn) {
    if (d.y < 20 || d.y > opts.sheetHeight) faults.push(`off the sheet: "${d.text}" at y=${d.y}`);
    if (d.x < 0 || d.x + d.w > 596) faults.push(`past the margin: "${d.text}" ends at x=${(d.x + d.w).toFixed(1)}`);
  }

  return [...new Set(faults)];
}

// What a phone actually sends. Emoji and non-Latin script are the characters
// that make pdf-lib throw; the curly quote and em dash are the ones WhatsApp
// inserts on its own.
const MESSY = 'Mama \u{1F404} Ng’ombe — 交易';

const results: { name: string; detail: string; faults: string[] }[] = [];

// ── 1. the records statement (export-records-pdf) ────────────────────────
{
  const rows = Array.from({ length: 120 }, (_, i) => ({
    kind: ['sale', 'expense', 'stock_purchase', 'customer_payment', 'debt_issued', 'kitu_kipya'][i % 6],
    status: i % 17 === 0 ? 'pending' : i % 23 === 0 ? 'voided' : 'confirmed',
    amount: 500 + i * 137,
    party_name: i % 3 === 0 ? MESSY : null,
    // One genuinely long note, because a shopkeeper writes what happened and
    // a detail column that is allowed to grow runs under the amount.
    description: i % 5 === 0 ? 'vikoi \u{1F455} vya bei ya jumla — mzigo mkubwa'
      : i % 11 === 0 ? 'mzigo wa vikoi na shuka aliouleta dereva wa basi la asubuhi, tumehesabu pamoja na Mama Asha na tumekubaliana bei ya jumla ya leo'
      : 'shuka 2',
    occurred_at: new Date(Date.UTC(2026, 7, 1 + (i % 28), 21, 30)).toISOString(),
  }));

  // Stands in for the Supabase client so the shipped handler can run offline.
  const createClient = () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        gte: () => chain, lt: () => chain,
        maybeSingle: async () => (table === 'profiles'
          ? { data: { role: 'owner', company_id: 'c1' } }
          : { data: { name: MESSY } }),
        then: (res: any) => res({ data: rows, error: null }),
      };
      return chain;
    },
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  });

  let handler: ((req: Request) => Promise<Response>) | null = null;
  (globalThis as any).Deno = {
    serve: (fn: any) => { handler = fn; },
    env: { get: (k: string) => ({ SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } as any)[k] },
  };

  // The handler is TypeScript, so it is loaded through vite-node rather than
  // eval'd: only its two remote import specifiers are rewritten, to the stub
  // above and to the local pdf-lib. Nothing else about the file is touched.
  (globalThis as any).__pdfAuditStub = { createClient };
  const slash = (p: string) => p.split(path.sep).join('/');
  const stubPath = path.join(os.tmpdir(), 'risip-pdf-audit-stub.ts');
  fs.writeFileSync(stubPath, 'export const createClient = (globalThis as any).__pdfAuditStub.createClient;\n');
  const shippedPath = path.join(os.tmpdir(), 'risip-pdf-audit-statement.ts');
  fs.writeFileSync(shippedPath, read('supabase/functions/export-records-pdf/index.ts')
    .replace("'https://esm.sh/@supabase/supabase-js@2.45.0'", `'${slash(stubPath)}'`)
    .replace("'https://esm.sh/pdf-lib@1.17.1'", "'pdf-lib'")
    .replace(/'\.\.\/_shared\/(\w+)\.ts'/g,
      `'${slash(path.join(ROOT, 'supabase/functions/_shared'))}/$1'`));
  await import(shippedPath);

  if (!handler) throw new Error('export-records-pdf did not register a handler');

  for (const [label, body] of [
    ['statement, everything', { lang: 'sw' }],
    ['statement, one month in English', { lang: 'en', from: '2026-08-01', to: '2026-08-31' }],
    ['statement, filtered to one kind', { lang: 'sw', kind: 'sale', status: 'confirmed' }],
  ] as const) {
    reset();
    // An unencodable character throws out of drawText, so the render is caught
    // and reported as a fault rather than taking the whole check down with it.
    let res: Response;
    try {
      res = await handler(new Request('http://x', {
        method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body),
      }));
    } catch (e: any) {
      results.push({ name: label, detail: 'did not render', faults: [e.message] });
      continue;
    }
    if (res.status !== 200) {
      results.push({ name: label, detail: `HTTP ${res.status}`, faults: [`did not render: ${await res.text()}`] });
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    results.push({
      name: label,
      detail: `${pages} sheets, ${bytes.length} bytes, ${drawn.length} pieces of text`,
      faults: faultsIn(pages, { footer: 'Risip  ', sheetHeight: 842 }),
    });
  }

  // Nothing to report is its own page, and it must still be one clean sheet.
  reset();
  rows.length = 0;
  try {
    const empty: Response = await handler(new Request('http://x', {
      method: 'POST', headers: { Authorization: 'Bearer t' }, body: '{}',
    }));
    const emptyBytes = new Uint8Array(await empty.arrayBuffer());
    const emptyPages = (await PDFDocument.load(emptyBytes)).getPageCount();
    results.push({
      name: 'statement, no records at all',
      detail: `${emptyPages} sheets, ${emptyBytes.length} bytes`,
      faults: [
        ...faultsIn(emptyPages, { footer: 'Risip  ', sheetHeight: 842 }),
        ...(emptyPages === 1 ? [] : [`a statement with nothing on it took ${emptyPages} sheets`]),
        ...(drawn.some((d) => d.text.includes('Hakuna rekodi')) ? [] : ['it does not say there are no records']),
      ],
    });
  } catch (e: any) {
    results.push({ name: 'statement, no records at all', detail: 'did not render', faults: [e.message] });
  }
}

// ── 2. the invoice (generate-invoice) ────────────────────────────────────
{
  const src = read('supabase/functions/generate-invoice/index.ts');
  const from = src.indexOf('  const doc = await PDFDocument.create();');
  const to = src.indexOf('  const pdfBytes = await doc.save();');
  if (from < 0 || to < 0) throw new Error('generate-invoice: the drawing block moved; this check needs updating');
  const block = src.slice(from, to);

  const fmtMoney = (n: number) => `TSh ${Math.round(n).toLocaleString('en-US')}`;
  const cats = (n: number) => Array.from({ length: n }, (_, i) =>
    [`Kategoria ${i + 1} \u{1F9FE} 交易`, { count: i + 1, total: 1000 * (i + 1), tax: 180 * (i + 1) }]);

  for (const [label, count] of [['invoice, one sheet', 3], ['invoice, long enough to spill over', 60]] as const) {
    reset();
    const scope = {
      PDFDocument, StandardFonts, rgb, pdfSafe, fmtMoney,
      company: { name: MESSY }, project: { name: 'Mradi \u{1F477} wa Mama' },
      profile: { full_name: 'Asha ✨ Mwakalinga' },
      invoiceId: 'abcdef12-3456-7890-abcd-ef1234567890',
      period_start: '2026-08-01', period_end: '2026-08-31',
      catRows: cats(count), totalAmount: 1_250_000, taxAmount: 225_000,
    };
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(scope),
      `return (async () => { ${block} return { pages: doc.getPageCount(), bytes: (await doc.save()).length }; })();`);
    try {
      const out = await fn(...Object.values(scope));
      results.push({
        name: label,
        detail: `${out.pages} sheets, ${out.bytes} bytes, ${drawn.length} pieces of text`,
        faults: faultsIn(out.pages, { footer: 'Risip ·', sheetHeight: 842 }),
      });
    } catch (e: any) {
      results.push({ name: label, detail: 'did not render', faults: [e.message] });
    }
  }
}

// ── what came of it ──────────────────────────────────────────────────────
let bad = 0;
for (const r of results) {
  if (r.faults.length) {
    bad += 1;
    console.log(`FAIL  ${r.name} (${r.detail})`);
    for (const f of r.faults.slice(0, 6)) console.log(`        ${f}`);
  } else {
    console.log(`ok    ${r.name} (${r.detail})`);
  }
}
console.log(bad === 0
  ? `\n${results.length} documents rendered. Nothing overprints, nothing runs off a sheet, every sheet is footed, every character encodes.`
  : `\n${bad} of ${results.length} documents have faults.`);
process.exit(bad === 0 ? 0 : 1);
