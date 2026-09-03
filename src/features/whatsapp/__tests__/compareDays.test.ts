import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';

// TWO DATES, ONE ANSWER.
//
// MEASURED, from the shop's own screen: "linganisha faida mauzo ya tarehe 17 na
// 23" came back with the 17th alone. No comparison, no 23rd, and nothing
// anywhere saying half the question had been dropped.
//
// Telemetry says the model did the sensible thing — chosen_tool
// get_day_records, tool_rounds 2, outcome answered. The contract is what
// failed. get_day_records returns a terminalReply: its text IS the answer and
// the turn ends there, deliberately, so that a list of forty figures is not
// retyped by a model that has no reason to touch it. That is right for one day
// and fatal for two, because the first call ends the turn before the second
// date is ever read.
//
// This is the same shape as the matumizi/manunuzi fault: the model understood
// the message and the tools had nowhere to put what it understood. Adding a
// date to get_day_records would not fix it — the terminal reply is the problem,
// not the arity — so the comparison gets its own tool that returns evidence
// rather than an answer, and the model writes the comparison from it.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const compare = ASSISTANT_TOOLS.find((tool) => tool.name === 'get_day_comparison');
const dayRecords = ASSISTANT_TOOLS.find((tool) => tool.name === 'get_day_records');

describe('the tool that was missing', () => {
  it('exists, and takes both days', () => {
    expect(compare).toBeDefined();
    const schema = compare?.input_schema as {
      properties: Record<string, unknown>; required: string[];
    };
    expect(Object.keys(schema.properties).sort())
      .toEqual(['first_date_wording', 'second_date_wording']);
    // Both required: a comparison with one day is not a comparison.
    expect(schema.required.sort()).toEqual(['first_date_wording', 'second_date_wording']);
  });

  it('takes the days as the person said them, never as a computed date', () => {
    const schema = compare?.input_schema as { properties: Record<string, { description: string }> };
    expect(schema.properties.first_date_wording.description)
      .toMatch(/Never a date you calculated/);
  });

  it('says why the obvious alternative cannot work', () => {
    // Without this the model will keep reaching for get_day_records twice,
    // which is exactly what it did.
    expect(compare?.description).toMatch(/its answer ends the turn/);
    expect(compare?.description).toMatch(/the second day is simply lost/);
  });

  it('carries the phrasing the shop actually used', () => {
    expect(compare?.description).toMatch(/linganisha faida mauzo ya tarehe 17 na 23/);
  });

  it('leaves the single-day tool alone', () => {
    // get_day_records stays terminal. It is right for one day, and the reason
    // it is terminal has not changed.
    expect(dayRecords).toBeDefined();
    const schema = dayRecords?.input_schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(['date_wording']);
    const handler = webhook.indexOf("if (name === 'get_day_records')");
    expect(webhook.slice(handler, handler + 2400)).toContain('terminalReply: list');
  });
});

describe('who may ask, and what comes back', () => {
  const handler = webhook.slice(
    webhook.indexOf("if (name === 'get_day_comparison')"),
    webhook.indexOf("if (name === 'get_day_records')"),
  );

  it('is a company financial, gated like every other one', () => {
    expect(handler).toContain('if (!canReadCompanyReporting(identity.role))');
  });

  it('subtracts on the server, so the model never works a figure out', () => {
    // The grounding guard would refuse a figure no tool returned, and it would
    // be right to. The differences are handed over already done.
    expect(handler).toContain('const salesGap = Math.round(dayA.sales - dayB.sales);');
    expect(handler).toContain('const grossGap = Math.round(grossOf(dayA) - grossOf(dayB));');
    expect(handler).toContain('gross_profit_difference=');
    expect(handler).toContain('better_by_gross_profit=');
  });

  it('returns evidence rather than a finished answer', () => {
    // The whole point: not terminal, so the model can actually compare.
    const returns = handler.slice(handler.indexOf('return {\n      content: ['));
    expect(returns).not.toContain('terminalReply');
  });

  it('names gross profit as gross profit and keeps expenses separate', () => {
    expect(handler).toContain('gross profit is sales minus cost of goods sold');
    expect(handler).toContain('expenses=');
  });

  it('refuses a date it cannot read instead of answering a different day', () => {
    // buildDayCloseFacts throws unresolved_explicit_date rather than falling
    // back to today. Catching it must not turn that back into a silent today.
    expect(handler).toContain('Sijaelewa tarehe');
    expect(handler).toContain('An unreadable date is never answered with a different day.');
  });

  it('asks for the missing day rather than comparing a day with nothing', () => {
    expect(handler).toContain('Niambie siku zote mbili');
  });
});
