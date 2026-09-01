import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assistantFailureMessage,
  classifyAssistantFailure,
} from '../../../../supabase/functions/_shared/whatsappAssistant';

// CLAUDE ANSWERS, OR RISIP SAYS IT COULD NOT.
//
// MEASURED, from the owner's own screen. He asked:
//
//     Biashara inaendaje so far
//
// waited about two minutes, and received this:
//
//     Muhtasari wa mwezi huu:
//     Mauzo yote: TSh 3,121,150
//     ...
//
// The figures were right. It was still the wrong thing to send, because it went
// out AS IF it were the assistant's answer. humanFallback() gathered each
// tool's own prose whenever the model could not finish — out of tool rounds, or
// having stated a figure no tool returned — and sent it under the assistant's
// name. A shopkeeper cannot tell that apart from thinking, so every time it
// happened quietly an infrastructure failure was billed to the product's
// intelligence instead of being fixed.
//
// There are two honest outcomes now and no third one that looks like a third
// kind of answer.

const assistant = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/whatsappAssistant.ts'), 'utf8');
const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

/** Executable lines only: the comments quote the removed machinery on purpose. */
const code = (source: string) => source
  .split(/\r?\n/)
  .filter((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
  })
  .join('\n');

describe('no business prose can stand in for an answer', () => {
  it('has no humanFallback left to gather it', () => {
    expect(code(assistant)).not.toContain('humanFallback');
    expect(code(assistant)).not.toContain('looksLikeProse');
  });

  it('never reports a safe fallback, because there is none', () => {
    // The field survives only so this can be asserted. Every return path sets
    // it false; nothing sets it true.
    expect(code(assistant)).not.toContain('usedSafeFallback: true');
    expect(code(assistant)).toContain('usedSafeFallback: false');
  });

  it('fails the turn when the model runs out of rounds', () => {
    const branch = assistant.slice(assistant.indexOf('if (round >= MAX_TOOL_ROUNDS)'));
    expect(branch.slice(0, 900)).toContain("args.onFailure?.('tool_round_limit')");
    expect(branch.slice(0, 900)).toContain('unavailable: true');
  });

  it('fails the turn when the model states a figure no tool returned', () => {
    const branch = assistant.slice(assistant.indexOf('if (ungrounded.length > 0 || unsafeProfitWording.length > 0 || falseDateCaveat.length > 0)'));
    // The code now carries the SHAPE of the refused token — digit-widths, never
    // the value — because "deferred for safety" three times in a row named the
    // symptom and not one thing that would fix it. Still one failure, still no
    // answer: what changed is that the next one is diagnosable.
    // One corrective round comes first now — the model is told which figure
    // was refused and asked to answer inside the evidence. If it repeats
    // itself the turn still dies, and the shop is still told so.
    expect(branch.slice(0, 4600)).toContain('if (corrections === 0)');
    expect(branch.slice(0, 4600)).toContain('model_ungrounded_number:');
    expect(branch.slice(0, 4600)).toContain('args.onFailure?.(');
    expect(branch.slice(0, 4600)).toContain('unavailable: true');
  });

  it('records the refused figure as digits-wide, never as a figure', () => {
    // rejection_code is capped at 64 characters and this is why it may hold a
    // shape at all: "1x7" is one seven-digit token. A price, a balance or a
    // total cannot be reconstructed from a width.
    const at = assistant.indexOf('const widths = ungrounded.map');
    const branch = assistant.slice(at, at + 1400);
    // Widths are counted for telemetry; the tokens themselves are not written
    // into the failure code.
    expect(branch).toContain('token.replace');
    expect(branch).toContain('widths.filter');
    expect(branch).not.toContain('model_ungrounded_number:${ungrounded}');
    expect(branch).not.toContain('model_ungrounded_number:${ungrounded.join');
    expect(webhook).toContain("rejectionCode: assistantFailure?.startsWith('model_ungrounded_number:')");
  });

  it('tells the shop which honest thing went wrong', () => {
    expect(webhook).toContain('assistantClarificationQuestion(lang, body, pendingClarificationOf(convo))');
    expect(webhook).toContain('await replyQuietly(phone, failureReply, false);');
    expect(webhook).toContain('classifyAssistantFailure(assistantFailure)');
  });
});

describe('the failure is classified, never guessed', () => {
  it('separates the reasons that need different answers', () => {
    expect(classifyAssistantFailure('provider_timeout')).toBe('provider_timeout');
    expect(classifyAssistantFailure('provider_network_error')).toBe('network_failure');
    expect(classifyAssistantFailure('provider_503_overloaded_error')).toBe('provider_5xx');
    expect(classifyAssistantFailure('tool_loop_exhausted')).toBe('tool_round_limit');
    expect(classifyAssistantFailure('turn_deadline_exceeded')).toBe('runtime_deadline');
    expect(classifyAssistantFailure('missing_api_key')).toBe('missing_api_key');
  });

  it('calls our own broken schema what it is', () => {
    // MEASURED: a nullable enum returned 400 on EVERY conversational call for a
    // day. It looked like a stupid model. It was our tool definition.
    expect(classifyAssistantFailure('provider_400_invalid_request_error_tools.12.custom'))
      .toBe('invalid_tool_schema');
    expect(classifyAssistantFailure('provider_401_authentication_error')).toBe('provider_4xx');
  });

  it('says unknown rather than inventing a cause', () => {
    // Nothing here claims a worker was evicted. That was never proven, and a
    // label that invents a cause is worse than one that admits ignorance.
    expect(classifyAssistantFailure('something_new')).toBe('unknown');
    expect(classifyAssistantFailure(null)).toBe('unknown');
    expect(code(assistant)).not.toContain('worker_evict');
  });
});

describe('what the shop is actually told', () => {
  it('says a slow answer was slow', () => {
    expect(assistantFailureMessage('provider_timeout', 'sw')).toMatch(/muda mrefu/i);
    expect(assistantFailureMessage('runtime_deadline', 'sw')).toMatch(/muda mrefu/i);
  });

  it('says a usage limit is a usage limit', () => {
    expect(assistantFailureMessage('ai_budget_block', 'sw')).toMatch(/kikomo/i);
  });

  it('separates "I could not read your data" from "I could not think"', () => {
    expect(assistantFailureMessage('tool_execution_failure', 'sw')).toMatch(/Nimeelewa ombi lako/i);
  });

  it('exposes no stack trace, status code, key or provider name', () => {
    for (const failure of [
      'provider_timeout', 'provider_5xx', 'provider_4xx', 'invalid_tool_schema',
      'model_empty', 'tool_round_limit', 'ai_budget_block', 'network_failure',
      'runtime_deadline', 'unknown',
    ] as const) {
      for (const lang of ['sw', 'en'] as const) {
        const message = assistantFailureMessage(failure, lang);
        expect(message.length, `${failure}/${lang}`).toBeGreaterThan(20);
        expect(message, failure).not.toMatch(/anthropic|claude-|sk-ant|http|\b[45]\d\d\b|stack|schema|null/i);
      }
    }
  });

  it('never returns a business figure or a report heading', () => {
    for (const failure of ['provider_timeout', 'tool_round_limit', 'unknown'] as const) {
      const message = assistantFailureMessage(failure, 'sw');
      expect(message).not.toMatch(/Muhtasari|Mauzo yote|Tathmini|Ushauri wa MD/);
      expect(message).not.toMatch(/TSh|\d{3,}/);
    }
  });
});

describe('a deadline exists at all, which it did not', () => {
  it('bounds one provider call', () => {
    // Raised from twenty on a measurement. The same request, twice: a cold
    // isolate with a cold cache took 22.9s and the warm repeat took 1.1s, so
    // twenty guaranteed that the FIRST message after an idle spell was aborted
    // and the shop was told Risip took longer than usual for something nobody
    // could avoid. Thirty still bounds a hung provider.
    expect(assistant).toContain('const CALL_DEADLINE_MS = 30_000;');
    expect(assistant).toContain('new AbortController()');
    expect(assistant).toContain('abort.signal');
  });

  it('bounds the whole turn', () => {
    // Still comfortably more than a real turn: round 0 is about a second warm,
    // and Sonnet writing the answer is 7-13s depending on its length.
    expect(assistant).toContain('const TURN_DEADLINE_MS = 60_000;');
    expect(assistant).toContain("args.onFailure?.('turn_deadline_exceeded')");
  });

  it('says why the ceiling moved, so the next person does not lower it', () => {
    expect(assistant).toContain('cold isolate, cold cache   22.9s');
    expect(assistant).toContain('warm, identical bytes       1.1s');
  });

  it('calls an aborted request a timeout, and only then', () => {
    // "Timeout" is used where a deadline actually fired. A network error that
    // is not an abort keeps its own name, because the two would justify
    // different responses.
    expect(assistant).toContain("error.name === 'AbortError'");
    expect(assistant).toContain("args.onFailure?.(aborted ? 'provider_timeout' : 'provider_network_error')");
  });
});

describe('nothing retries blindly', () => {
  it('makes no automatic retry at all', () => {
    // Measured before changing anything: there were never retries here — the
    // loop counts TOOL ROUNDS, not attempts. So no credit is being spent
    // re-asking a provider that just refused, and none is added here.
    expect(code(assistant)).not.toMatch(/for \(let attempt/);
    expect(code(assistant)).not.toMatch(/retr(y|ies)\s*[<>=+]/);
    expect(assistant).toContain('for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1)');
  });
});
