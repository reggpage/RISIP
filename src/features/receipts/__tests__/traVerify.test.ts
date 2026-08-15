import { describe, expect, it, vi } from 'vitest';
import {
  compareWithTra,
  cookieHeader,
  fetchTraReceipt,
  parseTraReceipt,
} from '../../../../supabase/functions/_shared/traVerify';

/**
 * The portal's own markup, captured from a live lookup of a real receipt the
 * owner photographed. Structure is verbatim: `<b>LABEL: </b><span>VALUE</span>`,
 * wrapped in the bootstrap panels the page uses.
 */
const TRA_HTML = `
<div class="right_col" role="main"><div class="container body-content">
  <div class="x_panel"><div class="x_title">
    <h4 style="text-align:center">*** START OF LEGAL RECEIPT ***</h4>
    <center><img src="/resources/images/eti/logo.png" /></center>
  </div>
  <div class="x_content"><section class="content invoice" id="inv">
    <div class="row"><div class="col-xs-12 invoice-header"><center>
      <h4><b>NEW MUAMBAO</b></h4>
    </center></div></div>
    <div class="row invoice-info col-xs-12"><center><div class="col-xs-12 invoice-col">
      <h4><b>P.O BOX <span>1249</span></b></h4><br />
      <b>MOBILE:</b> <span>+255 759 206 516</span><br />
      <b>TIN:</b> <span>138955834</span><br />
      <b>VRN:</b> <span>40033547C</span><br />
      <b>SERIAL NO:</b> <span>03TZ843054037</span><br />
      <b>UIN: </b> <span>01133M-12427894513895583403TZ843054037</span><br />
      <b>TAX OFFICE: </b> <span>DODOMA</span>
    </div></center></div>
    <div class="row"><div class="col-xs-12 invoice-header">
      <hr style="border-top: dotted 1px;" />
      <b>CUSTOMER NAME: </b> <span>n/a</span><br />
      <b>CUSTOMER ID TYPE: </b> <span><span>NIL</span></span><br />
      <b>CUSTOMER ID: </b> <span>n/a</span><br />
      <b>CUSTOMER MOBILE: </b> <span>n/a</span>
    </div></div>
    <div class="row"><div class="col-xs-12 invoice-header">
      <hr style="border-top: dotted 1px;" />
      <b>RECEIPT NO: </b> <span>214576</span><br />
      <b>Z NUMBER: </b> <span>901</span><br />
      <b>RECEIPT DATE: </b> <span>15/08/2026</span><br />
      <b>RECEIPT TIME: </b> <span>14:52:56</span>
    </div></div>
    <div class="row"><div class="col-xs-12"><h5>Purchased Items</h5>
      <table class="table"><thead><tr><th>Description</th><th>Qty</th><th>Amount</th><th>Type</th></tr></thead>
      <tbody><tr><td>LUNCH</td><td>1</td><td>58,000.00</td><td>A</td></tr></tbody></table>
    </div></div>
    <div class="row"><div class="col-xs-12 invoice-header">
      <b>TOTAL EXCL OF TAX:</b> <span>49,152.54</span><br />
      <b>TAX RATE A (18%)</b> <span>8,847.46</span><br />
      <b>TOTAL TAX:</b> <span>8,847.46</span><br />
      <b>TOTAL INCL OF TAX:</b> <span>58,000.00</span>
    </div></div>
    <div class="row"><div class="col-xs-12 invoice-header"><center>
      <h4>RECEIPT VERIFICATION CODE</h4>
      <h4><b>18935E214576</b></h4>
    </center></div></div>
    <h4 style="text-align:center">*** END OF LEGAL RECEIPT ***</h4>
  </section></div></div>
</div></div>`;

/** The entry form, which is what the portal returns for a code it does not know. */
const TRA_FORM = `
<div class="right_col"><h3>Receipt Verification</h3>
  <p>Enter Receipt Verification Code</p>
  <select id="HH"><option>HH</option></select>
  <button id="submitBtn" onclick="validateSecret()">Submit</button>
</div>`;

describe('reading what TRA actually says', () => {
  it('pulls every field off the real page', () => {
    expect(parseTraReceipt(TRA_HTML)).toEqual({
      vendorName: 'NEW MUAMBAO',
      vendorTin: '138955834',
      vendorVrn: '40033547C',
      receiptNumber: '214576',
      receiptDate: '2026-08-15',
      receiptTime: '14:52:56',
      totalInclTax: 58000,
      totalExclTax: 49152.54,
      totalTax: 8847.46,
      verificationCode: '18935E214576',
    });
  });

  it('takes the tax-inclusive total, not the exclusive one', () => {
    // 49,152.54 is what the shop keeps; 58,000 is what left the till. Booking
    // the wrong one understates the expense by the VAT.
    expect(parseTraReceipt(TRA_HTML)?.totalInclTax).toBe(58000);
  });

  it('converts the portal date to the one the database stores', () => {
    expect(parseTraReceipt(TRA_HTML)?.receiptDate).toBe('2026-08-15');
  });

  it('returns nothing for the entry form', () => {
    expect(parseTraReceipt(TRA_FORM)).toBeNull();
    expect(parseTraReceipt('')).toBeNull();
    expect(parseTraReceipt('<html><body>Service unavailable</body></html>')).toBeNull();
  });
});

describe('the two-step lookup', () => {
  const page = (body: string, cookie?: string) => new Response(body, {
    status: 200,
    headers: cookie ? { 'set-cookie': cookie } : {},
  });

  it('starts a session on the code, then asks with the time', async () => {
    const calls: string[] = [];
    const fake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push(href);
      if (href.endsWith('/18935E214576')) return page(TRA_FORM);
      return page(TRA_HTML);
    });

    const result = await fetchTraReceipt('18935E214576', '14:52:56', fake as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(result.ok && result.receipt.totalInclTax).toBe(58000);
    expect(calls[0]).toBe('https://verify.tra.go.tz/18935E214576');
    expect(calls[1]).toBe('https://verify.tra.go.tz/Verify/Verified?Secret=14%3A52%3A56');
  });

  it('pads a single-digit hour, because the portal expects HH', async () => {
    const calls: string[] = [];
    const fake = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return calls.length === 1 ? page(TRA_FORM) : page(TRA_HTML);
    });
    await fetchTraReceipt('18935E214576', '9:05:03', fake as unknown as typeof fetch);
    expect(calls[1]).toContain('09%3A05%3A03');
  });

  it('says not_found when the portal returns the form instead of a receipt', async () => {
    const fake = vi.fn(async () => page(TRA_FORM));
    expect(await fetchTraReceipt('1097A5E214A5', '14:52:56', fake as unknown as typeof fetch))
      .toEqual({ ok: false, reason: 'not_found' });
  });

  it('refuses to accept an answer about a different code', async () => {
    // A portal that hands back somebody else's receipt has not answered ours.
    let first = true;
    const fake = vi.fn(async () => { const r = first ? page(TRA_FORM) : page(TRA_HTML); first = false; return r; });
    // Transient, not a verdict: the session is held against the caller, so two
    // lookups at once can cross and hand back each other's receipt.
    expect(await fetchTraReceipt('AAAAAA111111', '14:52:56', fake as unknown as typeof fetch))
      .toEqual({ ok: false, reason: 'unreachable' });
  });

  it('never throws when the portal is down or slow', async () => {
    const dead = vi.fn(async () => { throw new Error('ECONNRESET'); });
    expect(await fetchTraReceipt('18935E214576', '14:52:56', dead as unknown as typeof fetch))
      .toEqual({ ok: false, reason: 'unreachable' });

    const error = vi.fn(async () => new Response('nope', { status: 503 }));
    expect(await fetchTraReceipt('18935E214576', '14:52:56', error as unknown as typeof fetch))
      .toEqual({ ok: false, reason: 'unreachable' });
  });

  it('does not call the portal at all for input that cannot be a lookup', async () => {
    const fake = vi.fn();
    expect(await fetchTraReceipt('', '14:52:56', fake as unknown as typeof fetch))
      .toEqual({ ok: false, reason: 'unreadable' });
    expect(await fetchTraReceipt('18935E214576', '', fake as unknown as typeof fetch))
      .toEqual({ ok: false, reason: 'unreadable' });
    expect(fake).not.toHaveBeenCalled();
  });
});

describe('what the model got wrong', () => {
  const official = parseTraReceipt(TRA_HTML)!;

  it('names every field that disagrees, on the real misreading', () => {
    // Exactly what was stored for this receipt before verification existed.
    const differences = compareWithTra({
      vendorName: 'NEW MLAMBAO',
      vendorTin: '138095838',
      receiptNumber: '214/76',
      totalInclTax: 50000,
      verificationCode: '1097A5E214A5',
      receiptDate: '2026-08-15',
    }, official);

    expect(differences.map((d) => d.field).sort()).toEqual(
      ['receiptNumber', 'totalInclTax', 'vendorName', 'vendorTin', 'verificationCode'],
    );
    expect(differences.find((d) => d.field === 'totalInclTax'))
      .toEqual({ field: 'totalInclTax', extracted: 50000, official: 58000 });
  });

  it('says nothing when the reading was right', () => {
    expect(compareWithTra({
      vendorName: 'NEW MUAMBAO', vendorTin: '138955834', receiptNumber: '214576',
      totalInclTax: 58000, verificationCode: '18935E214576', receiptDate: '2026-08-15',
    }, official)).toEqual([]);
  });

  it('does not quibble over case or spacing in a name', () => {
    expect(compareWithTra({ vendorName: ' new muambao ' }, official)).toEqual([]);
  });

  it('ignores a field the model did not read at all', () => {
    // Silence is not disagreement; there is nothing to correct.
    expect(compareWithTra({ vendorName: null, totalInclTax: undefined }, official)).toEqual([]);
  });

  it('treats a TIN with punctuation as the same TIN', () => {
    expect(compareWithTra({ vendorTin: '138-955-834' }, official)).toEqual([]);
  });
});

describe('the session cookie, read the way runtimes offer it', () => {
  it('reads separate Set-Cookie headers rather than a joined string', () => {
    // headers.get() joins multiple cookies with a comma, and an Expires date
    // contains commas too, so splitting that string is guesswork. This was
    // returning nothing on the edge runtime, and an empty cookie was then
    // reported as TRA not knowing the code — a completely different claim.
    const headers = new Headers();
    headers.append('set-cookie', 'SESSION=abc123; Path=/; Expires=Mon, 01 Sep 2026 10:00:00 GMT; HttpOnly');
    headers.append('set-cookie', 'XSRF=zzz; Path=/');
    const cookie = cookieHeader({ headers });
    expect(cookie).toContain('SESSION=abc123');
    expect(cookie).toContain('XSRF=zzz');
    expect(cookie).not.toContain('Expires');
    expect(cookie).not.toContain('HttpOnly');
  });

  it('returns nothing when the response set no cookie', () => {
    expect(cookieHeader({ headers: new Headers() })).toBe('');
  });
});

describe('the portal keeps no session in a cookie', () => {
  it('looks the receipt up even though nothing set a cookie', async () => {
    // Verified against the live portal: the code page returns 200 with no
    // Set-Cookie, and the second request still answers from an empty jar.
    // Requiring a cookie was rejecting every lookup.
    let first = true;
    const fake = async () => {
      const response = new Response(first ? TRA_FORM : TRA_HTML, { status: 200 });
      first = false;
      return response;
    };
    const result = await fetchTraReceipt('18935E214576', '14:52:56', fake as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(result.ok && result.receipt.totalInclTax).toBe(58000);
  });

  it('still reports not_found when the portal answers with its form', async () => {
    const fake = async () => new Response(TRA_FORM, { status: 200 });
    expect(await fetchTraReceipt('G2KTYC85636', '15:22:19', fake as unknown as typeof fetch))
      .toEqual({ ok: false, reason: 'not_found' });
  });

  it('passes a cookie along if one ever appears', async () => {
    const seen: RequestInit[] = [];
    let first = true;
    const fake = async (_url: string | URL, init?: RequestInit) => {
      seen.push(init ?? {});
      const headers = new Headers();
      if (first) { headers.append('set-cookie', 'S=1; Path=/'); first = false; return new Response(TRA_FORM, { headers }); }
      return new Response(TRA_HTML);
    };
    await fetchTraReceipt('18935E214576', '14:52:56', fake as unknown as typeof fetch);
    expect((seen[1].headers as Record<string, string>).cookie).toBe('S=1');
  });

  it('sends a user agent and a referer, since the portal is browser-facing', async () => {
    const seen: RequestInit[] = [];
    let first = true;
    const fake = async (_url: string | URL, init?: RequestInit) => {
      seen.push(init ?? {});
      const body = first ? TRA_FORM : TRA_HTML; first = false;
      return new Response(body, { status: 200 });
    };
    await fetchTraReceipt('18935E214576', '14:52:56', fake as unknown as typeof fetch);
    expect((seen[0].headers as Record<string, string>)['user-agent']).toMatch(/Mozilla/);
    expect((seen[1].headers as Record<string, string>).referer).toContain('18935E214576');
  });
});
