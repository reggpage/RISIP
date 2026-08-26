import type { Lang } from './whatsappIntent.ts';
import { UNITS } from './whatsappStock.ts';

export type WholeAnimalBreakdownOutput = {
  productName: string;
  quantity: number;
  unit: string;
};

export type WholeAnimalBreakdownSourceHint = {
  relativeDate: 'yesterday' | null;
  purchaseTotal: number | null;
};

export type WholeAnimalBreakdownReading =
  | {
    kind: 'parsed';
    source: WholeAnimalBreakdownSourceHint;
    outputs: WholeAnimalBreakdownOutput[];
  }
  | { kind: 'missing_quantity'; productName: string; unit: string; question: string }
  | { kind: 'missing_product'; quantity: number; unit: string; question: string }
  | { kind: 'none' };

const NUMBER = '[0-9]+(?:[.,][0-9]+)?';
const UNIT = `(${UNITS})`;
const BREAKDOWN_VERB = /\b(?:ametoa|ametengeneza|imetoka|imezalisha|gave|yielded|produced)\b/i;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');
}

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const compact = raw.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(compact)) return null;
  const value = Number(compact);
  return Number.isSafeInteger(value) && value > 0 && value <= 100_000_000 ? value : null;
}

function quantity(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value > 0 && value <= 1_000_000 ? value : null;
}

function missingQuantity(productName: string, unit: string, lang: Lang): WholeAnimalBreakdownReading {
  return {
    kind: 'missing_quantity',
    productName,
    unit,
    question: lang === 'sw'
      ? `${productName} ${unit} ngapi? Taja kipimo halisi kilichopatikana.`
      : `How many ${unit} of ${productName}? State the actual measured quantity.`,
  };
}

function missingProduct(value: number, unit: string, lang: Lang): WholeAnimalBreakdownReading {
  return {
    kind: 'missing_product',
    quantity: value,
    unit,
    question: lang === 'sw'
      ? `Kilo ${value} ni bidhaa gani? Taja jina la bidhaa pamoja na kipimo.`
      : `${value} ${unit} is which product? State the product name and measured quantity.`,
  };
}

/**
 * Reads only the language of a measured breakdown. It never resolves a product
 * or decides a cost; those are company-scoped database responsibilities.
 */
export function parseWholeAnimalBreakdown(
  input: string | null | undefined,
  lang: Lang = 'sw',
): WholeAnimalBreakdownReading {
  const text = normalise(String(input ?? ''));
  if (!text || !/\bng['’]?ombe\b/i.test(text) || !BREAKDOWN_VERB.test(text)) {
    return { kind: 'none' };
  }

  const header = text.match(
    /\bng['’]?ombe\b(?:\s+(huyu|hii|mzima|whole|wa\s+jana|wa\s+yesterday|wa\s+\d[\d,.]*))?\s+(?:ametoa|ametengeneza|imetoka|imezalisha|gave|yielded|produced)\s+(.+)$/i,
  );
  if (!header) return { kind: 'none' };

  const sourceText = header[1]?.toLowerCase() ?? '';
  const source: WholeAnimalBreakdownSourceHint = {
    relativeDate: /\b(?:wa\s+jana|wa\s+yesterday)\b/i.test(sourceText) ? 'yesterday' : null,
    purchaseTotal: /\bwa\s+\d/i.test(sourceText)
      ? money(sourceText.match(/\bwa\s+([\d,.]+)/i)?.[1])
      : null,
  };

  const pieces = header[2]
    .split(/\s*(?:,|\bna\b)\s*/i)
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (pieces.length === 0) return { kind: 'none' };

  const outputs: WholeAnimalBreakdownOutput[] = [];
  for (const piece of pieces) {
    const beforeQuantity = piece.match(new RegExp(`^(.+?)\\s+${UNIT}\\s+(${NUMBER})$`, 'i'));
    const afterQuantity = piece.match(new RegExp(`^(.+?)\\s+(${NUMBER})\\s+${UNIT}$`, 'i'));
    if (beforeQuantity || afterQuantity) {
      const match = beforeQuantity ?? afterQuantity!;
      const productName = match[1].trim();
      const unit = (beforeQuantity ? match[2] : match[3]).toLowerCase();
      const rawQuantity = beforeQuantity ? match[3] : match[2];
      const value = quantity(rawQuantity);
      if (!productName || /^\d/.test(productName)) return missingProduct(Number(rawQuantity), unit, lang);
      if (value === null) return missingQuantity(productName, unit, lang);
      outputs.push({ productName, quantity: value, unit });
      continue;
    }

    const unitOnly = piece.match(new RegExp(`^(?:${UNIT})\\s+(${NUMBER})$`, 'i'));
    if (unitOnly) {
      const unit = unitOnly[1].toLowerCase();
      const value = quantity(unitOnly[2]);
      return value === null ? missingProduct(0, unit, lang) : missingProduct(value, unit, lang);
    }

    const productOnly = piece.replace(/^\s*(?:ya|za|of)\s+/i, '').trim();
    if (productOnly) return missingQuantity(productOnly, 'kilo', lang);
  }

  return outputs.length > 0 ? { kind: 'parsed', source, outputs } : { kind: 'none' };
}

function displayQuantity(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function wholeAnimalBreakdownConfirmation(
  outputs: WholeAnimalBreakdownOutput[],
  lang: Lang,
): string {
  const lines = lang === 'sw'
    ? ['Nimeelewa ng\'ombe huyu ametoa:']
    : ['I understood this animal produced:'];
  for (const output of outputs) {
    lines.push(`- ${output.productName} ${displayQuantity(output.quantity)} ${output.unit}`);
  }
  lines.push('', lang === 'sw'
    ? 'Nirekodi breakdown hii? *NDIYO* / *HAPANA*'
    : 'Record this breakdown? *YES* / *NO*');
  return lines.join('\n');
}

export type WholeAnimalBreakdownCandidate = {
  dailyRecordId: string;
  animalType: string;
  animalCount: number;
  purchaseTotal: number;
  occurredAt: string;
};

export type WholeAnimalBreakdownSourceSelection = {
  kind: 'whole_animal_breakdown_source_selection';
  sourceMessageId: string;
  outputs: WholeAnimalBreakdownOutput[];
  candidates: WholeAnimalBreakdownCandidate[];
};

export type WholeAnimalBreakdownConfirmationState = {
  kind: 'whole_animal_breakdown_confirmation';
  dailyRecordId: string;
  sourceMessageId: string;
  outputs: WholeAnimalBreakdownOutput[];
};

export function wholeAnimalSourceQuestion(
  candidates: WholeAnimalBreakdownCandidate[],
  lang: Lang,
): string {
  const heading = lang === 'sw'
    ? 'Nimepata ng\'ombe zaidi ya mmoja ambaye bado hajavunjwa. Chagua chanzo:'
    : 'I found more than one confirmed animal that has not been broken down. Choose the source:';
  const rows = candidates.map((candidate, index) =>
    `${index + 1}. ${candidate.animalType} ${candidate.animalCount} — TSh ${candidate.purchaseTotal.toLocaleString('en-US')} — ${candidate.occurredAt.slice(0, 10)}`,
  );
  return `${heading}\n${rows.join('\n')}\n\n${lang === 'sw' ? 'Jibu namba moja, au HAPANA kughairi.' : 'Reply with one number, or NO to cancel.'}`;
}

export function parseWholeAnimalSourceChoice(
  input: string | null | undefined,
  count: number,
): number | null {
  const value = String(input ?? '').trim();
  if (!/^\d+$/.test(value)) return null;
  const index = Number(value) - 1;
  return index >= 0 && index < count ? index : null;
}
