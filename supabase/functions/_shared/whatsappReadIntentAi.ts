import { resolveAnthropicModel } from './anthropicModel.ts';
import type { Lang } from './whatsappIntent.ts';
import type { ProductAnalyticsRequest } from './whatsappProductAnalytics.ts';
import type { ReadRequest, ReadToolName } from './whatsappReadTools.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_READ_INTENT_CHARS = 600;

export type SemanticReadIntent =
  | { kind: 'read_tool'; request: ReadRequest }
  | { kind: 'product_analytics'; request: ProductAnalyticsRequest };

const READ_TOOLS = new Set<ReadToolName>([
  'ai_business_summary', 'ai_debtors', 'ai_debtor_detail', 'daily_profit_estimate',
  'ai_my_receipts', 'ai_petty_cash_balance', 'ai_owed_to_me', 'ai_my_businesses',
  'ai_pending_approvals',
]);

function extractJson(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export function shouldInterpretReadWithAi(text: string | null | undefined): boolean {
  const value = String(text ?? '').toLocaleLowerCase().trim();
  if (!value || value.length > MAX_READ_INTENT_CHARS) return false;
  const questionCue = /\?|\b(?:nani|gani|ngapi|kiasi|vipi|onyesha|nionyeshe|nipe|what|which|who|how much|how many|show|list|total|jumla|mapato|faida)\b/.test(value);
  const businessCue = /\b(?:mauzo|uza|inauza|imeuzwa|iliuzwa|bidhaa|risiti|matumizi|deni|madeni|wadeni|faida|petty cash|reimburse|biashara|sale|sales|sold|product|products|receipt|receipts|expense|expenses|debt|debts|profit|business)\b/.test(value);
  return questionCue && businessCue;
}

export function validateSemanticReadIntent(candidate: unknown): SemanticReadIntent | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const raw = candidate as Record<string, unknown>;
  if (raw.kind === 'product_analytics') {
    const rankBy = raw.rank_by;
    const period = raw.period;
    const names = Array.isArray(raw.product_names)
      ? raw.product_names.filter((name): name is string => typeof name === 'string').map((name) => name.trim().slice(0, 100)).filter(Boolean).slice(0, 2)
      : [];
    if (!['quantity', 'revenue', 'margin'].includes(String(rankBy))) return null;
    if (!['today', 'week', 'month', 'year'].includes(String(period))) return null;
    return { kind: 'product_analytics', request: { rankBy: rankBy as ProductAnalyticsRequest['rankBy'], period: period as ProductAnalyticsRequest['period'], compareNames: names } };
  }
  if (raw.kind === 'read_tool' && READ_TOOLS.has(raw.tool as ReadToolName)) {
    const period = ['today', 'week', 'month', 'year'].includes(String(raw.period)) ? String(raw.period) : 'today';
    const partyName = typeof raw.party_name === 'string' ? raw.party_name.trim().slice(0, 100) || null : null;
    const status = typeof raw.status === 'string' && ['confirmed', 'submitted'].includes(raw.status) ? raw.status : null;
    return { kind: 'read_tool', request: { tool: raw.tool as ReadToolName, period: period as ReadRequest['period'], partyName, status } };
  }
  return null;
}

export async function interpretReadIntentWithAi(text: string, lang: Lang): Promise<SemanticReadIntent | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const input = text.trim().slice(0, MAX_READ_INTENT_CHARS);
  if (!apiKey || !input) return null;
  const model = await resolveAnthropicModel(apiKey, Deno.env.get('ANTHROPIC_MODEL'));
  const prompt = `Classify one Risip READ-ONLY business question. Return JSON only.
Language: ${lang}
Allowed output 1: {"kind":"product_analytics","rank_by":"quantity|revenue|margin","period":"today|week|month|year","product_names":[string]}
Allowed output 2: {"kind":"read_tool","tool":"ai_business_summary|ai_debtors|ai_debtor_detail|daily_profit_estimate|ai_my_receipts|ai_petty_cash_balance|ai_owed_to_me|ai_my_businesses|ai_pending_approvals","period":"today|week|month|year","party_name":string|null,"status":string|null}
If this is an instruction to create, change, approve, pay, reverse, delete, invite, or configure anything, return {"kind":"unknown"}.
Never calculate an amount. Never invent a product, person, status, company, or period. Message: ${input}`;
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 220, temperature: 0, system: 'You only classify read-only Risip questions into an allowed JSON tool. You never perform actions.', messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    return validateSemanticReadIntent(extractJson(payload.content?.find((part) => part.type === 'text')?.text ?? ''));
  } catch { return null; }
}
