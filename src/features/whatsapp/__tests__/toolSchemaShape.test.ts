import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';

// MEASURED FAILURE, found in whatsapp_audit_log — eleven times in one day:
//
//   conversational_ai | provider | provider_400_invalid_request_error_
//   tools.12.custom_Invalid_schema_Enum_value_cash_does_not_match_
//   declared_type_[_string_null_]
//
// A union type with an enum beside it is refused in strict tool mode. EVERY
// conversational call returned 400, so every answer the shop saw was the
// deterministic fallback — the same advisor template over and over, only the
// numbers moving. It read as a model that could not think. There was no model.
//
// One malformed property in one tool silenced the whole assistant, and nothing
// in the test suite could see it, because the schema was only ever validated by
// the API. This walks every tool instead.

type Schema = Record<string, unknown>;

const properties = (tool: Record<string, unknown>): Array<[string, Schema]> => {
  const input = (tool.input_schema ?? {}) as Schema;
  const props = (input.properties ?? {}) as Record<string, Schema>;
  return Object.entries(props);
};

/** Walks nested objects and arrays, so a bad property cannot hide in a line item. */
function* everyProperty(schema: Schema, path = ''): Generator<[string, Schema]> {
  const props = (schema.properties ?? {}) as Record<string, Schema>;
  for (const [name, value] of Object.entries(props)) {
    const here = path ? `${path}.${name}` : name;
    yield [here, value];
    yield* everyProperty(value, here);
    const items = value.items as Schema | undefined;
    if (items) yield* everyProperty(items, `${here}[]`);
  }
}

describe('every tool schema is one the API will accept', () => {
  it('has tools to check', () => {
    expect(ASSISTANT_TOOLS.length).toBeGreaterThan(10);
  });

  it('never puts an enum beside a union type', () => {
    for (const tool of ASSISTANT_TOOLS as Array<Record<string, unknown>>) {
      for (const [path, schema] of everyProperty((tool.input_schema ?? {}) as Schema)) {
        if (!Array.isArray(schema.enum)) continue;
        expect(Array.isArray(schema.type), `${tool.name}.${path}`).toBe(false);
      }
    }
  });

  it('never puts null inside an enum list', () => {
    // "One of these, or nothing" is anyOf. It is not an enum with null in it.
    for (const tool of ASSISTANT_TOOLS as Array<Record<string, unknown>>) {
      for (const [path, schema] of everyProperty((tool.input_schema ?? {}) as Schema)) {
        if (!Array.isArray(schema.enum)) continue;
        expect(schema.enum.includes(null), `${tool.name}.${path}`).toBe(false);
      }
    }
  });

  it('expresses any nullable choice as anyOf', () => {
    const tools = ASSISTANT_TOOLS as Array<Record<string, unknown>>;
    const nullable = tools.flatMap((tool) =>
      [...everyProperty((tool.input_schema ?? {}) as Schema)]
        .filter(([, schema]) => Array.isArray(schema.anyOf)));
    // No lower bound: Stage B removed the last nullable enum from the visible
    // surface by taking the trader's word instead of a category. The rule still
    // has to hold for anything that comes back.
    for (const [path, schema] of nullable) {
      const options = schema.anyOf as Schema[];
      expect(options.some((option) => option.type === 'null'), path).toBe(true);
    }
  });

  it('has no nullable enum left on the visible surface at all', () => {
    // The 400 that returned on every conversational call for a day was a
    // nullable enum, and the enum that survived it turned "tigopesa" into cash.
    // Stage B replaced both with wording the server canonicalizes, so the shape
    // that caused each is now simply absent rather than carefully spelled.
    for (const tool of ASSISTANT_TOOLS as Array<Record<string, unknown>>) {
      for (const [path, schema] of everyProperty((tool.input_schema ?? {}) as Schema)) {
        const nullableEnum = Array.isArray(schema.anyOf)
          && (schema.anyOf as Schema[]).some((option) => Array.isArray(option.enum));
        expect(nullableEnum, `${tool.name}.${path}`).toBe(false);
      }
    }
  });

  it('gives every tool a name and an object schema', () => {
    for (const tool of ASSISTANT_TOOLS as Array<Record<string, unknown>>) {
      expect(typeof tool.name).toBe('string');
      expect(((tool.input_schema ?? {}) as Schema).type).toBe('object');
      expect(properties(tool).length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('a message may fail, but it may not disappear', () => {
  // MEASURED FAILURE, and the worst kind: total silence.
  //
  //   whatsapp_messages  15:25:32 | text | pending | retries=0 | (no error)
  //
  // Every other message that day reached 'skipped'. This one stayed 'pending'
  // for ever, with no last_error, no audit row and no reply, because nothing
  // wrapped the body of the message loop. Anything that threw escaped and the
  // shopkeeper was simply never answered.
  const webhook = readFileSync(
    resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

  it('guards everything after the idempotency gate', () => {
    expect(webhook).toContain('// Everything after the idempotency gate runs inside this guard.');
    // The gate itself stays outside, so a redelivery still collides and returns
    // without being treated as a failure.
    const guard = webhook.indexOf('// Everything after the idempotency gate');
    expect(webhook.indexOf("if (dupErr.code === '23505') continue;")).toBeLessThan(guard);
  });

  it('records why, on the message itself', () => {
    expect(webhook).toContain("status: 'failed', last_error: reason.slice(0, 500)");
  });

  it('tells the shop something rather than nothing', () => {
    // Silence reads as Risip ignoring them, which is worse than an error and
    // harder to report.
    expect(webhook).toContain('Samahani, kuna hitilafu kwa upande wangu.');
  });
});
