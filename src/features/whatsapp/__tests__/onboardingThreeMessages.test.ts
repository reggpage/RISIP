import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  businessReady,
  businessWelcome,
  firstProductsPrompt,
  workerOffer,
} from '../../../../supabase/functions/_shared/whatsappStarterExamples';

// THE WALL BECOMES THREE MESSAGES.
//
// MEASURED: businessWelcome is 899 characters over 30 lines, and it arrived the
// second somebody finished signing up. Everything in it is true and almost none
// of it was read — a person who has just answered five questions is not about
// to study a manual, and teaching everything on day one is how nothing is
// learned.
//
// Now: what Risip does (no question), the worker offer (a question), the first
// products (an instruction). 530 characters across three, and each one has a
// single job.
//
// The owner asked for all three by name: "kazi yake kwa bullets yani kitu kiwe
// proffessional and simple to use", "ai lazima imuulize mtu baada ya usajili
// kama anataka kumwalika mfanyakazi wake", and on the numbering, "kwenye
// commands words ziwe na number mtu achague… ili kuepusha kukosea kwa
// spellings".

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('message 6 — what Risip is for', () => {
  const said = businessReady('Neema', 'Duka la Neema', 'sw');

  it('names the shop and the person', () => {
    expect(said).toContain('*Duka la Neema*');
    expect(said).toContain('Karibu, Neema');
  });

  it('lists what Risip does, in bullets, with no syntax at all', () => {
    expect(said).toContain('• Kurekodi mauzo ya kila siku');
    expect(said).toContain('• Kukuambia faida yako');
    expect(said).not.toContain('@');
    expect(said).not.toMatch(/nauza \d/);
  });

  it('asks nothing, so it does not wait', () => {
    expect(said).not.toContain('?');
    expect(said).not.toMatch(/\*1\*/);
  });

  it('is short enough to be read', () => {
    expect(said.length).toBeLessThan(320);
  });
});

describe('message 7 — the worker offer', () => {
  const said = workerOffer('sw');

  it('is numbered, so nothing can be misspelled', () => {
    expect(said).toContain('*1* Ndiyo');
    expect(said).toContain('*2* Baadaye');
  });

  it('ends on its question and carries nothing after it', () => {
    // Kanuni 3. Underneath five bullets this reads as an afterthought.
    expect(said.trim().endsWith('*2* Baadaye')).toBe(true);
    expect(said.length).toBeLessThan(120);
  });
});

describe('message 8 — the one thing that is possible next', () => {
  const said = firstProductsPrompt('retail', null, 'sw');

  it('shows the shape with real examples, not a syntax table', () => {
    expect(said).toContain('moja kwa mstari');
    expect(said).toMatch(/_[^_]+@\d+ nauza \d+/);
  });

  it('explains the two symbols and stops', () => {
    expect(said).toContain('*@* ni bei ya kununua');
    expect(said).toContain('*nauza* ni bei ya kuuza');
  });

  it('mentions wholesale in one line without teaching it', () => {
    // The full lesson belongs where it is needed: the first time a product
    // genuinely has two prices.
    const jumla = said.split('\n').filter((line) => /jumla/.test(line));
    expect(jumla).toHaveLength(1);
  });

  it('points at help rather than listing every command', () => {
    expect(said).toContain('*msaada*');
    expect(said).not.toContain('dashboard');
    expect(said).not.toContain('ingia');
  });
});

describe('all three together', () => {
  it('are shorter than the single message they replace', () => {
    const now = businessReady('Neema', 'Duka la Neema', 'sw').length
      + workerOffer('sw').length
      + firstProductsPrompt('retail', null, 'sw').length;
    const before = businessWelcome('Neema', 'Duka la Neema', 'retail', null, 'sw').length;
    expect(before).toBeGreaterThan(850);
    expect(now).toBeLessThan(before);
  });
});

describe('how they are sent and answered', () => {
  it('sends 6 and parks 7, with no wait between them', () => {
    const branch = webhook.slice(
      webhook.indexOf('// THREE MESSAGES, NOT ONE WALL.'),
      webhook.indexOf('// THREE MESSAGES, NOT ONE WALL.') + 2200,
    );
    expect(branch).toContain('await sendReplyText(phone, businessReady(person, name, lang));');
    expect(branch).toContain("kind: 'onboarding_worker_offer'");
    expect(branch).toContain('return workerOffer(lang);');
  });

  it('carries the trade forward, so the product examples still fit the shop', () => {
    const branch = webhook.slice(
      webhook.indexOf('// THREE MESSAGES, NOT ONE WALL.'),
      webhook.indexOf('// THREE MESSAGES, NOT ONE WALL.') + 2200,
    );
    expect(branch).toContain('category: next.action.category ?? null,');
    expect(branch).toContain('subCategory: next.action.subCategory ?? null,');
  });

  it('reaches message 8 on either answer', () => {
    const branch = webhook.slice(
      webhook.indexOf('// ONBOARDING STEP 7 — the worker offer, answered.'),
      webhook.indexOf('// ONBOARDING STEP 7 — the worker offer, answered.') + 2600,
    );
    // One call, after the if/else, so both roads lead to it.
    expect((branch.match(/firstProductsPrompt\(/g) ?? [])).toHaveLength(1);
    expect(branch).toContain('The offer was a detour; products are');
  });

  it('accepts the number and the word, because both are what people send', () => {
    const branch = webhook.slice(
      webhook.indexOf('// ONBOARDING STEP 7 — the worker offer, answered.'),
      webhook.indexOf('// ONBOARDING STEP 7 — the worker offer, answered.') + 2600,
    );
    expect(branch).toContain('/^1$/.test(said)');
    expect(branch).toContain('ndiyo|ndio|yes');
    expect(branch).toContain('baadaye|later');
  });

  it('releases the question when the reply is about something else', () => {
    // Holding somebody hostage to a question they did not answer is how a
    // parked state eats a real message.
    const branch = webhook.slice(
      webhook.indexOf('// ONBOARDING STEP 7 — the worker offer, answered.'),
      webhook.indexOf('// ONBOARDING STEP 7 — the worker offer, answered.') + 2600,
    );
    expect(branch).toContain('Release the question rather');
  });
});
