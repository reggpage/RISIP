// The number printed under the stripes on a packet.
//
// A barcode is worth exactly one thing to this product, and it is worth a lot:
// a name that cannot be mistyped. "daftari" and "daftari kubwa" are two rows in
// the catalogue that a person has to keep straight; 6161100310015 is the same
// packet of sugar in every shop, every time, for ever.
//
// What it is NOT worth: a name, a price, or a category. There is no free
// database of Tanzanian goods, and inventing one would put names in the ledger
// that nobody chose. The scan gives the key; the shopkeeper gives the meaning.
//
// The checksum is the whole reason this file exists. Every retail barcode
// carries one, so a mistyped or half-read number can be REFUSED rather than
// saved against the wrong product — and a stray number in a sentence
// ("nimeuza 12345678") can be told apart from a real code without asking.

export type BarcodeKind = 'ean13' | 'ean8' | 'upca' | 'itf14' | 'other';

export type Barcode = {
  /** Digits only, as printed. */
  code: string;
  kind: BarcodeKind;
  /** True when the printed check digit agrees with the rest of the number. */
  verified: boolean;
};

const digitsOnly = (value: string | null | undefined) => String(value ?? '').replace(/[^0-9]/g, '');

/**
 * The check digit every retail barcode ends with.
 *
 * Weights run 3,1,3,1… from the right-hand data digit, which is the same rule
 * for EAN-8, UPC-A, EAN-13 and ITF-14 — the four things a shop will actually
 * scan.
 */
export function checkDigit(dataDigits: string): number {
  let sum = 0;
  for (let at = 0; at < dataDigits.length; at += 1) {
    const digit = Number(dataDigits[dataDigits.length - 1 - at]);
    sum += at % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

function kindOf(code: string): BarcodeKind {
  switch (code.length) {
    case 8: return 'ean8';
    case 12: return 'upca';
    case 13: return 'ean13';
    case 14: return 'itf14';
    default: return 'other';
  }
}

/**
 * Reads a scanned or typed number, or null when it cannot be one.
 *
 * A code of a standard length must pass its checksum: a scanner that half-read
 * a packet produces a number that looks perfectly plausible and belongs to a
 * different product. Shop-printed codes of other lengths are accepted
 * unverified, because there is nothing to check them against.
 */
export function readBarcode(value: string | null | undefined): Barcode | null {
  const code = digitsOnly(value);
  if (code.length < 6 || code.length > 18) return null;
  const kind = kindOf(code);
  if (kind === 'other') return { code, kind, verified: false };
  const verified = checkDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
  return verified ? { code, kind, verified } : null;
}

/** A message that is nothing but a barcode, or names one. */
const SAYS_BARCODE = /\b(?:bar\s*code|barcode|kodi ya bidhaa|namba ya bidhaa|scan)\b/i;

/**
 * Pulls a barcode out of a WhatsApp message, or returns null.
 *
 * Deliberately narrow. A bare number is only read as a barcode when it passes
 * the checksum, because "nimeuza 12345678" is a sale and misreading it as a
 * product lookup would swallow the sale. Anything introduced by the word
 * itself — "barcode 12345678" — is taken at face value.
 */
export function parseBarcodeMessage(text: string | null | undefined): Barcode | null {
  const said = String(text ?? '').trim();
  if (!said || said.length > 120) return null;
  const named = SAYS_BARCODE.test(said);
  const numbers = said.match(/[0-9][0-9\s-]{5,25}[0-9]/g) ?? [];
  for (const raw of numbers) {
    const found = readBarcode(raw);
    if (!found) continue;
    // A bare number in a sentence has to prove itself with the checksum.
    if (!named && !found.verified) continue;
    if (!named && !/^[0-9\s-]+$/.test(said)) continue;
    return found;
  }
  return null;
}

/** How the number is shown back: grouped, so it can be read against the packet. */
export function formatBarcode(code: string): string {
  const digits = digitsOnly(code);
  if (digits.length === 13) return `${digits.slice(0, 1)} ${digits.slice(1, 7)} ${digits.slice(7, 13)}`;
  if (digits.length === 12) return `${digits.slice(0, 1)} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits.slice(11)}`;
  if (digits.length === 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return digits;
}

/**
 * Asking for the scanner.
 *
 * "scan" on its own, or any sentence that says so. Kept out of the login
 * patterns even though both end at the web app, because a shopkeeper who typed
 * "scan" wants a camera, not a dashboard, and landing them on the wrong page is
 * a tap they have to work out for themselves.
 */
export function isScanRequest(text: string | null | undefined): boolean {
  const said = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!said || said.length > 80) return false;
  if (/^(?:scan|skani|scanner)$/.test(said)) return true;
  return /\b(?:scan|skani|piga\s*picha ya bar\s*code)\b/.test(said)
    && /\b(?:bar\s*code|barcode|bidhaa|product|products|mzigo)\b/.test(said);
}

/**
 * Asking for the till.
 *
 * Scanning to SELL is a different job from scanning to register, and a
 * shopkeeper with a customer in front of them should not have to find their way
 * from one to the other.
 */
export function isSellScanRequest(text: string | null | undefined): boolean {
  const said = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!said || said.length > 80) return false;
  if (/^(?:pos|till|kauntа|kaunta)$/.test(said)) return true;
  return /\b(?:uza|kuuza|nauza|sell|selling)\b/.test(said)
    && /\b(?:scan|scanning|skani|bar\s*code|barcode|pos)\b/.test(said);
}
