import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';

// "RISITI" LEAVES THE CONVERSATION.
//
// The owner: "hii sio mambo ya risit tena ni records tu, risit ilikuwa ni
// mambo ya zamani, so popote katika chating engine isije ikaleta mada ya
// risiti kabisa."
//
// Thirty-nine strings across ten files said "risiti" back to a shopkeeper.
// They now say "rekodi", which is what the thing has been for a while.
//
// TWO THINGS ARE DELIBERATELY UNTOUCHED, and this test protects both.
//
// Input matchers keep the word. A shopkeeper who types "risiti" — and many
// will for a long time, because that is what they were taught — must still be
// understood. We changed what Risip SAYS, never what it hears. Withdrawing
// vocabulary somebody already learned is not a rename, it is a regression.
//
// Table names, storage buckets and edge-function names keep it too. Renaming
// those is a migration and an RLS surface, and no shopkeeper ever reads them.
//
// MEASURED, on the tools: get_my_receipts and get_receipt_details have been
// called ZERO times in 132 AI turns — because they were already hidden from
// the model by CONTRACTOR_TOOLS. Nothing had to be removed. That correction
// matters: the earlier claim that they were "two of thirty-six" was wrong.
// Twenty-eight tools are visible; thirty-six is the full list including eight
// that are never offered.

const sharedDir = resolve(process.cwd(), 'supabase/functions/_shared');
const sources = readdirSync(sharedDir)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name, text: readFileSync(resolve(sharedDir, name), 'utf8') }));

/** Swahili strings the shopkeeper actually receives, as `sw: '...'`. */
const swahiliReplies = sources.flatMap(({ name, text }) =>
  [...text.matchAll(/sw: *'([^']{4,})'/g)].map((hit) => ({ name, said: hit[1] })));

describe('nothing Risip says mentions a receipt', () => {
  it('finds Swahili replies to check at all', () => {
    // A guard on the guard: if the extraction breaks, the assertion below
    // passes vacuously and this whole file becomes decoration.
    expect(swahiliReplies.length).toBeGreaterThan(20);
  });

  it('has no "risiti" left in any Swahili reply', () => {
    const offenders = swahiliReplies.filter((row) => /risiti/i.test(row.said));
    expect(offenders.map((row) => `${row.name}: ${row.said.slice(0, 60)}`)).toEqual([]);
  });

  it('says "rekodi" in the places that used to say "risiti"', () => {
    const intent = sources.find((row) => row.name === 'whatsappIntent.ts')!.text;
    // The photo instruction that used to live in "msaada" is gone entirely —
    // help now leads with ordinary words, which is what most shops actually
    // use. What remains of the photo path still says rekodi.
    expect(intent).toContain('Sijajua mradi wa rekodi hii');
    expect(intent).toContain('Tafadhali tuma picha.');

    const setup = sources.find((row) => row.name === 'whatsappProjectSetup.ts')!.text;
    expect(setup).toContain('project ya kuhifadhi rekodi');
    expect(setup).toContain('Nachambua rekodi yako sasa');
  });

  it('drops it from the invite, where it described the job itself', () => {
    const invite = sources.find((row) => row.name === 'whatsappInvite.ts')!.text;
    expect(invite).not.toMatch(/risiti/);
  });
});

describe('what Risip still HEARS is unchanged', () => {
  // Changing these would withdraw vocabulary the shop has already learned.
  const keeps: Array<[string, string]> = [
    ['whatsappIntent.ts', "'risiti', 'risit'"],
    ['whatsappReadTools.ts', "'risiti zangu'"],
    ['whatsappStock.ts', 'wateja|risiti|pesa'],
    ['whatsappReadIntentAi.ts', 'bidhaa|risiti|matumizi'],
  ];

  for (const [file, fragment] of keeps) {
    it(`${file} still recognises the word on the way in`, () => {
      const source = sources.find((row) => row.name === file);
      expect(source).toBeDefined();
      expect(source!.text).toContain(fragment);
    });
  }

  it('keeps it as a knowledge keyword, so the old question still finds an answer', () => {
    const knowledge = sources.find((row) => row.name === 'risipKnowledge.ts')!.text;
    expect(knowledge).toContain("'risiti'");
  });
});

describe('the two receipt tools', () => {
  const shown = ASSISTANT_TOOLS.map((tool) => tool.name);

  it('are not offered to the model, and never were', () => {
    expect(shown).not.toContain('get_my_receipts');
    expect(shown).not.toContain('get_receipt_details');
  });

  it('leaves the visible surface at twenty-eight', () => {
    // The number the model actually sees. Thirty-six is the full list, eight
    // of which are hidden — a distinction that was got wrong once already.
    expect(shown).toHaveLength(28);
  });
});
