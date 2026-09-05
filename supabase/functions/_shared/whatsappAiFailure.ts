/** Bounded failure attribution. Never log a provider response or merchant text. */
export type AiFailureLayer = 'input' | 'model' | 'tool_schema' | 'tool_execution' | 'provider' | 'grounding' | 'budget' | 'unknown';
export function aiFailureLayer(code: string): AiFailureLayer {
  if (code === 'input_too_long' || code === 'empty_user_text') return 'input';
  if (code.startsWith('tool_boundary:')) return 'tool_schema';
  if (code.startsWith('tool_execution_failed:')) return 'tool_execution';
  if (/^model_(ungrounded_number|profit_wording|false_date_caveat):/.test(code)) return 'grounding';
  if (code === 'budget_block') return 'budget';
  if (code.startsWith('provider_') || code === 'missing_api_key') return 'provider';
  if (['missing_required_tool_call', 'tool_round_limit', 'tool_loop_exhausted', 'turn_deadline_exceeded'].includes(code)) return 'model';
  return 'unknown';
}
