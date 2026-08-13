const MODELS_URL = 'https://api.anthropic.com/v1/models';

declare const Deno: { env: { get(name: string): string | undefined } };

// Keep the app working when Anthropic retires a model or an API workspace does
// not have access to the model requested by an older frontend build.
const PREFERRED_MODELS = [
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
];

export async function resolveAnthropicModel(apiKey: string, requested?: string, preferRequested = false): Promise<string> {
  const configured = Deno.env.get('ANTHROPIC_MODEL');
  const preferred = [
    ...(preferRequested ? [requested, configured] : [configured, requested]),
    ...PREFERRED_MODELS,
  ].filter(
    (value): value is string => Boolean(value),
  );

  try {
    const response = await fetch(MODELS_URL, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (response.ok) {
      const payload = await response.json() as { data?: Array<{ id?: string }> };
      const available = new Set((payload.data ?? []).map((model) => model.id).filter(Boolean));
      const match = preferred.find((model) => available.has(model));
      if (match) return match;
      const first = [...available][0];
      if (first) return first;
    }
  } catch {
    // Use the stable fallback below if the model catalogue is temporarily unavailable.
  }

  return preferred[0] ?? 'claude-haiku-4-5-20251001';
}
