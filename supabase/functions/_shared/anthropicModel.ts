const MODELS_URL = 'https://api.anthropic.com/v1/models';

declare const Deno: { env: { get(name: string): string | undefined } };

/**
 * Haiku 4.5, and nothing that is not a Haiku.
 *
 * The owner's instruction, and the economics behind it: a duka asking twenty
 * questions a day cannot be answered by the most expensive model available.
 * Every figure that matters is computed in code before the model ever sees it —
 * the model's job here is language, not arithmetic, and Haiku is good at
 * language.
 *
 * The list exists for RETIREMENT, not for choice: if 4.5 is ever withdrawn from
 * an account, an older Haiku keeps the shop working. There is deliberately no
 * Sonnet and no Opus in it.
 */
const PINNED = 'claude-haiku-4-5-20251001';
const HAIKU_MODELS = [
  PINNED,
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
];

/** Only a Haiku may be asked for. Anything else is ignored, not obeyed. */
function isHaiku(model: string | undefined | null): boolean {
  return typeof model === 'string' && /(^|[^a-z])haiku([^a-z]|$)/i.test(model);
}

export async function resolveAnthropicModel(
  apiKey: string,
  requested?: string,
  preferRequested = false,
): Promise<string> {
  const configured = Deno.env.get('ANTHROPIC_MODEL');

  // MEASURED RISK, closed here. Two ways a costlier model could be reached:
  //
  //   1. extract-receipt and batch-extract-receipts pass `body.model` straight
  //      through, so the model came from the REQUEST. CLAUDE.md used to allow a
  //      Sonnet swap for hard-to-read receipts; the owner has since asked for
  //      Haiku only, so a request for anything else is now ignored rather than
  //      honoured.
  //   2. The old fallback took `[...available][0]` — an ARBITRARY model from
  //      the account — whenever no preference matched. On an account with Opus
  //      enabled that is the most expensive answer possible, chosen silently.
  //
  // Both are gone. Nothing outside this file can widen the choice.
  const asked = [
    ...(preferRequested ? [requested, configured] : [configured, requested]),
  ].filter(isHaiku) as string[];
  const preferred = [...asked, ...HAIKU_MODELS];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(MODELS_URL, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: controller.signal,
    });
    if (response.ok) {
      const payload = await response.json() as { data?: Array<{ id?: string }> };
      const ids = (payload.data ?? []).map((model) => model.id).filter(Boolean) as string[];
      // Kept so resolveProseModel costs nothing: one catalogue call per turn,
      // not two. An extra round trip here would show up on every reply.
      catalogue = ids;
      const available = new Set(ids);
      const match = preferred.find((model) => available.has(model));
      if (match) return match;
      // No Haiku in this account's catalogue. The pinned id is returned anyway
      // so the failure is a clear one from the API, rather than a working reply
      // that quietly cost ten times what it should have.
      return PINNED;
    }
  } catch {
    // Catalogue unavailable: fall through to the pinned model below.
  } finally {
    clearTimeout(timer);
  }

  return preferred[0] ?? PINNED;
}

/**
 * The model that WRITES the answer, once Haiku has decided what the answer is.
 *
 * THE OWNER'S DECISION, and his reason, from his own WhatsApp: "ai inatumia
 * kiswahili kibovu sana why not speak fluent swahili like u". He was right that
 * it is bad and right that it is not a bug — "Uzazi tena hiyo" for "buy it
 * again", "Fidia" for expenses, "karani ndogo lakini kuanza" — that is Haiku
 * 4.5's Kiswahili, and a prompt rule narrows it without fixing it.
 *
 * So the split follows the work rather than the message: Haiku still reads the
 * trader's sentence and picks the tool, which is the cheap, high-volume half
 * and the half it is good at. Only the round that produces PROSE is Sonnet, and
 * only after a tool has already returned the figures — roughly one call per
 * business question, not one per message.
 *
 * This deliberately does NOT widen resolveAnthropicModel. The receipt pipeline
 * passes a model straight through from its request body, and that door stays
 * shut: nothing there can reach Sonnet by asking for it.
 */
const PROSE_MODEL = 'claude-sonnet-5';

/** What the account actually offers, filled in by the call above. */
let catalogue: string[] | null = null;

export function resolveProseModel(fallback: string): string {
  const wanted = Deno.env.get('ANTHROPIC_PROSE_MODEL') || PROSE_MODEL;
  // Sonnet or nothing. An env var must not be able to reach Opus from here.
  if (!/(^|[^a-z])sonnet([^a-z]|$)/i.test(wanted)) return fallback;
  // No catalogue means resolveAnthropicModel could not reach the API either.
  // Writing in Haiku's Kiswahili beats not answering at all.
  if (!catalogue) return fallback;
  return catalogue.includes(wanted)
    ? wanted
    : catalogue.find((id) => /sonnet-5/i.test(id)) ?? fallback;
}
