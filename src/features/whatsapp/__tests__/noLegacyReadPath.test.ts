import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  languageCommandRemainder,
  parseLanguageCommand,
} from '../../../../supabase/functions/_shared/whatsappIntent';

// THE PARSER THAT WAS STILL STANDING IN FRONT OF CLAUDE.
//
// MEASURED, on the owner's own number, and he found it before any check did.
// He asked "niambie siku gani biashara ilifanya vizuri" and received today's
// summary — every line TSh 0 — in the flat voice this programme spent weeks
// removing. Telemetry had no row for the turn at all, because the model was
// never called: a legacy semantic-read path was reading his business language
// with its own classifier and answering from a fixed renderer, behind an
// "!aiEligible" guard nobody looked at again.
//
// Two faults, one after the other. The message that put him there was
// "tumia kiswahili na uniambie siku gani biashara ilifanya vizuri" — an
// instruction AND a question. parseLanguageCommand matched, the whole sentence
// was filed as a system command, and the question was thrown away.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('a language instruction may not swallow the question after it', () => {
  it('keeps what was asked alongside the instruction', () => {
    expect(languageCommandRemainder('tumia kiswahili na uniambie siku gani biashara ilifanya vizuri'))
      .toBe('uniambie siku gani biashara ilifanya vizuri');
    expect(languageCommandRemainder('change to english and show me my debts'))
      .toBe('show me my debts');
  });

  it('leaves a bare language command exactly as it was', () => {
    // The common case, and it must keep behaving identically: change the
    // language, say so, and stop.
    for (const said of ['tumia kiswahili', 'kiswahili tafadhali', 'change to english']) {
      expect(parseLanguageCommand(said)).toBeTruthy();
      expect(languageCommandRemainder(said)).toBeNull();
    }
  });

  it('does not mistake a second way of asking for the language as a question', () => {
    expect(languageCommandRemainder('tumia kiswahili na jibu kwa kiswahili')).toBeNull();
  });

  it('re-reads the intent after the instruction is taken off', () => {
    // Rewriting the body without rewriting the intent fixes half the bug: the
    // intent still said change_language, which is what put the message into
    // systemCommand and kept the model away from it.
    expect(webhook).toContain('let intent = routeFor(body);');
    expect(webhook).toContain('          intent = routeFor(body);');
  });
});

describe('nothing answers business language except the model', () => {
  it('has no legacy semantic-read path left', () => {
    expect(webhook).not.toContain('shouldInterpretReadWithAi');
    expect(webhook).not.toContain('interpretReadIntentWithAi');
    expect(webhook).not.toContain('semantic_read_ai');
  });

  it('no longer carries its templated apology', () => {
    // This sentence is what the owner actually received, and it told him
    // nothing he could act on.
    expect(webhook).not.toContain('Sijaelewa vizuri swali hilo la biashara');
    expect(webhook).not.toContain('I did not fully understand that business question');
  });

  it('says why nothing replaced it', () => {
    // A business question arriving here without being eligible is a routing
    // bug. It should look like one rather than be papered over.
    expect(webhook).toContain('REMOVED: the legacy semantic-read path');
    expect(webhook).toContain('Nothing takes its place on purpose');
  });

  it('keeps readOnlyToolReply, which the model itself uses', () => {
    // The renderer was never the problem — the classifier in front of it was.
    // The assistant's own tools still read through this.
    expect(webhook).toContain('async function readOnlyToolReply(');
    expect(webhook).toMatch(/await readOnlyToolReply\(db, identity, \{ tool: 'ai_business_summary_facts'/);
  });
});
