// Asking TRA what the receipt actually says.
//
// WHY THIS EXISTS, measured on a real receipt the owner photographed:
//
//   field           TRA              what the model read
//   vendor          NEW MUAMBAO      NEW MLAMBAO
//   TIN             138955834        138095838
//   receipt no      214576           214/76
//   TOTAL           58,000           50,000
//   verify code     18935E214576     1097A5E214A5
//
// Five of seven fields wrong on one thermal print. Two of them matter a great
// deal: the total was 8,000 short — a 14% understatement of an expense — and the
// verification code is the GLOBAL duplicate key (see CLAUDE.md, migration 0041).
// A misread code means the same receipt can be claimed twice and nothing stops
// it, which is the exact fraud the unique index exists to prevent.
//
// THE PROTOCOL, read off the portal itself rather than guessed:
//   1. GET https://verify.tra.go.tz/<CODE>          — starts a session for that code
//   2. GET https://verify.tra.go.tz/Verify/Verified?Secret=HH:MM:SS
//                                                  — same cookie, returns the receipt
// The time is a second factor, printed on the receipt. The model already reads
// the time correctly; it is the code it fumbles, which is why the QR matters.
//
// THIS IS NOT AN OFFICIAL API. It is the public verification page, used for what
// it is for: checking a receipt you are holding. It can change without notice,
// so every failure here is soft — an unverified receipt keeps the model's
// reading and is flagged, never dropped and never silently trusted.

export type TraReceipt = {
  vendorName: string | null;
  vendorTin: string | null;
  vendorVrn: string | null;
  receiptNumber: string | null;
  /** ISO date, converted from the portal's DD/MM/YYYY. */
  receiptDate: string | null;
  receiptTime: string | null;
  totalInclTax: number | null;
  totalExclTax: number | null;
  totalTax: number | null;
  verificationCode: string | null;
};

export type TraLookup =
  | { ok: true; receipt: TraReceipt }
  | { ok: false; reason: 'not_found' | 'unreachable' | 'unreadable' };

const BASE = 'https://verify.tra.go.tz';

/** Markup to a flat "LABEL | VALUE | LABEL | VALUE" stream. */
function flatten(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' | ');
}

/**
 * The value printed after a label.
 *
 * The portal renders `<b>TIN:</b> <span>138955834</span>`, so after flattening
 * the value is simply the next cell. Reading it positionally rather than by CSS
 * selector survives the layout being reshuffled, which for a page nobody
 * promised us is the safer assumption.
 */
function labelled(stream: string, label: string): string | null {
  const cells = stream.split(' | ');
  const wanted = label.toLowerCase().replace(/[:\s]+$/, '');
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].toLowerCase().replace(/[:\s]+$/, '') !== wanted) continue;
    for (let j = i + 1; j < cells.length && j <= i + 3; j++) {
      const value = cells[j].trim();
      // Skip the empty cells the markup leaves between a label and its span.
      if (value && !/^[|:]*$/.test(value)) return value;
    }
  }
  return null;
}

function money(value: string | null): number | null {
  if (!value) return null;
  const amount = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

/** DD/MM/YYYY as the portal prints it, to the ISO date the database stores. */
function isoDate(value: string | null): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseTraReceipt(html: string): TraReceipt | null {
  const stream = flatten(html);
  // Without this marker the page is the entry form or an error, not a receipt.
  if (!/START OF LEGAL RECEIPT/i.test(stream)) return null;

  const code = labelled(stream, 'RECEIPT VERIFICATION CODE')
    ?? /RECEIPT VERIFICATION CODE \| ([A-Z0-9]{6,20})/i.exec(stream)?.[1]
    ?? null;

  // The vendor name is the cell right after the marker; it carries no label.
  const vendor = (() => {
    const cells = stream.split(' | ');
    const at = cells.findIndex((cell) => /START OF LEGAL RECEIPT/i.test(cell));
    for (let i = at + 1; i < cells.length && i <= at + 3; i++) {
      const value = cells[i].trim();
      if (value && !/^P\.?O\.?\s*BOX/i.test(value)) return value;
    }
    return null;
  })();

  const receipt: TraReceipt = {
    vendorName: vendor,
    vendorTin: labelled(stream, 'TIN'),
    vendorVrn: labelled(stream, 'VRN'),
    receiptNumber: labelled(stream, 'RECEIPT NO'),
    receiptDate: isoDate(labelled(stream, 'RECEIPT DATE')),
    receiptTime: labelled(stream, 'RECEIPT TIME'),
    totalInclTax: money(labelled(stream, 'TOTAL INCL OF TAX')),
    totalExclTax: money(labelled(stream, 'TOTAL EXCL OF TAX')),
    totalTax: money(labelled(stream, 'TOTAL TAX')),
    verificationCode: code ? code.toUpperCase() : null,
  };

  // A page with neither a total nor a code told us nothing worth trusting.
  if (receipt.totalInclTax === null && receipt.verificationCode === null) return null;
  return receipt;
}

/** Everything a Set-Cookie header offers, reduced to what the next request needs. */
function cookieHeader(response: Response): string {
  const raw = response.headers.get('set-cookie') ?? '';
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((cookie) => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

/**
 * Looks a receipt up. Never throws: a portal that is down, slow or rearranged
 * must not stop a receipt being recorded.
 */
export async function fetchTraReceipt(
  verificationCode: string,
  receiptTime: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<TraLookup> {
  const code = String(verificationCode ?? '').trim().toUpperCase();
  const time = String(receiptTime ?? '').trim();
  if (!/^[A-Z0-9]{6,20}$/.test(code) || !/^\d{1,2}:\d{2}:\d{2}$/.test(time)) {
    return { ok: false, reason: 'unreadable' };
  }
  const [hh, mm, ss] = time.split(':');
  const secret = `${hh.padStart(2, '0')}:${mm}:${ss}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const first = await fetchImpl(`${BASE}/${encodeURIComponent(code)}`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'text/html' },
    });
    if (!first.ok) return { ok: false, reason: 'unreachable' };
    const cookie = cookieHeader(first);
    // No session means the portal did not accept the code as one it knows.
    if (!cookie) return { ok: false, reason: 'not_found' };

    const second = await fetchImpl(
      `${BASE}/Verify/Verified?Secret=${encodeURIComponent(secret)}`,
      { signal: controller.signal, redirect: 'follow', headers: { accept: 'text/html', cookie } },
    );
    if (!second.ok) return { ok: false, reason: 'unreachable' };

    const receipt = parseTraReceipt(await second.text());
    if (!receipt) return { ok: false, reason: 'not_found' };
    // A portal that answered about a different code is not an answer about this one.
    if (receipt.verificationCode && receipt.verificationCode !== code) {
      return { ok: false, reason: 'not_found' };
    }
    return { ok: true, receipt };
  } catch {
    return { ok: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

export type FieldDifference = { field: string; extracted: unknown; official: unknown };

/**
 * What the model got wrong, so the correction can be shown rather than applied
 * behind the trader's back. Money is compared to the cent; text case-folded,
 * since "NEW MUAMBAO" and "New Muambao" are the same vendor.
 */
export function compareWithTra(
  extracted: Partial<TraReceipt>,
  official: TraReceipt,
): FieldDifference[] {
  const differences: FieldDifference[] = [];
  const text = (a: unknown, b: unknown) =>
    String(a ?? '').trim().toLowerCase() !== String(b ?? '').trim().toLowerCase();

  const fields: Array<[keyof TraReceipt, (a: unknown, b: unknown) => boolean]> = [
    ['vendorName', text],
    ['vendorTin', (a, b) => String(a ?? '').replace(/\D/g, '') !== String(b ?? '').replace(/\D/g, '')],
    ['receiptNumber', text],
    ['totalInclTax', (a, b) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) > 0.01],
    ['verificationCode', text],
    ['receiptDate', text],
  ];

  for (const [field, differs] of fields) {
    const mine = extracted[field];
    const theirs = official[field];
    // Nothing to disagree about when either side is silent.
    if (mine === null || mine === undefined || theirs === null || theirs === undefined) continue;
    if (differs(mine, theirs)) differences.push({ field, extracted: mine, official: theirs });
  }
  return differences;
}
