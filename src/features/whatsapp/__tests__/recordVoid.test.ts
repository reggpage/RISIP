import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type VoidTarget,
  voidChoiceQuestion,
  voidKindMatches,
} from '../../../../supabase/functions/_shared/whatsappVoid';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';

// TAKING BACK A MISTAKE, in any words.
//
// The undo existed, behind a regex that needed one of nine verbs AND one of a
// dozen nouns, and could only ever reach the LAST record. So "nimekosea"
// reached nothing at all, "ondoa manunuzi ya feni" reached the wrong entry,
// and a shopkeeper who had recorded two more sales since the mistake had no
// way back — on a ledger that is append-only by design, which makes the undo
// the only correction there is.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

const target = (over: Partial<VoidTarget> = {}): VoidTarget => ({
  id: 'r1', kind: 'sale', amount: 45_000, partyName: null, description: null,
  occurredAt: '2026-08-29T09:00:00Z',
  lines: [{ description: 'Birika', quantity: 3 }],
  ...over,
});

describe('pointing at a record by the kind of thing it is', () => {
  it('matches a purchase named without a product', () => {
    // "Futa manunuzi" is an ordinary way to point at something.
    expect(voidKindMatches('stock_purchase', 'ondoa manunuzi')).toBe(true);
    expect(voidKindMatches('stock_purchase', 'delete the purchase')).toBe(true);
  });

  it('does not match a different kind', () => {
    expect(voidKindMatches('sale', 'ondoa manunuzi')).toBe(false);
    expect(voidKindMatches('expense', 'futa deni')).toBe(false);
  });

  it('matches nothing on an empty or unknown wording', () => {
    expect(voidKindMatches('sale', '')).toBe(false);
    expect(voidKindMatches('not_a_kind', 'mauzo')).toBe(false);
  });
});

describe('when more than one record fits', () => {
  const said = voidChoiceQuestion([
    target({ id: 'a', amount: 45_000 }),
    target({ id: 'b', amount: 12_000, lines: [{ description: 'Sodaa', quantity: 2 }] }),
  ], 'sw');

  it('lists them and asks, rather than guessing', () => {
    // Picking one would be deleting money on a guess, and the trader is the
    // only person who knows which entry was the wrong one.
    expect(said).toContain('1.');
    expect(said).toContain('2.');
    expect(said).toContain('TSh 45,000');
    expect(said).toContain('TSh 12,000');
    expect(said).toMatch(/Niambie ni ipi/);
  });
});

describe('the tool, and the authority it does not have', () => {
  const tool = ASSISTANT_TOOLS.find((entry) => entry.name === 'propose_record_void');

  it('accepts the wording a shopkeeper actually uses', () => {
    expect(tool).toBeTruthy();
    expect(tool?.description).toMatch(/nimekosea/);
    expect(tool?.description).toMatch(/sikuuza sodaa leo/);
    expect(tool?.description).toMatch(/futa ile/);
  });

  it('takes the wording and nothing else', () => {
    // No id, so it cannot reach a record the trader did not point at. No
    // amount, so it cannot state a figure.
    const schema = tool?.input_schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(['target_wording']);
    const json = JSON.stringify(tool);
    for (const forbidden of ['"id"', '"amount"', '"confirmed"', '"company_id"']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('says out loud that it removes nothing', () => {
    expect(tool?.description).toMatch(/Nothing is removed by this call/i);
    // And what to do instead of editing, on a ledger that cannot be edited.
    expect(tool?.description).toMatch(/append-only/i);
    expect(tool?.description).toMatch(/a correction is a new entry, never an edit/i);
  });
});

describe('the parser that used to stand in front of it', () => {
  it('is gone from the message loop', () => {
    expect(webhook).not.toContain('parseVoidRequest');
    expect(webhook).toContain('"Futa ile" is propose_record_void now, not a regex');
  });

  it('kept every guard that mattered', () => {
    // The role check, the draft, and the human confirmation are unchanged —
    // only what decides WHICH record moved.
    expect(webhook).toContain('const denied = voidNotAllowed(lang);');
    expect(webhook).toContain("options: { kind: 'void_record', target: hits[0] } satisfies VoidPending");
    expect(webhook).toContain('await db.rpc(\'wa_void_daily_record\'');
  });

  it('still only ever drafts from the tool', () => {
    // The executor parks a pending state and returns a question. The write is
    // in the confirmation branch, where the trader's NDIYO reaches it.
    const at = webhook.indexOf("if (name === 'propose_record_void')");
    const branch = webhook.slice(at, at + 3600);
    expect(branch).toContain('voidConfirmation(hits[0], lang)');
    expect(branch).not.toContain('wa_void_daily_record');
  });
});
