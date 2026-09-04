import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPlansReply, buildSubscriptionReply } from '../../../../supabase/functions/_shared/whatsappReadTools';
import { RISIP_KNOWLEDGE, buildKnowledgeReply } from '../../../../supabase/functions/_shared/risipKnowledge';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const assistant = read('supabase/functions/_shared/whatsappAssistant.ts');
const webhook = read('supabase/functions/whatsapp-webhook/index.ts');

const facts = {
  planName: 'Kianzio', cycle: 'monthly' as const, status: 'active',
  priceTzs: 15000, allowance: 100, used: 57,
  windowStart: '2026-09-04', windowEnd: '2026-10-04',
  nextBillOn: '2026-10-04', trialEndsOn: null,
};

// THE MODEL MAY ONLY SAY WHAT A TOOL RETURNED.
//
// The grounding guard refuses any figure the evidence does not contain, so
// every number a shopkeeper could act on has to be computed here rather than
// left for the model to work out. "Umebakiza 43" is the one that matters: a
// model subtracting in its head is exactly where an invented figure comes from.

describe('what the shop is told about its own plan', () => {
  it('does the subtraction so the model never has to', () => {
    const reply = buildSubscriptionReply(facts, 'sw');
    expect(reply).toContain('43');
    expect(reply).toContain('57');
    expect(reply).toContain('100');
  });

  it('says how far over, rather than a negative remainder', () => {
    const reply = buildSubscriptionReply({ ...facts, used: 118 }, 'sw');
    expect(reply).toContain('umezidi kwa jumbe *18*'.replace('u', 'U'));
    expect(reply).not.toContain('-18');
  });

  it('reports zero left without going below zero', () => {
    const reply = buildSubscriptionReply({ ...facts, used: 100 }, 'sw');
    expect(reply).toContain('*0*');
    // A negative remainder, not any hyphen: the reply carries dates.
    expect(reply).not.toMatch(/\*-\d/);
    expect(reply).not.toMatch(/(^|\s)-\d/);
  });

  it('names the window, because the allowance is monthly even on a yearly plan', () => {
    const reply = buildSubscriptionReply({ ...facts, cycle: 'yearly', priceTzs: 150000 }, 'sw');
    expect(reply).toContain('kwa mwaka');
    expect(reply).toContain('2026-09-04');
    expect(reply).toContain('2026-10-04');
  });

  it('shows the trial instead of a bill while the free week runs', () => {
    const trial = buildSubscriptionReply(
      { ...facts, status: 'trialing', nextBillOn: null, trialEndsOn: '2026-09-11' }, 'sw');
    expect(trial).toContain('2026-09-11');
    expect(trial).not.toContain('Bili ijayo');
  });

  it('answers in the language the shop is using', () => {
    expect(buildSubscriptionReply(facts, 'en')).toContain('messages left');
    expect(buildSubscriptionReply(facts, 'sw')).toContain('Umebakiza');
  });
});

describe('the plans on offer', () => {
  const plans = [
    { name: 'Kianzio', monthlyTzs: 15000, yearlyTzs: 150000, allowance: 100, maxUsers: 1 },
    { name: 'Kubwa', monthlyTzs: 70000, yearlyTzs: 700000, allowance: 650, maxUsers: 10 },
  ];

  it('quotes every plan with its own price and allowance', () => {
    const reply = buildPlansReply(plans, 'sw');
    expect(reply).toContain('Kianzio');
    expect(reply).toContain('Kubwa');
    expect(reply).toContain('100');
    expect(reply).toContain('650');
  });

  it('says it could not load rather than inventing a price list', () => {
    expect(buildPlansReply([], 'sw')).toContain('Sikuweza');
  });
});

describe('what the knowledge base is allowed to hold', () => {
  it('explains how billing works', () => {
    const reply = buildKnowledgeReply('nimebakiza jumbe ngapi', 'sw');
    expect(reply.length).toBeGreaterThan(0);
    expect(RISIP_KNOWLEDGE.some((chunk) => chunk.topic === 'billing')).toBe(true);
  });

  it('holds no price at all, because a written price goes stale', () => {
    // The prices changed twice in one day while this was built. Anything a
    // shopkeeper could read as a current amount must come from the tool.
    const billing = RISIP_KNOWLEDGE.filter((chunk) => chunk.topic === 'billing');
    expect(billing.length).toBeGreaterThan(0);
    for (const chunk of billing) {
      for (const text of [chunk.sw, chunk.en]) {
        expect(text).not.toMatch(/\d[\d,]{3,}/);
        expect(text).not.toMatch(/TSh/);
      }
    }
  });

  it('names no plan and no allowance count, for the same reason', () => {
    const billing = RISIP_KNOWLEDGE.filter((chunk) => chunk.topic === 'billing');
    for (const chunk of billing) {
      for (const text of [chunk.sw, chunk.en]) {
        expect(text).not.toMatch(/Kianzio|Ndogo|Kati|Kubwa/);
      }
    }
  });
});

describe('the AI leads and no parser intercepts', () => {
  it('offers the tool to the model and tells it when to reach for it', () => {
    expect(assistant).toContain("'get_my_subscription'");
    expect(assistant).toContain('it asks about its plan, bill or allowance -> get_my_subscription');
  });

  it('forbids quoting a Risip price from memory', () => {
    expect(assistant).toContain('the plan, its price and messages left from get_my_subscription');
  });

  it('adds no regex that swallows the question before the model sees it', () => {
    // The rule the owner set: a parser handles a single word, a number or a
    // command; anything a person says in a sentence goes to the model. A
    // pattern matching "nimebakiza jumbe ngapi" would take the decision away
    // from the AI and break the moment somebody phrased it differently.
    const forbidden = [
      /jumbe\s*ngapi/i, /nimebakiza/i, /plan\s*yangu/i,
      /bili\s*yangu/i, /messages?\s*left/i, /my\s*plan/i,
    ];
    for (const pattern of forbidden) {
      expect(webhook).not.toMatch(new RegExp(`\\/[^\\n]*${pattern.source}[^\\n]*\\/`, 'i'));
      expect(assistant).not.toMatch(new RegExp(`\\/[^\\n]*${pattern.source}[^\\n]*\\/`, 'i'));
    }
  });

  it('gates the shop’s own bill to the owner while leaving prices open', () => {
    expect(webhook).toContain("if (String(identity.role ?? 'worker') !== 'owner')");
    expect(webhook).toContain('buildPlansReply');
  });
});

describe('reading the usage under a service role', () => {
  it('does not call the RPC that needs a user token', () => {
    // billing_usage_now resolves the company from the caller's JWT. The webhook
    // runs on the service role with no user token, so that RPC returns null and
    // every shop would have been told it had sent zero messages.
    const block = webhook.slice(webhook.indexOf("if (name === 'get_my_subscription')"), webhook.indexOf("if (name === 'get_stock_on_hand')"));
    // The CALL, not the name: the comment above it explains why that RPC is
    // the wrong one here, and naming it there is the point.
    expect(block).not.toContain("rpc('billing_usage_now'");
    expect(block).toContain("rpc('billing_usage_window'");
  });

  it('counts the messages live rather than trusting the nightly sweep', () => {
    const block = webhook.slice(webhook.indexOf("if (name === 'get_my_subscription')"), webhook.indexOf("if (name === 'get_stock_on_hand')"));
    expect(block).toContain("from('whatsapp_messages')");
    expect(block).toContain("count: 'exact'");
    expect(block).not.toContain("from('subscription_usage')");
  });

  it('scopes the count to this company and to the window', () => {
    const block = webhook.slice(webhook.indexOf("if (name === 'get_my_subscription')"), webhook.indexOf("if (name === 'get_stock_on_hand')"));
    // THE COUNT'S OWN CLAUSES, not the block's. company_id appears twice here,
    // once on the subscription lookup, and checking the block as a whole let an
    // unscoped count pass: it would have counted every shop's messages into
    // this one's remaining figure.
    const countQuery = block.slice(block.indexOf("from('whatsapp_messages')"));
    const statement = countQuery.slice(0, countQuery.indexOf(';'));
    expect(statement).toContain(".eq('company_id', identity.company_id)");
    expect(statement).toContain('windowStart');
    expect(statement).toContain('windowEnd');
  });
});
