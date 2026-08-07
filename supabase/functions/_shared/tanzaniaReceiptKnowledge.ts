export const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent',
  'Communication', 'Consulting', 'Other',
] as const;

type ReceiptLike = Record<string, unknown>;

type KnownMerchant = {
  canonical: string;
  category: string;
  aliases: string[];
  tins?: string[];
};

const FUEL_KEYWORDS = [
  'fuel', 'petrol', 'diesel', 'kerosene', 'kerosine', 'lubricant', 'lubricants',
  'engine oil', 'service station', 'filling station', 'client ticket', 'station',
  'pms', 'ago', 'ik', 'jet a-1',
];

const KNOWN_MERCHANTS: KnownMerchant[] = [
  {
    canonical: 'TotalEnergies',
    category: 'Fuel',
    aliases: [
      'totalenergies', 'total energies', 'total energy', 'total tanzania', 'total',
      'tokienergies', 'tokienergy', 'tokroenergies', 'tokrienergies', 'toki energies',
      'totalenergies dodoma service station', 'dodoma service station',
    ],
  },
  { canonical: 'Puma Energy', category: 'Fuel', aliases: ['puma energy', 'puma'] },
  // Station names are the merchant names printed on receipts, not merely a
  // brand. TIN 100260085 belongs to the Hazina station shown on its receipts.
  { canonical: 'Puma Hazina Service Station', category: 'Fuel', aliases: ['puma hazina service station', 'puma hazina', 'hazina service station'], tins: ['100260085'] },
  // TIN is printed clearly on TRA receipts and is more reliable than a fuzzy
  // logo/name read. This prevents Erima receipts being normalised to Puma.
  { canonical: 'Erima Energy', category: 'Fuel', aliases: ['erima energy', 'erima'], tins: ['140933074'] },
  { canonical: 'Oryx Energies', category: 'Fuel', aliases: ['oryx energies', 'oryx energy', 'oryx'] },
  { canonical: 'Oilcom', category: 'Fuel', aliases: ['oilcom', 'oil com', 'oilcom t ltd'] },
  { canonical: 'Lake Oil', category: 'Fuel', aliases: ['lake oil', 'lakeoil'] },
  { canonical: 'Augusta Energy', category: 'Fuel', aliases: ['augusta energy', 'augusta'] },
  { canonical: 'GBP Tanzania', category: 'Fuel', aliases: ['gbp', 'gbp t ltd', 'gbp tanzania'] },
  { canonical: 'Camel Oil', category: 'Fuel', aliases: ['camel oil', 'cameloil'] },
  { canonical: 'MOIL', category: 'Fuel', aliases: ['moil', 'mansoor industries', 'moil tanzania'] },
  { canonical: 'GAPCO', category: 'Fuel', aliases: ['gapco', 'gapco t ltd'] },
  { canonical: 'Vivo Energy', category: 'Fuel', aliases: ['vivo energy', 'shell', 'vivo energy tanzania'] },
  { canonical: 'Hass Petroleum', category: 'Fuel', aliases: ['hass petroleum', 'hass'] },
  { canonical: 'Star Oil', category: 'Fuel', aliases: ['star oil', 'staroil'] },
  { canonical: 'Mogas', category: 'Fuel', aliases: ['mogas', 'mogas international'] },
  { canonical: 'Acer Petroleum', category: 'Fuel', aliases: ['acer petroleum', 'acer'] },
  { canonical: 'Mount Meru Petroleum', category: 'Fuel', aliases: ['mount meru', 'mt meru', 'mount meru petroleum'] },
  { canonical: 'Petro Africa', category: 'Fuel', aliases: ['petro africa', 'petroafrica'] },
  { canonical: 'Petrofuel', category: 'Fuel', aliases: ['petrofuel', 'petro fuel', 'petrol fuel'] },
  { canonical: 'Engen', category: 'Fuel', aliases: ['engen'] },
  { canonical: 'Sahara Energy', category: 'Fuel', aliases: ['sahara energy', 'sahara'] },
  { canonical: 'Dalbit Petroleum', category: 'Fuel', aliases: ['dalbit petroleum', 'dalbit'] },
  { canonical: 'Olympic Petroleum', category: 'Fuel', aliases: ['olympic petroleum', 'olympic'] },
  { canonical: 'ATN Petroleum', category: 'Fuel', aliases: ['atn petroleum', 'atn'] },
  { canonical: 'Natoil', category: 'Fuel', aliases: ['natoil', 'nat oil'] },
  { canonical: 'Afroil', category: 'Fuel', aliases: ['afroil', 'afro oil'] },
  { canonical: 'General Petroleum', category: 'Fuel', aliases: ['general petroleum', 'gm petroleum', 'g m petroleum'] },
  { canonical: 'G.M & Company', category: 'Fuel', aliases: ['g m company', 'gm company', 'g.m company', 'g.m & company'] },
  { canonical: 'World Oil', category: 'Fuel', aliases: ['world oil', 'world oil terminal'] },
  { canonical: 'TIPER', category: 'Fuel', aliases: ['tiper', 'tanzania international petroleum reserves'] },
  { canonical: 'Shoppers Supermarket Ltd', category: 'Other', aliases: ['shoppers supermarket', 'shoppers super market'], tins: ['101327036'] },
];

function cleanText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compact(value: unknown): string {
  return cleanText(value).replace(/\s+/g, '');
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

function normalizeTin(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 9) return digits;
  if (digits.length === 8) return `1${digits}`;
  return digits || null;
}

// Tanzanian receipts commonly print TZS thousands as `176,018`, while OCR may
// turn the separator into a dot (`176.018`) or a space. JSON numbers can also
// arrive as 176.018 after the model has already interpreted the punctuation as
// a decimal. For TZS, three digits after a separator are a thousands group;
// only one or two trailing digits are treated as decimal cents.
export function normalizeMoney(value: unknown): number | null {
  if (value == null || value === '') return null;
  const raw = String(value).trim().replace(/[^0-9,.'\s-]/g, '');
  if (!raw) return null;

  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/^-/, '').replace(/[\s']/g, '');
  const separators = [...unsigned].filter((char) => char === ',' || char === '.');
  let normalized = unsigned;

  if (separators.length > 0) {
    const lastSeparator = Math.max(unsigned.lastIndexOf(','), unsigned.lastIndexOf('.'));
    const fractionalDigits = unsigned.length - lastSeparator - 1;
    if (fractionalDigits === 1 || fractionalDigits === 2) {
      normalized = unsigned.slice(0, lastSeparator).replace(/[,.]/g, '') + '.' + unsigned.slice(lastSeparator + 1);
    } else {
      normalized = unsigned.replace(/[,.]/g, '');
    }
  }

  const parsed = Number(`${negative ? '-' : ''}${normalized}`);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function vendorLooksLikeReceiptHeader(vendor: string): boolean {
  return /start\s+of.*receipt|legal\s+receipt|ucon\s+receipt|leon\s+receipt|official\s+receipt/i.test(cleanText(vendor));
}

function vendorLooksLikeSpecificStation(vendor: string): boolean {
  return /\b(?:service|filling|petrol)\s+station\b/i.test(cleanText(vendor));
}

function findMerchant(row: ReceiptLike): KnownMerchant | null {
  const vendor = cleanText(row.vendor ?? row.vendor_name);
  const vendorCompact = compact(row.vendor ?? row.vendor_name);
  const category = cleanText(row.category);
  const context = [
    vendor,
    category,
    row.description,
    row.raw_text,
    row.raw_text_excerpt,
    row.merchant_hint,
    row.vendor_evidence,
    Array.isArray(row.line_items) ? row.line_items.join(' ') : '',
  ].map(cleanText).join(' ');
  const tin = normalizeTin(row.vendor_tin);

  for (const merchant of KNOWN_MERCHANTS) {
    if (tin && merchant.tins?.includes(tin)) return merchant;
  }

  let best: { merchant: KnownMerchant; score: number } | null = null;
  for (const merchant of KNOWN_MERCHANTS) {
    for (const alias of merchant.aliases) {
      const aliasClean = cleanText(alias);
      const aliasCompact = compact(alias);
      // Never infer a merchant from generic receipt labels such as TOTAL. Those
      // words occur in every fiscal receipt's amount section.
      const contextualMatch = aliasClean.length >= 6 && context.includes(aliasClean) ? 0.86 : 0;
      const score = Math.max(
        similarity(vendor, aliasClean),
        similarity(vendorCompact, aliasCompact),
        contextualMatch,
      );
      if (!best || score > best.score) best = { merchant, score };
    }
  }

  return best && best.score >= 0.72 ? best.merchant : null;
}

function isFuelContext(row: ReceiptLike, merchant: KnownMerchant | null): boolean {
  if (merchant?.category === 'Fuel') return true;
  const context = cleanText([
    row.vendor,
    row.vendor_name,
    row.category,
    row.description,
    row.raw_text,
    row.raw_text_excerpt,
    row.merchant_hint,
    row.vendor_evidence,
    Array.isArray(row.line_items) ? row.line_items.join(' ') : '',
  ].join(' '));
  return FUEL_KEYWORDS.some((term) => context.includes(term));
}

export function normalizeTanzaniaReceipt<T extends ReceiptLike>(row: T): T {
  const merchant = findMerchant(row);
  const rawVendor = String(row.vendor ?? row.vendor_name ?? '');
  const vendorKey = 'vendor_name' in row ? 'vendor_name' : 'vendor';
  const normalizedTin = normalizeTin(row.vendor_tin);
  const merchantMatchedByTin = Boolean(merchant && normalizedTin && merchant.tins?.includes(normalizedTin));
  const vendorEvidence = merchant && merchant.aliases.some((alias) => {
    const aliasClean = cleanText(alias);
    return Math.max(similarity(cleanText(rawVendor), aliasClean), similarity(compact(rawVendor), compact(alias))) >= 0.72;
  });
  // A fuel category is not evidence of a specific brand. Preserve a readable
  // station name such as “GP NANENANE PETROL STATION”; only canonicalize when
  // the printed/vendor value itself matches a known merchant or is a header.
  const shouldReplaceVendor = merchant && (
    merchantMatchedByTin
    || !rawVendor
    || vendorLooksLikeReceiptHeader(rawVendor)
    || (vendorEvidence && !vendorLooksLikeSpecificStation(rawVendor))
  );
  const category = isFuelContext(row, merchant) ? 'Fuel' : row.category ?? merchant?.category;

  return {
    ...row,
    [vendorKey]: shouldReplaceVendor ? merchant.canonical : row[vendorKey],
    vendor_tin: normalizedTin,
    total_amount: normalizeMoney(row.total_amount),
    tax_amount: normalizeMoney(row.tax_amount),
    ...(Object.prototype.hasOwnProperty.call(row, 'net_amount')
      ? { net_amount: normalizeMoney(row.net_amount) }
      : {}),
    category,
    raw_ai_response: row.raw_ai_response,
  };
}
