import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A DEAD END IS NOT AN ANSWER.
//
// MEASURED, and it threw away nine products.
//
//   13:58  the owner is shown a nine-line stock count and asked to confirm it
//   14:28  the parked question expires — thirty minutes, to the minute
//   14:29  he answers by sending the same nine lines again
//   14:29  "Sina swali linalosubiri jibu kwa sasa. Niambie unachotaka kufanya."
//
// Telemetry: chosen_tool resolve_pending_clarification, outcome answered. The
// model saw the question still sitting in the conversation history, reasonably
// decided this message answered it, and called the tool. The server was
// correct that nothing was pending. What it did next was the fault — it
// replied that there was no question and stopped. His nine products were
// dropped and he was told nothing about them.
//
// Being right about the state is not the same as being useful. From where he
// stands he sent a list; he should get an answer about the list.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

const branch = webhook.slice(
  webhook.indexOf('  if (!pending) {'),
  webhook.indexOf('  if (!pending) {') + 2200,
);

describe('an expired question does not cost the shopkeeper their message', () => {
  it('hands the turn back to the model instead of ending it', () => {
    // No terminalReply is the whole fix: an isError result without one goes
    // back as a tool error and the loop runs another round.
    expect(branch).toContain('isError: true,');
    const upToReturn = branch.slice(branch.indexOf('return {'), branch.indexOf('isError: true,'));
    expect(upToReturn).not.toContain('terminalReply');
  });

  it('no longer replies with the dead end', () => {
    // The sentence survives inside the comment that records why it was
    // removed, so assert on the CODE form — a quoted string handed to a reply.
    expect(webhook).not.toContain("'Sina swali linalosubiri jibu kwa sasa. Niambie unachotaka kufanya.'");
    expect(webhook).not.toContain("'I am not waiting on an answer right now. Tell me what you would like to do.'");
  });

  it('tells the model to answer the message that is actually there', () => {
    expect(branch).toContain('Read their message again as a NEW');
  });

  it('tells the model not to apologise for a state the trader never saw', () => {
    // He sent a list. Explaining our expiry window to him is noise about our
    // internals, and it is what made the original reply useless.
    expect(branch).toContain('Do NOT tell the trader that');
    expect(branch).toContain('do not apologise for it');
  });

  it('records the measurement, including the one-minute margin', () => {
    expect(branch).toContain('ONE MINUTE before he replied');
  });
});

describe('askBack is still the right tool for a question we DID ask', () => {
  it('remains terminal, because a clarifying question must reach them verbatim', () => {
    const helper = webhook.slice(webhook.indexOf('const askBack ='), webhook.indexOf('const askBack =') + 160);
    expect(helper).toContain('terminalReply: question');
    expect(helper).toContain('isError: true');
  });
});
