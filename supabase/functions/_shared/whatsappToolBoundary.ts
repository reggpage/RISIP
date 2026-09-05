/** Runtime validation of the JSON-schema subset used by Risip's tool contracts.
 * Provider constrained decoding is optional; this boundary is not. No language
 * interpretation, coercion, dropped fields, or side effects occur here.
 */
export type ToolContract = { name: string; input_schema: Record<string, unknown> };
export type ProposedToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ToolBoundaryError = { code: string; path: string };

export function validateToolValue(value: unknown, schema: Record<string, unknown>, path = '$', depth = 0): ToolBoundaryError | null {
  const bad = (code: string): ToolBoundaryError => ({ code, path });
  if (depth > 16) return bad('tool_input_too_deep');
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some((branch) => branch && typeof branch === 'object'
      && !validateToolValue(value, branch as Record<string, unknown>, path, depth + 1))
      ? null : bad('tool_input_union');
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (!types.includes(actual) && !(actual === 'number' && types.includes('integer') && Number.isInteger(value))) {
    return bad('tool_input_type');
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return bad('tool_input_enum');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return bad('tool_input_number');
    if (typeof schema.minimum === 'number' && value < schema.minimum) return bad('tool_input_minimum');
    if (typeof schema.maximum === 'number' && value > schema.maximum) return bad('tool_input_maximum');
  }
  if (typeof value === 'string') {
    const max = typeof schema.maxLength === 'number' ? schema.maxLength : 4000;
    if (value.length > max) return bad('tool_input_too_long');
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) return bad('tool_input_too_short');
  }
  if (Array.isArray(value)) {
    const max = typeof schema.maxItems === 'number' ? schema.maxItems : 50;
    if (value.length > max) return bad('tool_input_too_many_items');
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return bad('tool_input_too_few_items');
    if (!schema.items || typeof schema.items !== 'object') return bad('tool_schema_missing_items');
    for (let i = 0; i < value.length; i++) {
      const error = validateToolValue(value[i], schema.items as Record<string, unknown>, `${path}[${i}]`, depth + 1);
      if (error) return error;
    }
  } else if (actual === 'object') {
    const row = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const required of (schema.required ?? []) as string[]) {
      if (!Object.prototype.hasOwnProperty.call(row, required)) return { code: 'tool_input_required', path: `${path}.${required}` };
    }
    for (const key of Object.keys(row)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        // Dynamic dictionaries are not part of the exposed tool contract.
        return { code: 'tool_input_extra_property', path };
      }
      const error = validateToolValue(row[key], properties[key], `${path}.${key}`, depth + 1);
      if (error) return error;
    }
  }
  return null;
}

export function toolMayChangeState(name: string): boolean {
  return name.startsWith('propose_') || name === 'resolve_pending_clarification'
    || name === 'request_account_action';
}

/** Preflight the WHOLE round before executing even the first proposal. */
export function validateToolRound(calls: ProposedToolCall[], contracts: ToolContract[], mutationAlreadyExecuted = false): ToolBoundaryError | null {
  const ids = new Set<string>();
  let mutations = mutationAlreadyExecuted ? 1 : 0;
  if (calls.length > 20) return { code: 'too_many_tool_calls', path: '$' };
  for (const call of calls) {
    if (!call.id || ids.has(call.id)) return { code: 'duplicate_tool_call', path: '$' };
    ids.add(call.id);
    const contract = contracts.find((tool) => tool.name === call.name);
    if (!contract) return { code: 'tool_not_exposed', path: '$' };
    const error = validateToolValue(call.input, contract.input_schema);
    if (error) return error;
    if (call.name === 'propose_business_event') {
      const lines = call.input.lines as Array<Record<string, unknown>>;
      if (!Array.isArray(lines) || lines.length === 0) return { code: 'event_product_required', path: '$.lines' };
      for (let i = 0; i < lines.length; i++) {
        if (typeof lines[i].quantity_candidate === 'number'
          && (typeof lines[i].quantity_wording !== 'string' || !String(lines[i].quantity_wording).trim())) {
          return { code: 'quantity_evidence_required', path: `$.lines[${i}].quantity_wording` };
        }
      }
    }
    if (toolMayChangeState(call.name)) mutations++;
  }
  return mutations > 1 ? { code: 'conflicting_proposals', path: '$' } : null;
}
