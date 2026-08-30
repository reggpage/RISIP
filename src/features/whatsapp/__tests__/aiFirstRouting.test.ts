import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PARSERS_BEHIND_CLAUDE,
  answersPendingQuestion,
} from '../../../../supabase/functions/_shared/whatsappRouting';

// AI-FIRST ROUTING, AS AN INVARIANT RATHER THAN AN INTENTION.
//
// The architecture has claimed to be AI-first since Stage A while two
// deterministic parsers still stood in front of the model:
//
//   && !parseBareQuantityList(body)
//   && !(deterministicBatch.kind === 'parsed' && records.length > 1)
//
// MEASURED. A shop sent:
//
//   Feni 7
//   Nguvu 6
//   Antoni 4
//
// and Haiku never saw it. A parser counted the quantities, asked MAUZO or
// MANUNUZI, and when "Antoni" did not match "Anton wa Padua" letter for letter
// the shop was offered a NEW PRODUCT registration for a product it already
// sells. Two personalities in one product, and no way for a shopkeeper to know
// which one they were about to get.
//
// These tests hold the line where it belongs: security and transport in front,
// the ANSWER to a question Risip itself asked in front, and everything else —
// every sentence that carries meaning — to the model.

const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

/** The eligibility gate, sliced out so assertions are about routing only. */
// The eligibility test is one call now: messageGoesToModel, named once in the
// router so every branch asks the same question. What used to be inline here is
// asserted against that function instead.
const gate = webhook.slice(
  webhook.indexOf('const aiEligible = messageGoesToModel'),
  webhook.indexOf('let messageRoute'),
);
const routing = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/whatsappRouting.ts'), 'utf8');

describe('nothing that reads business language stands in front of Claude', () => {
  it('has a gate to test at all', () => {
    expect(gate).toContain('messageGoesToModel(convo, body, systemCommand)');
    expect(routing).toContain('export function messageGoesToModel');
  });

  it('consults no business parser before the model', () => {
    const predicate = routing.slice(
      routing.indexOf('export function messageGoesToModel'),
      routing.indexOf('export const PARSERS_BEHIND_CLAUDE'),
    );
    for (const parser of PARSERS_BEHIND_CLAUDE) {
      expect(gate, `${parser} still gates the model`).not.toContain(parser);
      expect(predicate.slice(0, 900), `${parser} is in the predicate`).not.toContain(parser);
    }
  });

  it('keeps only security, transport and protocol answers in front', () => {
    // Each of these is a system command or an exact state answer. None of them
    // is a sentence about the business.
    // They moved into systemCommand, hoisted above every branch so nothing
    // below can consume a message the model was going to read.
    const command = webhook.slice(webhook.indexOf('const systemCommand = isSwitchRequest(body)'));
    for (const allowed of [
      'isSwitchRequest', 'isLoginRequest', 'parseLanguageCommand',
      'cancel_action', 'change_language',
      'isDailyRecordConfirmation', 'isDailyRecordRejection',
    ]) {
      expect(command.slice(0, 600), `${allowed} should still guard the model`).toContain(allowed);
    }
    expect(routing).toContain('!answersPendingQuestion(convo, said)');
  });

  it('no longer lets any parked conversation hold a new sentence', () => {
    // The old gate was `(!convo || convo.awaiting === 'product_analytics')`,
    // so ANY parked state — a half-finished price band, a quantity question —
    // sent the next message to the parsers whatever it said.
    expect(gate).not.toContain("convo.awaiting === 'product_analytics'");
  });
});

describe('an answer to a question Risip asked stays deterministic', () => {
  it('owns yes, no and cancel on a drafted record', () => {
    // Semantic drift on the one step that writes to a ledger is not worth the
    // intelligence it would buy.
    const drafted = { awaiting: 'payment_source', options: {} };
    for (const said of ['ndiyo', 'NDIYO', 'hapana', 'yes', 'no']) {
      expect(answersPendingQuestion(drafted, said), said).toBe(true);
    }
  });

  it('no longer owns a band answer — that is language', () => {
    // "Reja", "rejarej", "jumla" are things a person says. Code was reading
    // them, so a shop met a language model when it opened a subject and a
    // regular expression when it answered the follow-up. The model reads them
    // now and returns them through resolve_pending_clarification.
    const band = { awaiting: 'product_cost', options: { choices: [{ productName: 'nyama' }] } };
    for (const said of ['jumla', 'rejareja', 'reja', 'rejarej', 'jumlla']) {
      expect(answersPendingQuestion(band, said), said).toBe(false);
    }
  });

  it('no longer owns a quantity answer — that is language too', () => {
    const quantity = { awaiting: 'daily_record_quantity', options: {} };
    for (const said of ['5', 'tano', 'thelathini', 'mbili na nusu', 'kilo tatu']) {
      expect(answersPendingQuestion(quantity, said), said).toBe(false);
    }
  });

  it('still owns yes and no on top of a parked question', () => {
    // The one bypass that survives, in every parked state that can carry a
    // draft: drift on the step that writes to a ledger is not worth it.
    const band = { awaiting: 'product_cost', options: { choices: [] } };
    expect(answersPendingQuestion(band, 'ndiyo')).toBe(true);
    expect(answersPendingQuestion(band, 'hapana')).toBe(true);
  });

  it('owns the destructive confirmations outright', () => {
    // A wrong reading here deletes an account or ends a session.
    for (const awaiting of ['logout_confirm', 'account_delete_confirm']) {
      expect(answersPendingQuestion({ awaiting, options: {} }, 'chochote'), awaiting).toBe(true);
    }
  });
});

describe('changing the subject escapes the pending question', () => {
  it('lets a new business message out of a band question', () => {
    // Asked "Rejareja au jumla?" and answered with something else entirely.
    // That is a new sentence, and new sentences go to the model.
    const band = { awaiting: 'product_cost', options: { choices: [{ productName: 'nyama' }] } };
    for (const said of [
      'leo nimeuza shingapi',
      'bidhaa gani imeuza zaidi',
      'nimeuza daftari tatu',
    ]) {
      expect(answersPendingQuestion(band, said), said).toBe(false);
    }
  });

  it('lets a correction out of a quantity question', () => {
    const quantity = { awaiting: 'daily_record_quantity', options: {} };
    for (const said of ['namaanisha anton', 'sio hiyo, ile ya hisense', 'nilimaanisha nguvu ya sala']) {
      expect(answersPendingQuestion(quantity, said), said).toBe(false);
    }
    // "Acha" is not a topic switch — it is a cancel, and it belongs to the
    // deterministic path for the same reason NDIYO does.
    expect(answersPendingQuestion(quantity, 'acha kabisa')).toBe(true);
    // And the answers themselves now go to the model.
    expect(answersPendingQuestion(quantity, 'thelathini')).toBe(false);
  });

  it('holds nothing when nothing was asked', () => {
    expect(answersPendingQuestion(null, 'nimeuza daftari tatu')).toBe(false);
    expect(answersPendingQuestion({ awaiting: 'product_analytics' }, 'ndiyo')).toBe(false);
    expect(answersPendingQuestion({ awaiting: 'payment_source' }, '')).toBe(false);
  });
});

describe('the messages that used to be taken from the model', () => {
  // §12 of the correction, as executable coverage. Each of these is ordinary
  // business language and must be eligible for the model: no parked state, no
  // system command, no yes/no.
  const ORDINARY = [
    'nimeuza daftari tatu',
    'chakula 20000 nauli 5000',
    'Feni 7\nNguvu 6\nAntoni 4',
    'leo nimeuza daftari 7 na punch 3 pia nimenunua feni 4 kwa 120000',
    'Matumizi ya leo chakula 20,000 nauli 5000',
    'bidhaa gani imeuza zaidi',
    'leo nimeuza shingapi',
    'namaanisha anton',
  ];

  it('are all ordinary language, not protocol answers', () => {
    for (const said of ORDINARY) {
      expect(answersPendingQuestion(null, said), said).toBe(false);
      // And still ordinary language even while a question is parked.
      expect(
        answersPendingQuestion({ awaiting: 'product_cost', options: { choices: [] } }, said),
        `${said} (with a band question parked)`,
      ).toBe(false);
    }
  });
});

describe('the route is visible', () => {
  it('names the three routes and records them', () => {
    expect(webhook).toContain("let messageRoute: MessageRoute = aiEligible ? 'ai_primary' : 'pending_protocol'");
    // Every path where the model did not serve the message marks itself, so a
    // month of quiet fallbacks cannot read like a month of healthy traffic.
    expect((webhook.match(/messageRoute = 'ai_outage_fallback'/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(webhook).toContain('p_route: messageRoute');
  });

  it('bounds the column to those three values', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/0143_ai_interpretation_route.sql'), 'utf8',
    );
    expect(migration).toContain("route in ('ai_primary', 'pending_protocol', 'ai_outage_fallback')");
    // One signature, not a silent overload writing rows with no route.
    expect(migration).toContain('drop function if exists public.wa_record_ai_interpretation(');
  });
});

describe('the parsers survive as the outage answer', () => {
  it('is still possible to record a sale when the model is unreachable', () => {
    // Deleting them would mean a shop cannot write down a sale during an
    // Anthropic outage. They keep their place — behind the model, not in front.
    for (const parser of ['parseDailyRecord', 'parseStockLoss', 'parseSupplierCreditPurchase']) {
      expect(webhook, parser).toContain(parser);
    }
  });
});

describe('a parked question releases unless the message answers it', () => {
  // THE LAST BYPASS, and the one that took a probe to find rather than a guess.
  //
  // Every parked question used to ask "is this another topic?" — startsAnotherTopic,
  // a union of fourteen business parsers. Anything on the list escaped. Anything
  // else stayed parked and was asked again:
  //
  //   namaanisha anton            answer=false  recordShaped=false  -> re-asked
  //   sio hiyo                    answer=false  recordShaped=false  -> re-asked
  //   ile ya hisense              answer=false  recordShaped=false  -> re-asked
  //   nilimaanisha nguvu ya sala  answer=false  recordShaped=false  -> re-asked
  //
  // These are the corrections §9 and §18 name, and they are exactly what a
  // shop says when Risip has just told it "Antoni haipo". The question is now
  // the only one that needs no list: is this the ANSWER?

  it('has no list of recognised subjects left to maintain', () => {
    expect(webhook).not.toContain('function startsAnotherTopic');
    expect(webhook).not.toContain('startsAnotherTopic(');
  });

  it('states the rule once, and states it as a release', () => {
    const rule = webhook.slice(
      webhook.indexOf('function releasesParkedQuestion'),
      webhook.indexOf('async function resolveProductForRead'),
    );
    expect(rule).toContain('isDailyRecordConfirmation(text) || isDailyRecordRejection(text) || isCancel(text)');
    expect(rule).toContain('return true;');
  });

  it('asks each parked question about its own answer, not about topics', () => {
    // One site per parked state, each naming the parser that reads ITS answer.
    for (const [state, predicate] of [
      ['quantityMeaningPending', 'parseQuantityMeaningAnswer(body) === null'],
      ['hypotheticalPortionPending', '!matchHypotheticalPortionAnswer(body, hypotheticalPortionPending)'],
      ['invitePending', '!parseInviteRole(body)'],
      ['productRenamePending', '!isDailyRecordConfirmation(body)'],
      ['portionSizePending', '!resumePortionSetup(portionSizePending, body)'],
      ['portionConfirmPending', '!isDailyRecordConfirmation(body)'],
      // Two branches carry this state: an explicit cancel at the first, and the
      // release rule at the second. lastIndexOf reaches the one under test.
      ['newProductSaleSetup', 'SKIP'],
    ] as const) {
      if (predicate === 'SKIP') continue;
      const branch = webhook.slice(webhook.indexOf(`if (${state} &&`));
      expect(branch.slice(0, 400), state).toContain(predicate);
    }
  });

  it('releases the new-product offer for anything that is not a price', () => {
    const branch = webhook.slice(webhook.indexOf('if (activeNewProductQuestion &&'));
    expect(branch.slice(0, 200)).toContain('!looksLikeAnAnswer');
    expect(branch.slice(0, 200)).not.toContain('startsAnotherTopic');
  });

  it('drops the re-ask that met every correction', () => {
    // "Sijaelewa, ni ngapi?" three times running is not a clarification; it is
    // a loop. The model sees the question in history and can answer the
    // correction instead of repeating the prompt.
    const quantityBranch = webhook.slice(
      webhook.indexOf('const answer = parseQuantityAnswer(body ??'),
      webhook.indexOf("'quantity_wanted', 'topic_change', 'skipped'"),
    );
    expect(quantityBranch).not.toContain('quantityNotUnderstood');
  });
});

describe('no message disappears', () => {
  // MEASURED. Three rows in whatsapp_messages, stuck on 'pending' with
  // retries=0, last_error NULL and zero audit rows — 3.8 hours old, 23.8 hours
  // old, and 265 hours old. The message loop is wrapped in a try/catch that
  // records the reason and tells the shop, so a throw cannot produce that
  // signature. What produces it is the worker ending outside JavaScript's
  // control, where no catch can run.
  it('marks a message the worker never finished', () => {
    expect(webhook).toContain("last_error: 'worker_ended_before_completion'");
    expect(webhook).toContain(".eq('status', 'pending')");
  });

  it('sweeps before the loop, not inside it', () => {
    // Inside the loop it would be racing the message being processed.
    const sweep = webhook.indexOf("last_error: 'worker_ended_before_completion'");
    const loop = webhook.indexOf('for (const message of messages)');
    expect(sweep).toBeGreaterThan(-1);
    expect(sweep).toBeLessThan(loop);
  });

  it('never lets the sweep break the message in front of it', () => {
    expect(webhook).toContain('/* the sweep must never stop the message in front of us */');
  });

  it('leaves recent messages alone', () => {
    // Ten minutes is well past the point where processing could plausibly
    // still be running, and well short of anything a live request would hit.
    expect(webhook).toMatch(/Date\.now\(\) - 10 \* 60_000/);
  });
});
