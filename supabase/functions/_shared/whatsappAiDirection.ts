/** AI interprets direction; backend checks a closed enum and kind consistency. */
export const AI_EVENT_DIRECTIONS = ['sale', 'purchase', 'stock_count', 'stock_loss', 'owner_use', 'whole_animal_procurement', 'whole_animal_breakdown'] as const;
export type AiEventDirection = typeof AI_EVENT_DIRECTIONS[number];
const KIND_DIRECTION: Record<string, AiEventDirection> = {
  sale: 'sale', credit_sale: 'sale', stock_purchase: 'purchase', supplier_credit_purchase: 'purchase',
  stock_count: 'stock_count', stock_loss: 'stock_loss', owner_use: 'owner_use',
  whole_animal_procurement: 'whole_animal_procurement', whole_animal_breakdown: 'whole_animal_breakdown',
};
export function validateAiEventDirection(input: Record<string, unknown>): 'known' | 'clarify' | 'invalid' {
  if (!Object.prototype.hasOwnProperty.call(input, 'direction')) return 'invalid';
  if (input.direction === 'unclear') return 'clarify';
  const expected = KIND_DIRECTION[String(input.kind)];
  if (!expected || input.direction !== expected) return 'invalid';
  if (Array.isArray(input.missing_fields) && input.missing_fields.includes('direction')) return 'clarify';
  return 'known';
}
