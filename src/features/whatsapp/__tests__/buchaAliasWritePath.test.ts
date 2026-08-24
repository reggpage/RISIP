import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeProductReadResolution } from '../../../../supabase/functions/_shared/whatsappProductResolver';

// PHASE 3 HARDENING.
//
// The phase 3 report claimed aliases resolved. At SQL level that was true; the
// migration was right and the rolled-back database test passed. End to end
// through the edge function it was false, and the reason is in this file.

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');

const aliasRow = {
  product_key: 'chakula cha mbwa',
  product_name: 'Chakula cha mbwa',
  match_kind: 'alias',
  match_score: 1.0,
  ambiguous: false,
};

describe('an alias survives into TypeScript', () => {
  // MEASURED FAILURE, mine: wa_resolve_company_product_read returned
  // match_kind 'alias', and rowToMatch accepted only exact / trailing_vowel /
  // noun_class / trigram. Every alias row was dropped and the resolution came
  // back "not_found", so no alias worked anywhere in the edge function.
  it('is not discarded by the row validator', () => {
    const resolution = normalizeProductReadResolution([aliasRow], 'za mbwa');
    expect(resolution.kind).toBe('matched');
    if (resolution.kind !== 'matched') return;
    expect(resolution.match.productName).toBe('Chakula cha mbwa');
    expect(resolution.match.productKey).toBe('chakula cha mbwa');
    expect(resolution.match.matchKind).toBe('alias');
  });

  it('still rejects a match kind the database should never send', () => {
    expect(normalizeProductReadResolution(
      [{ ...aliasRow, match_kind: 'vibes' }], 'za mbwa').kind).toBe('not_found');
  });
});

describe('read and write resolution are the same path', () => {
  it('has exactly one product-resolution RPC call in the whole webhook', () => {
    // If a second one ever appears, aliases will work in one place and not the
    // other, which is the failure this test exists to prevent.
    expect(webhook.split("db.rpc('wa_resolve_company_product_read'").length - 1).toBe(1);
  });

  it('sends the write resolver through the read resolver first', () => {
    expect(webhook).toContain('async function resolveProductForWrite(');
    expect(webhook).toContain('const direct = await resolveProductForRead(db, identity, asked);');
    // The near-name fallback only runs when the alias-aware path found nothing.
    expect(webhook).toContain("if (direct.resolution.kind !== 'not_found') return direct.resolution;");
  });
});

describe('a drafted line carries the catalogue name, not the shop’s word', () => {
  // A fully-priced sale writes the words the trader typed straight onto its
  // lines. Without this step "za mbwa kilo 3 kwa 6000" would create a second
  // product literally called "za mbwa", beside the real one, splitting its
  // history in half.
  it('canonicalises alias lines in the one drafting helper', () => {
    expect(webhook).toContain('async function canonicaliseAliasLines(');
    expect(webhook).toContain('const canonical = await canonicaliseAliasLines(db, identity, record);');
    expect(webhook).toContain('p_lines: canonical.lines,');
  });

  it('rewrites ONLY exact aliases, leaving every other vertical alone', () => {
    // A chips shop writing "chipsi" still records "chipsi" and still gets the
    // near-name warning it has always had.
    expect(webhook).toContain("resolved.resolution.match.matchKind === 'alias'");
    expect(webhook).not.toContain("matchKind === 'trigram'");
  });

  it('does it in one place rather than inside each parser', () => {
    expect(webhook.split('canonicaliseAliasLines(').length - 1).toBe(2);
  });
});

describe('the alias cannot become a product Claude invented', () => {
  it('resolves the stock-loss product through the shared resolver', () => {
    expect(webhook).toContain('await resolveProductForRead(db, identity, lossReading.product)');
    // The canonical name from the catalogue is what reaches the ledger line.
    expect(webhook).toContain('description: match.productName,');
  });

  it('keeps the model’s proposals subject to the same validation', () => {
    expect(webhook).toContain('const parsed = validateAiCandidate(input, said);');
  });
});

describe('permission is checked when it is taught and again when it is saved', () => {
  it('refuses a worker before any pending state is written', () => {
    const handler = webhook.slice(webhook.indexOf('const teaching = parseVocabularyTeaching(writeBody);'));
    const roleCheck = handler.indexOf("if (!['owner', 'accountant'].includes(identity.role))");
    const upsert = handler.indexOf("awaiting: 'product_cost',");
    expect(roleCheck).toBeGreaterThan(-1);
    expect(upsert).toBeGreaterThan(roleCheck);
  });

  it('re-derives the role at save time from the phone, not from the pending row', () => {
    // The structural guarantee: wa_save_business_term takes p_phone and looks
    // the identity, company and role up again. A pending conversation cannot
    // carry an authorisation with it.
    const migration = src('supabase/migrations/0124_business_vocabulary.sql');
    expect(migration).toContain('where i.phone_e164 = p_phone and i.revoked_at is null');
    expect(migration).toContain("if v_role not in ('owner', 'accountant') then");
    expect(webhook).toContain('p_phone: phone,');
  });

  it('scopes the pending conversation to one identity', () => {
    expect(webhook).toContain("{ onConflict: 'identity_id' }");
  });
});
