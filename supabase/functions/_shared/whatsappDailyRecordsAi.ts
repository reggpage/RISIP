import type { Lang } from './whatsappIntent.ts';
import {
  MAX_DAILY_RECORD_AMOUNT,
  type DailyRecordKind,
  type DailyRecordLine,
  type ParsedDailyRecord,
} from './whatsappDailyRecords.ts';
import { resolveAnthropicModel } from './anthropicModel.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_INTERPRETATION_CHARS = 1200;

type AiCandidate = {
  kind?: string;
  party_name?: unknown;
  description?: unknown;
  amount?: unknown;
  lines?: unknown;
};

function extractJson(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function money(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase().replace(/@/g, '').replace(/tshs?|tzs|sh/g, '').replace(/,/g, '').replace(/\/=\s*$/, '').trim();
  const parsed = Number(normalized.endsWith('k') ? normalized.slice(0, -1) + '000' : normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function validMoney(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0 && value <= MAX_DAILY_RECORD_AMOUNT;
}

function buildLines(value: unknown): DailyRecordLine[] | null {
  if (!Array.isArray(value) || value.length === 0) return [];
  const lines: DailyRecordLine[] = [];
  for (const raw of value) {
    const line = raw as { description?: unknown; quantity?: unknown; unit_amount?: unknown };
    const description = typeof line.description === 'string' ? line.description.trim() : '';
    const quantity = Number(line.quantity);
    const unitAmount = money(line.unit_amount);
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || !validMoney(unitAmount)) return null;
    lines.push({ description, quantity, unit_amount: unitAmount });
  }
  return lines;
}

/**
 * AI is an interpreter only. It never receives a database client and its amount
 * is ignored whenever line arithmetic can determine a total. For no-line records,
 * the caller still has to compare the returned amount with a deterministic source.
 */
export function validateAiCandidate(candidate: unknown): ParsedDailyRecord | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const value = candidate as AiCandidate;
  const kind = value.kind;
  if (kind !== 'sale' && kind !== 'expense' && kind !== 'debt_issued' && kind !== 'customer_payment') return null;
  const lines = buildLines(value.lines);
  if (lines === null) return null;
  const lineTotal = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_amount * 100) / 100, 0);
  const suppliedAmount = money(value.amount);
  if (lines.length > 0) {
    if (!validMoney(lineTotal) || (suppliedAmount !== null && Math.abs(suppliedAmount - lineTotal) > 0.01)) return null;
  } else if (!validMoney(suppliedAmount)) {
    return null;
  }
  const finalAmount = lines.length > 0 ? lineTotal : suppliedAmount;
  if (!validMoney(finalAmount)) return null;
  return {
    kind: kind as DailyRecordKind,
    amount: finalAmount,
    partyName: typeof value.party_name === 'string' ? value.party_name.trim().slice(0, 200) || null : null,
    description: typeof value.description === 'string' ? value.description.trim().slice(0, 2000) || null : null,
    lines,
    confidence: 0.55,
  };
}

export async function interpretDailyRecordWithAi(text: string, lang: Lang): Promise<ParsedDailyRecord | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const input = text.trim().slice(0, MAX_INTERPRETATION_CHARS);
  if (!apiKey || !input) return null;
  const model = await resolveAnthropicModel(apiKey, Deno.env.get('ANTHROPIC_MODEL'));
  const prompt = `You interpret one Risip business message. Return ONLY JSON, never prose, markdown, actions, or database instructions.
Language: ${lang}
Allowed kinds: sale, expense, debt_issued, customer_payment.
Schema: {"kind":"sale|expense|debt_issued|customer_payment","party_name":string|null,"description":string|null,"amount":number|null,"lines":[{"description":string,"quantity":number,"unit_amount":number}]}
Use lines for itemized or multi-line arithmetic. Do not invent quantity, price, party, or amount. If unclear, return {"kind":"unknown"}.
Message: ${input}`;
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 700, temperature: 0, system: 'You are a strict JSON business-message interpreter.', messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const raw = payload.content?.find((part) => part.type === 'text')?.text ?? '';
    return validateAiCandidate(extractJson(raw));
  } catch {
    return null;
  }
}
