import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_TOOLS,
  buildAssistantSystemPrompt,
  type AssistantIdentityContext,
} from '../../../../supabase/functions/_shared/whatsappAssistant';
import { ADVISOR_VOICE, advisorBrief } from '../../../../supabase/functions/_shared/whatsappAdvisor';

// STAGE D — Haiku is the brain, not the printer.
//
// The adviser block used to contain both halves of a contradiction. Its first
// rule said: "Returning the same three-section block whatever was asked is what
// makes an assistant feel like a machine, and the owner has said so." Three
// rules later it said: "Use exactly these three sections, in this order, with
// these headers", and named them. The concrete rule won every time, and the
// owner went on receiving the same MD brief whether he asked for a recap, a
// reason or a target.
//
// These tests hold the two halves apart: the model may choose how to speak, and
// may still not choose what is true.

const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const toolNamed = (name: string) => ASSISTANT_TOOLS.find((tool) => tool.name === name);

const context: AssistantIdentityContext = {
  identityId: 'i', profileId: 'p', companyId: 'c', companyName: 'Bucha ya Mfano',
  userName: 'Msimamizi', role: 'owner', lang: 'sw',
  approvalFlowEnabled: false, reversalEnabled: true, payoutsEnabled: false,
};
const prompt = buildAssistantSystemPrompt(context);
const everyDescription = ASSISTANT_TOOLS.map((tool) => tool.description).join('\n');

describe('nothing tells the model how to lay out an answer', () => {
  it('no longer mandates the three adviser headings', () => {
    for (const heading of ['Tathmini ya takwimu', 'Ushauri wa MD', 'Anza na hili']) {
      expect(ADVISOR_VOICE, `ADVISOR_VOICE still mandates ${heading}`).not.toContain(heading);
      expect(prompt, `the prompt still mandates ${heading}`).not.toContain(heading);
    }
    expect(ADVISOR_VOICE).not.toMatch(/use exactly these three sections/i);
    expect(ADVISOR_VOICE).not.toMatch(/that heading exactly/i);
  });

  it('no longer tells the model to copy a tool result', () => {
    // "The result carries the voice and format to answer in; follow it exactly"
    // was in get_business_advice's own description.
    expect(everyDescription).not.toMatch(/follow it exactly/i);
    expect(everyDescription).not.toMatch(/carries the voice and format/i);
    expect(prompt + everyDescription).not.toMatch(/use this exact format|use these headings|say exactly/i);
  });

  it('gives the adviser facts rather than a script', () => {
    expect(ADVISOR_VOICE).toContain('ADVISER FACTS');
    expect(ADVISOR_VOICE).toMatch(/These figures are EVIDENCE, not an answer/i);
  });

  it('keeps the deterministic brief for the outage path only', () => {
    // advisorBrief still renders the full three-section template, headings and
    // all. That is correct and deliberate: it is what the shop sees when Claude
    // cannot answer at all, and a fixed layout is better than silence.
    expect(typeof advisorBrief).toBe('function');
    const advisor = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/whatsappAdvisor.ts'), 'utf8',
    );
    expect(advisor).toContain('Tathmini ya takwimu');
    // It reaches the shop only as a fallback. The model gets the facts.
    expect(webhook).toContain('fallbackReply: advisorBrief(payload, lang)');
    expect(webhook).toContain('content: advisorEvidence(payload)');
  });
});

describe('a rendered sentence is a fallback, not an answer', () => {
  it('stopped terminating the model on ordinary successful reads', () => {
    // A terminalReply on a success path hands the shop a pre-written line and
    // stops the model reasoning, so two different questions got one paragraph.
    for (const rendered of [
      'return { content: reply, fallbackReply: reply };',
      'return { content: result.text, fallbackReply: result.text };',
    ]) {
      expect(webhook, rendered).toContain(rendered);
    }
    expect(webhook).not.toContain('return { content: reply, terminalReply: reply };');
    expect(webhook).not.toContain('return { content: result.text, terminalReply: result.text };');
  });

  it('keeps terminalReply where the wording is the protocol', () => {
    // A permission refusal or a save failure must not be softened into
    // something reassuring by a model that did not see the error.
    expect(webhook).toContain('return { content: denied, isError: true, terminalReply: denied };');
    expect(webhook).toContain('return { content: failed, isError: true, terminalReply: failed };');
  });
});

describe('summary and advice stopped being the same question', () => {
  it('describes the summary tool by what it reports', () => {
    const summary = toolNamed('get_business_summary')?.description ?? '';
    expect(summary).toMatch(/WHAT HAPPENED/);
    expect(summary).toMatch(/A summary is not a review: it reports, it does not recommend/i);
    // The phrase list that pulled recaps into adviser mode is gone.
    expect(summary).not.toMatch(/biashara yangu ikoje|nipe ushauri|nifanye nini/);
  });

  it('describes the adviser tool by the decision it supports', () => {
    const advice = toolNamed('get_business_advice')?.description ?? '';
    expect(advice).toMatch(/WHAT TO DO/);
    expect(advice).toMatch(/evidence, not an answer/i);
    expect(advice).not.toMatch(/“nipe ushauri”, “biashara yangu ikoje”/);
  });
});

describe('the metric is the question', () => {
  it('says plainly which of the three a trader is asking for', () => {
    const performance = toolNamed('get_product_performance')?.description ?? '';
    expect(performance).toMatch(/THE METRIC IS THE QUESTION/);
    expect(performance).toMatch(/quantity is HOW MANY/);
    expect(performance).toMatch(/revenue is HOW MUCH MONEY/);
    // MEASURED: a question about a product's sales came back as "62 vipande".
    // The repair was a DEFAULT, not a trigger word: "mauzo" carries both senses
    // in Swahili, and a shopkeeper asking about their own sales usually means
    // the takings. Naming the thing being counted is what switches it.
    expect(performance).toMatch(/WHEN IN DOUBT IT IS MONEY/);
    expect(performance).toMatch(/does not name a counting word is revenue/i);
    expect(performance).toMatch(/a different question answered confidently/i);
  });

  it('teaches the concept without teaching the sentences', () => {
    const performance = toolNamed('get_product_performance')?.description ?? '';
    // "shingapi" must not appear as a trigger word anywhere. Fixing a failed
    // sentence by adding that sentence is the habit this programme removed.
    expect(performance).not.toMatch(/shingapi/i);
    expect(prompt).not.toMatch(/shingapi/i);
  });
});

describe('the financial boundary did not move', () => {
  it('still forbids the model inventing any business figure', () => {
    expect(prompt).toMatch(/Never invent money, quantities, statuses, people, products, dates or balances/i);
    expect(ADVISOR_VOICE).toMatch(/Every number must come from the tool result/i);
  });

  it('still refuses to let the model price, confirm or choose a company', () => {
    const schemas = JSON.stringify(ASSISTANT_TOOLS.map((tool) => tool.input_schema));
    for (const forbidden of ['"price"', '"unit_price"', '"confirmed"', '"company_id"', '"role"', '"balance"']) {
      expect(schemas).not.toContain(forbidden);
    }
    expect(prompt).toMatch(/Never claim a record is saved or confirmed until the server says so/i);
  });

  it('still separates history from a price that is still wrong', () => {
    // Telling somebody to raise a price they already raised is how an adviser
    // loses a shopkeeper's trust.
    expect(ADVISOR_VOICE).toMatch(/TWO DIFFERENT FACTS, TWO DIFFERENT TENSES/);
  });
});

describe('the prompt got shorter, not longer', () => {
  it('holds the policy manual under a budget', () => {
    // 18,655 characters before Stage D. Attention spent matching a manual is
    // attention not spent on the trader's sentence.
    //
    // Raised by 250 once, deliberately: the rule about quoting a figure exactly
    // rather than rounding it fixes a measured failure — "about 3.1M" is a
    // different number from 3,121,150 and the shop cannot check it. A ceiling
    // that never moves for a real fix is a ceiling that gets ignored; one that
    // moves without a reason is not a ceiling.
    expect(prompt.length).toBeLessThan(17_750);
  });

  it('states the loss/cheapest/missing-price distinction once', () => {
    const stated = (prompt.match(/get_products_missing_selling_price/g) ?? []).length;
    // Once in the consolidated rule, once in the tool table. Not four times.
    expect(stated).toBeLessThanOrEqual(2);
  });
});
