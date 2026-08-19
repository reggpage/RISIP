// Bounded business classification for WhatsApp onboarding.
//
// Unknown phone numbers never reach a paid model. This deterministic layer
// understands the common Tanzanian descriptions we support, while the exported
// validator is the only door for a future structured-AI fallback. A model may
// suggest a category; it can never invent one or persist anything itself.

export const RISIP_BUSINESS_TAXONOMY = {
  'Food & Beverages': [
    'Kijiwe cha Chips',
    'Mama Lishe',
    'Genge la Mboga na Matunda',
    'Duka la Vinywaji na Grocery',
    'Bakery',
  ],
  'Retail & General Stores': [
    "Duka la Mang'aa / Rejareja",
    'Duka la Nguo na Viatu',
    'Duka la Vipodozi',
    'Hardware',
    'Duka la Simu na Elektroniki',
    'Pharmacy',
  ],
  'Liquid & Bulk Refills': [
    'Mafuta ya Kula ya Kupima',
    'Maziwa ya Kupima',
    'Gesi na Nishati',
  ],
  'Services & Micro-Manufacturing': [
    'Stationery na Fedha',
    'Saluni',
    'Gereji na Spea',
    'Ushonaji',
  ],
} as const;

export type BusinessCategory = keyof typeof RISIP_BUSINESS_TAXONOMY;
export type BusinessSubCategory = typeof RISIP_BUSINESS_TAXONOMY[BusinessCategory][number];

export type BusinessClassification = {
  category: BusinessCategory;
  sub_category: BusinessSubCategory;
  confidence: number;
  detected_keywords: string[];
  swahili_confirmation_message: string;
};

type Rule = {
  category: BusinessCategory;
  subCategory: BusinessSubCategory;
  keywords: Array<{ phrase: string; weight?: number }>;
};

const RULES: Rule[] = [
  { category: 'Food & Beverages', subCategory: 'Kijiwe cha Chips', keywords: [
    { phrase: 'chips', weight: 3 }, { phrase: 'chipsi', weight: 3 }, { phrase: 'zege', weight: 3 },
    { phrase: 'kuku', weight: 1.2 }, { phrase: 'mayai', weight: 1.2 }, { phrase: 'fast food', weight: 2 },
  ] },
  { category: 'Food & Beverages', subCategory: 'Mama Lishe', keywords: [
    { phrase: 'mama lishe', weight: 4 }, { phrase: 'chakula', weight: 1.5 }, { phrase: 'mgahawa', weight: 3 },
    { phrase: 'restaurant', weight: 3 }, { phrase: 'wali', weight: 1 }, { phrase: 'ugali', weight: 1 },
  ] },
  { category: 'Food & Beverages', subCategory: 'Genge la Mboga na Matunda', keywords: [
    { phrase: 'genge', weight: 3 }, { phrase: 'mboga', weight: 2 }, { phrase: 'matunda', weight: 2 },
    { phrase: 'vegetable', weight: 2 }, { phrase: 'fruit', weight: 2 },
  ] },
  { category: 'Food & Beverages', subCategory: 'Duka la Vinywaji na Grocery', keywords: [
    { phrase: 'vinywaji', weight: 2.5 }, { phrase: 'grocery', weight: 3 }, { phrase: 'soda', weight: 1.5 },
    { phrase: 'kreti', weight: 1.5 }, { phrase: 'vyakula vya baridi', weight: 2 }, { phrase: 'boti', weight: 1 },
  ] },
  { category: 'Food & Beverages', subCategory: 'Bakery', keywords: [
    { phrase: 'bakery', weight: 4 }, { phrase: 'mkate', weight: 2 }, { phrase: 'keki', weight: 2 },
    { phrase: 'cake', weight: 2 }, { phrase: 'maandazi', weight: 1.5 },
  ] },
  { category: 'Retail & General Stores', subCategory: "Duka la Mang'aa / Rejareja", keywords: [
    { phrase: 'rejareja', weight: 3 }, { phrase: 'mangaa', weight: 3 }, { phrase: 'duka la kawaida', weight: 2 },
    { phrase: 'general store', weight: 3 }, { phrase: 'shop', weight: 1 },
  ] },
  { category: 'Retail & General Stores', subCategory: 'Duka la Nguo na Viatu', keywords: [
    { phrase: 'nguo', weight: 2.5 }, { phrase: 'viatu', weight: 2.5 }, { phrase: 'boutique', weight: 3 },
    { phrase: 'fashion', weight: 2 }, { phrase: 'clothes', weight: 2 }, { phrase: 'shoes', weight: 2 },
  ] },
  { category: 'Retail & General Stores', subCategory: 'Duka la Vipodozi', keywords: [
    { phrase: 'vipodozi', weight: 4 }, { phrase: 'cosmetic', weight: 3 }, { phrase: 'makeup', weight: 2 },
    { phrase: 'perfume', weight: 1.5 },
  ] },
  { category: 'Retail & General Stores', subCategory: 'Hardware', keywords: [
    { phrase: 'hardware', weight: 4 }, { phrase: 'cement', weight: 2 }, { phrase: 'saruji', weight: 2 },
    { phrase: 'mabati', weight: 2 }, { phrase: 'nondo', weight: 2 }, { phrase: 'vifaa vya ujenzi', weight: 3 },
  ] },
  { category: 'Retail & General Stores', subCategory: 'Duka la Simu na Elektroniki', keywords: [
    { phrase: 'simu', weight: 2 }, { phrase: 'electronics', weight: 3 }, { phrase: 'elektroniki', weight: 3 },
    { phrase: 'charger', weight: 1.5 }, { phrase: 'accessories', weight: 1.5 },
  ] },
  { category: 'Retail & General Stores', subCategory: 'Pharmacy', keywords: [
    { phrase: 'pharmacy', weight: 4 }, { phrase: 'famasi', weight: 4 }, { phrase: 'dawa', weight: 2 },
    { phrase: 'medical store', weight: 3 },
  ] },
  { category: 'Liquid & Bulk Refills', subCategory: 'Mafuta ya Kula ya Kupima', keywords: [
    { phrase: 'mafuta ya kula', weight: 4 }, { phrase: 'mafuta ya kupima', weight: 4 },
    { phrase: 'cooking oil', weight: 3 }, { phrase: 'lita ya mafuta', weight: 2 },
  ] },
  { category: 'Liquid & Bulk Refills', subCategory: 'Maziwa ya Kupima', keywords: [
    { phrase: 'maziwa ya kupima', weight: 4 }, { phrase: 'maziwa', weight: 2 }, { phrase: 'milk refill', weight: 3 },
  ] },
  { category: 'Liquid & Bulk Refills', subCategory: 'Gesi na Nishati', keywords: [
    { phrase: 'gesi', weight: 3 }, { phrase: 'gas', weight: 2 }, { phrase: 'lpg', weight: 3 },
    { phrase: 'nishati', weight: 2 }, { phrase: 'mkaa', weight: 1.5 },
  ] },
  { category: 'Services & Micro-Manufacturing', subCategory: 'Stationery na Fedha', keywords: [
    { phrase: 'stationery', weight: 4 }, { phrase: 'stationari', weight: 4 }, { phrase: 'bookshop', weight: 4 },
    { phrase: 'vitabu', weight: 2 }, { phrase: 'daftari', weight: 2 }, { phrase: 'kalamu', weight: 2 },
    { phrase: 'karatasi', weight: 2 }, { phrase: 'photocopy', weight: 3 }, { phrase: 'kutoa copy', weight: 3 },
    { phrase: 'printing', weight: 2 }, { phrase: 'm pesa', weight: 2.5 }, { phrase: 'tigo pesa', weight: 2.5 },
    { phrase: 'airtel money', weight: 2.5 }, { phrase: 'wakala', weight: 1.5 },
  ] },
  { category: 'Services & Micro-Manufacturing', subCategory: 'Saluni', keywords: [
    { phrase: 'saluni', weight: 4 }, { phrase: 'salon', weight: 4 }, { phrase: 'kinyozi', weight: 3 },
    { phrase: 'barber', weight: 3 }, { phrase: 'nywele', weight: 1.5 },
  ] },
  { category: 'Services & Micro-Manufacturing', subCategory: 'Gereji na Spea', keywords: [
    { phrase: 'gereji', weight: 4 }, { phrase: 'garage', weight: 4 }, { phrase: 'spea', weight: 3 },
    { phrase: 'spare parts', weight: 3 }, { phrase: 'fundi gari', weight: 2 }, { phrase: 'mechanic', weight: 2 },
  ] },
  { category: 'Services & Micro-Manufacturing', subCategory: 'Ushonaji', keywords: [
    { phrase: 'ushonaji', weight: 4 }, { phrase: 'mshonaji', weight: 4 }, { phrase: 'tailor', weight: 3 },
    { phrase: 'cherehani', weight: 2 }, { phrase: 'kushona', weight: 2 },
  ] },
];

function normalize(value: string): string {
  return value.toLocaleLowerCase('sw')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function allowedPair(category: string, subCategory: string): category is BusinessCategory {
  const children = RISIP_BUSINESS_TAXONOMY[category as BusinessCategory] as readonly string[] | undefined;
  return Boolean(children?.includes(subCategory));
}

function confirmation(subCategory: BusinessSubCategory): string {
  return `Nimeelewa kuwa biashara yako ni ${subCategory}. Je, nimepata sawa?`;
}

/** Classify only when the text carries enough evidence; otherwise ask. */
/**
 * Classify what a business sells.
 *
 * `rejected` holds sub-categories the person has already said NO to. Without it
 * the classifier offered "Bakery" to a shop called "Allen's cake", was told no,
 * and offered "Bakery" again — because the business NAME was being classified
 * alongside the description, and "cake" outweighed everything the person then
 * said. A guess that has been refused is not a guess worth repeating.
 */
export function classifyBusinessDescription(
  input: string,
  rejected: string[] = [],
): BusinessClassification | null {
  const text = normalize(input).slice(0, 500);
  if (text.length < 3) return null;
  const refused = new Set(rejected.map((name) => normalize(name)));
  const scored = RULES.filter((rule) => !refused.has(normalize(rule.subCategory))).map((rule) => {
    const matched = rule.keywords.filter(({ phrase }) => text.includes(normalize(phrase)));
    return { rule, matched, score: matched.reduce((sum, item) => sum + (item.weight ?? 1), 0) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  const second = scored[1]?.score ?? 0;
  // One weak generic word (for example "shop") is not enough evidence.
  if (best.score < 1.5 || best.score - second < 0.5) return null;
  const confidence = Math.min(0.99, Math.max(0.55, 0.58 + best.score * 0.07 - second * 0.02));
  if (confidence < 0.7) return null;
  return {
    category: best.rule.category,
    sub_category: best.rule.subCategory,
    confidence: Math.round(confidence * 100) / 100,
    detected_keywords: best.matched.map(({ phrase }) => phrase).slice(0, 8),
    swahili_confirmation_message: confirmation(best.rule.subCategory),
  };
}

/**
 * Validate untrusted structured output from a future AI fallback. The caller may
 * use the returned value, but the model never receives a database client.
 */
export function validateBusinessClassification(value: unknown): BusinessClassification | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const category = typeof row.category === 'string' ? row.category : '';
  const subCategory = typeof row.sub_category === 'string' ? row.sub_category : '';
  const confidence = Number(row.confidence);
  if (!allowedPair(category, subCategory) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (!Array.isArray(row.detected_keywords) || row.detected_keywords.some((item) => typeof item !== 'string')) return null;
  const message = typeof row.swahili_confirmation_message === 'string'
    ? row.swahili_confirmation_message.replace(/\s+/g, ' ').trim().slice(0, 240)
    : '';
  return {
    category,
    sub_category: subCategory as BusinessSubCategory,
    confidence: Math.round(confidence * 100) / 100,
    detected_keywords: row.detected_keywords.map((item) => String(item).trim().slice(0, 60)).filter(Boolean).slice(0, 8),
    swahili_confirmation_message: message || confirmation(subCategory as BusinessSubCategory),
  };
}
