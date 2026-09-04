import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type DayCloseFacts,
  batchHintReply,
  closeReminderReply,
  dayClosedReply,
  dayDraftReply,
  nothingToCloseReply,
  ownerDayListReply,
} from '../../../../supabase/functions/_shared/whatsappDayClose';
import { ASSISTANT_TOOLS, ASSISTANT_TOOL_NAMES } from '../../../../supabase/functions/_shared/whatsappAssistant';
import {
  isPlainTextNotification,
  proactiveSendPayload,
} from '../../../../supabase/functions/_shared/whatsappNotifications';

// CLOSING THE DAY.
//
// The owner's design: a worker says "nafunga" in any words, Risip shows the day
// back, they confirm, and the owner gets a report naming who recorded what.
//
// Two rules run through all of it. The closing WORD is understood by the model,
// never matched here — nothing in this module reads the trader's wording. And
// every figure is handed in by a caller that computed it with the same tested
// helpers the rest of Risip uses; nothing here derives money.

const facts: DayCloseFacts = {
  businessName: 'Duka la Mfano',
  businessDate: '2026-08-28',
  dateLabel: 'Ijumaa, 28 Agosti 2026',
  sales: 596_500,
  cogs: 197_500,
  profit: 399_000,
  purchases: 197_500,
  newDebt: 45_000,
  debtPaid: 20_000,
  saleCount: 14,
  purchaseCount: 2,
  newDebtCount: 1,
  debtPaidCount: 1,
  recordCount: 18,
  workers: [
    {
      name: 'Neema',
      source: 'WhatsApp',
      firstAt: '20:11',
      lines: [
        { description: 'Birika', quantity: 3, lineTotal: 45_000, kind: 'sale' },
        { description: 'Daftari', quantity: 2, lineTotal: 45_000, kind: 'debt_issued', partyName: 'Mama Anna' },
      ],
    },
    {
      name: 'Juma',
      source: 'WhatsApp',
      firstAt: '14:02',
      lines: [{ description: 'Nguvu ya sala', quantity: 12, lineTotal: 148_000, kind: 'sale' }],
    },
  ],
  newDebtors: [{ name: 'Mama Anna', amount: 45_000 }],
  outstandingDebt: 128_000,
  outstandingDebtors: 3,
  outOfStock: ['Birika', 'daftari', 'Dumu la maji', 'Sodaa'],
  profitCoveragePct: 71,
};

describe('the draft, which is what somebody is asked to agree to', () => {
  it('shows the day before closing it', () => {
    // Closing a day without showing what is in it is asking somebody to sign a
    // page they have not read.
    const said = dayDraftReply(facts, 'sw');
    expect(said).toContain('Ijumaa, 28 Agosti 2026');
    expect(said).toContain('Mauzo 14');
    expect(said).toContain('TSh 596,500');
    expect(said).toContain('Faida ghafi: *TSh 399,000*');
    expect(said).toContain('*1*');
  });

  it('names the debtor rather than counting them', () => {
    // "Deni jipya 1" tells nobody who owes it, and who owes it is the entire
    // reason the record exists.
    expect(dayDraftReply(facts, 'sw')).toContain('Mama Anna');
  });

  it('says when the profit only covers part of the shop', () => {
    expect(dayDraftReply(facts, 'sw')).toContain('71%');
    const full = dayDraftReply({ ...facts, profitCoveragePct: 100 }, 'sw');
    expect(full).not.toContain('100%');
  });

  it('leaves out what did not happen', () => {
    const salesOnly = dayDraftReply({
      ...facts, purchaseCount: 0, newDebtCount: 0, debtPaidCount: 0,
    }, 'sw');
    expect(salesOnly).not.toContain('Manunuzi');
    expect(salesOnly).not.toContain('Deni jipya');
    expect(salesOnly).toContain('Mauzo 14');
  });

  it('refuses to close a day with nothing in it', () => {
    // Closing an empty day would write a closure saying the shop sold nothing,
    // send the owner a report of zeros, and lock the date — all because
    // somebody typed "nafunga" out of habit before entering anything.
    const empty = nothingToCloseReply({ ...facts, recordCount: 0 }, 'sw');
    expect(empty).toContain('Hakuna kilichorekodiwa');
    expect(empty).not.toContain('*1*');
  });
});

describe('what the person who closed is told', () => {
  it('states sales, cost and profit as three separate figures', () => {
    const said = dayClosedReply(facts, '20:15', 'sw');
    expect(said).toContain('Siku imefungwa');
    expect(said).toContain('Mauzo: TSh 596,500');
    expect(said).toContain('Gharama za bidhaa zilizouzwa (COGS): TSh 197,500');
    expect(said).toContain('Faida ghafi: *TSh 399,000*');
  });

  it('carries the two warnings worth carrying', () => {
    const said = dayClosedReply(facts, '20:15', 'sw');
    expect(said).toContain('Bidhaa 4 zimeisha');
    expect(said).toContain('Watu 3 wanadaiwa TSh 128,000');
  });
});

describe('the owner’s list', () => {
  const list = ownerDayListReply(facts, 'sw');

  it('separates the workers and names each one', () => {
    // No channel. "Neema · app · 09:21" reads like a system log, and the owner
    // asked for a report — how a record reached Risip is Risip's business.
    expect(list).toContain('*Neema* · 20:11');
    expect(list).toContain('*Juma* · 14:02');
    expect(list).not.toContain('WhatsApp ·');
  });

  it('puts the customer’s name on the credit line', () => {
    // The owner asked for exactly this: "kama mtu ameandikwa kwenye deni jina
    // lake pia lionekane".
    expect(list).toContain('Daftari × 2 — *Mama Anna* (deni)');
  });

  it('ends with the totals and the profit', () => {
    // Also asked for by name: "katika orodha inabidi kuonesha kabisa jumla na
    // faida". A list of forty lines that does not add up to anything makes the
    // reader do the arithmetic Risip exists to do.
    expect(list).toContain('*JUMLA YA SIKU*');
    expect(list).toContain('Mauzo: TSh 596,500');
    expect(list).toContain('*Faida ghafi: TSh 399,000*');
    expect(list).toContain('Madeni mapya: TSh 45,000');
    expect(list).toContain('• *Mama Anna* — TSh 45,000');
    expect(list).toContain('Miamala 18 · watu 2');
  });

  it('labels a historical owner list with its own date', () => {
    const said = ownerDayListReply({ ...facts, isToday: false }, 'sw');
    expect(said).toContain('*Muhtasiri wa Ijumaa, 28 Agosti 2026*');
    expect(said).toContain('Hii ni taarifa ya Ijumaa, 28 Agosti 2026 katika biashara yako.');
    expect(said).not.toContain('Muhtasiri wa leo');
    expect(said).not.toContain('taarifa ya leo');
  });

  it('keeps recorded expenses distinct from gross profit', () => {
    const said = dayClosedReply({ ...facts, expenses: 5_000, profit: 394_000 }, '20:15', 'sw');
    expect(said).toContain('Faida ghafi: *TSh 399,000*');
    expect(said).toContain('Matumizi yaliyorekodiwa: TSh 5,000');
    expect(said).toContain('Faida baada ya matumizi: *TSh 394,000*');
  });
});

describe('the hint that one message can carry the whole till roll', () => {
  it('shows what is left when there is a ceiling', () => {
    const said = batchHintReply(6, 412, 600, 'sw');
    expect(said).toContain('*6*');
    expect(said).toContain('412');
    expect(said).toContain('600');
  });

  it('invents no allowance when no ceiling is set', () => {
    const said = batchHintReply(6, null, null, 'sw');
    expect(said).not.toMatch(/\bkati ya\b/);
    expect(said).toContain('nimeuza sodaa 3');
  });
});

describe('the evening reminder', () => {
  it('asks for the closing word rather than explaining itself', () => {
    const said = closeReminderReply('Neema', 6, 'sw');
    expect(said).toContain('Neema');
    expect(said).toContain('6');
    expect(said).toContain('NAFUNGA');
  });

  it('greets without a name when there is none', () => {
    expect(closeReminderReply(null, 3, 'sw')).toContain('Habari za jioni.');
  });

  it('goes out as an ordinary message, not a template', () => {
    // Legal only because wa_queue_close_reminders requires a confirmed record
    // whose source is whatsapp on the same local day — which is what proves the
    // 24-hour window is open.
    const claim = {
      delivery_id: 'd', phone_e164: '+255700000000', lang: 'sw' as const,
      notification_kind: 'close_reminder' as const, template_name: 'text',
      parameters: { channel: 'text', full_name: 'Neema', recorded_today: 6 },
    };
    expect(isPlainTextNotification(claim)).toBe(true);
    const payload = proactiveSendPayload(claim) as { type: string; text?: { body: string } };
    expect(payload.type).toBe('text');
    expect(payload.text?.body).toContain('NAFUNGA');
  });

  it('still sends a template when the notification is one', () => {
    const claim = {
      delivery_id: 'd', phone_e164: '+255700000000', lang: 'sw' as const,
      notification_kind: 'debt_reminder' as const, template_name: 'risip_debt_reminder',
      parameters: { debtor_name: 'Mama Anna', amount: 45000, recorded_date: '2026-08-28' },
    };
    expect(isPlainTextNotification(claim)).toBe(false);
    expect((proactiveSendPayload(claim) as { type: string }).type).toBe('template');
  });
});

describe('the tools that reach it, and what they may not do', () => {
  const named = (name: string) => ASSISTANT_TOOLS.find((tool) => tool.name === name);

  it('lets the model recognise a closing in any words', () => {
    const close = named('propose_day_close');
    expect(close).toBeTruthy();
    expect(close?.description).toMatch(/nafunga/);
    expect(close?.description).toMatch(/closing up/);
    // The distinction that matters: a summary reports, this ends the day.
    expect(close?.description).toMatch(/not a request for a summary/i);
  });

  it('gives the closing tool no financial authority at all', () => {
    // One field, and it is the trader's own word. It cannot state a figure, and
    // it cannot close anything: the server gathers the day and waits for NDIYO.
    const schema = named('propose_day_close')?.input_schema as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).toEqual(['closing_wording']);
    const json = JSON.stringify(named('propose_day_close'));
    for (const forbidden of ['"amount"', '"price"', '"profit"', '"confirmed"', '"company_id"']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('reaches the day’s list through a tool, not a magic word', () => {
    // "ORODHA" is what the report offers, but "nionyeshe kila kitu" and
    // "miamala ya jana" have to work too — so the model routes it, and the only
    // thing it may pass is the day as the person said it.
    const records = named('get_day_records');
    expect(records).toBeTruthy();
    const schema = records?.input_schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(['date_wording']);
    expect(records?.description).toMatch(/orodha/);
    // The date rule lives on the field, where the model reads it.
    expect(JSON.stringify(schema)).toMatch(/never a date you calculated/i);
  });

  it('keeps both on the model’s menu', () => {
    expect(ASSISTANT_TOOL_NAMES).toContain('propose_day_close');
    expect(ASSISTANT_TOOL_NAMES).toContain('get_day_records');
    const shown = ASSISTANT_TOOLS.map((tool) => tool.name);
    expect(shown).toContain('propose_day_close');
    expect(shown).toContain('get_day_records');
  });
});

describe('the ledger, and who may see a whole day', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/0145_daily_closures.sql'), 'utf8');
  const webhook = readFileSync(
    resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

  it('closes a day once and never overwrites it', () => {
    expect(migration).toContain('unique (company_id, business_date)');
    expect(migration).toContain("return jsonb_build_object(\n      'closed', true, 'already_closed', true,");
  });

  it('pre-empts the scheduled summary instead of racing it', () => {
    // Same subject_key as the clock-driven summary, so the unique index makes
    // the second one a no-op. Nobody gets two reports for one day.
    expect(migration).toContain("'daily_summary', p_business_date, 'daily',");
  });

  it('keeps stock purchases out of the daily-summary expenses slot', () => {
    const fix = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/0154_day_close_summary_expenses.sql'), 'utf8');
    expect(fix).toContain('v_expenses numeric');
    expect(fix).toContain("'expenses', v_expenses");
    expect(fix).not.toContain("'expenses', coalesce(p_purchases");
  });

  it('does not tell somebody what they just typed', () => {
    expect(migration).toContain('(p_profile_id is null or p.id <> p_profile_id)');
  });

  it('stops a whole day’s takings at owner and accountant', () => {
    expect(migration).toContain("private.auth_role() = any (array['owner'::user_role, 'accountant'::user_role])");
    expect(webhook).toContain('Orodha ya miamala ya siku nzima inaonekana kwa owner au accountant tu.');
  });

  it('writes nothing when the shopkeeper says no', () => {
    expect(webhook).toContain('Sawa, sijafunga siku. Miamala yako yote ipo pale pale.');
  });

  it('does not claim a save it did not make', () => {
    expect(webhook).toContain('Miamala yako yote ipo salama — jaribu tena baada ya muda mfupi.');
  });
});

describe('the template language code', () => {
  // Meta treats 'en' and 'en_US' as two different languages with no fallback.
  // Both templates this code sends are registered as "English" in WhatsApp
  // Manager, so 'en_US' returns 132001 and the English shop gets nothing.
  // Nobody had noticed because every template still read "Messages sent 0".
  const template = (lang: 'sw' | 'en') => proactiveSendPayload({
    delivery_id: 'd', phone_e164: '+255700000000', lang,
    notification_kind: 'daily_summary' as const, template_name: 'risip_daily_summary',
    parameters: {
      business_name: 'Duka la Mfano', business_date: '2026-08-28',
      sales: 596500, expenses: 197500, note_key: 'no_issues',
    },
  }) as { template?: { language: { code: string } } };

  it('sends sw for Swahili', () => {
    expect(template('sw').template?.language.code).toBe('sw');
  });

  it('sends en for English, never en_US', () => {
    expect(template('en').template?.language.code).toBe('en');
    expect(template('en').template?.language.code).not.toBe('en_US');
  });

  it('has exactly one place that chooses a language code', () => {
    // A second one would drift from the first, and the drift would only show
    // up as a delivery failure on somebody else's phone.
    const shared = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/whatsappNotifications.ts'), 'utf8');
    expect((shared.match(/language: \{ code:/g) ?? []).length).toBe(1);
  });
});

describe('an instruction must not swallow the question with it', () => {
  // MEASURED, on the owner's own number. He wrote "tumia kiswahili na uniambie
  // siku gani biashara ilifanya vizuri" — change the language AND tell me which
  // day the business did well. parseLanguageCommand matched, the whole message
  // was filed as a system command, the AI never saw it, and he was told "I did
  // not fully understand that business question" in the language he had just
  // asked it to leave. Telemetry has no row for that turn at all.
  it('returns what was asked alongside the language change', async () => {
    const { languageCommandRemainder } =
      await import('../../../../supabase/functions/_shared/whatsappIntent');
    expect(languageCommandRemainder('tumia kiswahili na uniambie siku gani biashara ilifanya vizuri'))
      .toBe('uniambie siku gani biashara ilifanya vizuri');
    expect(languageCommandRemainder('change to english and show me my debts'))
      .toBe('show me my debts');
  });

  it('leaves a plain language command exactly as it was', async () => {
    const { languageCommandRemainder } =
      await import('../../../../supabase/functions/_shared/whatsappIntent');
    for (const only of ['tumia kiswahili', 'kiswahili tafadhali', 'change to english']) {
      expect(languageCommandRemainder(only), only).toBeNull();
    }
    // Two ways of asking for the same language is not a business question.
    expect(languageCommandRemainder('tumia kiswahili na jibu kwa kiswahili')).toBeNull();
  });

  it('is not a language command at all when there is no language word', async () => {
    const { languageCommandRemainder, parseLanguageCommand } =
      await import('../../../../supabase/functions/_shared/whatsappIntent');
    expect(parseLanguageCommand('niambie siku gani biashara ilifanya vizuri')).toBeNull();
    expect(languageCommandRemainder('niambie siku gani biashara ilifanya vizuri')).toBeNull();
  });

  it('obeys the instruction and carries the rest to the model', () => {
    const webhook = readFileSync(
      resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(webhook).toContain('const alsoAsked = identity ? languageCommandRemainder(body) : null;');
    // The language is applied, then the remainder becomes the message — so the
    // eligibility gate below sees a business question, not a system command.
    expect(webhook).toContain('          body = alsoAsked;');
    const gate = webhook.indexOf('const systemCommand = isSwitchRequest(body)');
    expect(webhook.indexOf('const alsoAsked')).toBeLessThan(gate);
  });
});

describe('which day, which Risip could not answer at all', () => {
  // MEASURED, twice in one morning on the owner's own number. "lini biashara
  // ilifanya vizuri" and then "niambie siku gani biashara ilifanya vizuri".
  // Risip had a period total and a period-against-period comparison and
  // nothing in between, so the honest answer was "I don't have a day-by-day
  // breakdown" and the dishonest one was today's summary, all zeros.
  const days = [
    { date: '2026-08-24', label: 'Jumatatu 24', sales: 120_000, profit: 40_000, recordCount: 4, profitUnknown: false },
    { date: '2026-08-25', label: 'Jumanne 25', sales: 0, profit: 0, recordCount: 0, profitUnknown: false },
    { date: '2026-08-26', label: 'Jumatano 26', sales: 596_500, profit: 399_000, recordCount: 18, profitUnknown: false },
    { date: '2026-08-27', label: 'Alhamisi 27', sales: 88_000, profit: 0, recordCount: 2, profitUnknown: true },
  ];

  it('names the best day, which is the whole question', async () => {
    const { dailyBreakdownReply } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    const said = dailyBreakdownReply(days, 'wiki hii', 'sw');
    expect(said).toContain('*Siku bora:* Jumatano 26 — TSh 596,500');
    expect(said).toContain('Jumatatu 24: TSh 120,000');
  });

  it('separates a quiet day from a day nobody wrote down', async () => {
    const { dailyBreakdownReply } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    const said = dailyBreakdownReply(days, 'wiki hii', 'sw');
    // A day with no records is not a day with no sales, and the average must
    // not be dragged down by a day the shop was shut.
    expect(said).not.toContain('Jumanne 25');
    expect(said).toContain('Siku 1 hazina rekodi yoyote');
    expect(said).toContain('(siku 3)');
  });

  it('says profit is unknown rather than printing zero', async () => {
    const { dailyBreakdownReply } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    // TSh 0 profit on TSh 88,000 of sales is a claim. "Not known" is the truth.
    expect(dailyBreakdownReply(days, 'wiki hii', 'sw')).toContain('Alhamisi 27: TSh 88,000 · faida haijulikani');
  });

  it('hands the model figures, not a table', async () => {
    const { dailyBreakdownFacts } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    const facts = dailyBreakdownFacts(days, 'wiki hii');
    expect(facts).toContain('best_day=2026-08-26|Jumatano 26|596500');
    expect(facts).toContain('day=2026-08-25|Jumanne 25|no_records');
    expect(facts).toContain('profit=unknown');
    expect(facts).toContain('average_trading_day=');
    // Evidence, not prose: no rendered money, no emoji, no headings.
    expect(facts).not.toContain('TSh');
    expect(facts).not.toContain('🏆');
  });

  it('is offered to the model as the answer to a WHICH DAY question', () => {
    const tool = ASSISTANT_TOOLS.find((entry) => entry.name === 'get_daily_breakdown');
    expect(tool).toBeTruthy();
    expect(tool?.description).toMatch(/siku gani biashara ilifanya vizuri/);
    // And why the two neighbouring tools are wrong for it.
    expect(tool?.description).toMatch(/a total hides the shape/i);
    expect(tool?.description).toMatch(/compares this period against the previous period/i);
    const schema = tool?.input_schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(['period_wording']);
  });
});

describe('a row number typed without a space', () => {
  // MEASURED, and it cost the owner a whole sale. Shown three lines and told
  // to answer "1 rejareja, 2 jumla", he typed "1jumla 2 rejareja 3 jumla" —
  // which is how people type on a phone. Row one was lost and the rest slid
  // onto the wrong products. "1rejareja 2jumla" was worse: everything came
  // back retail, silently, which prices a wholesale sale wrong.
  const choices = [
    { index: 1, product: 'nguvu ya sala', quantity: 6, retail: 10_600, wholesale: 9_500 },
    { index: 2, product: 'punch', quantity: 10, retail: 12_000, wholesale: 11_000 },
    { index: 3, product: 'Rosali ya Maria', quantity: 2, retail: 7_000, wholesale: 6_300 },
  ];

  it('reads the digits glued to the band word', async () => {
    const { parsePriceBandAnswer } =
      await import('../../../../supabase/functions/_shared/whatsappPriceBand');
    expect(parsePriceBandAnswer('1jumla 2 rejareja 3 jumla', choices))
      .toEqual(['wholesale', 'retail', 'wholesale']);
    expect(parsePriceBandAnswer('1rejareja 2jumla', choices))
      .toEqual(['retail', 'wholesale', null]);
  });

  it('still reads the spaced forms it always read', async () => {
    const { parsePriceBandAnswer } =
      await import('../../../../supabase/functions/_shared/whatsappPriceBand');
    expect(parsePriceBandAnswer('1 jumla, 2 rejareja, 3 jumla', choices))
      .toEqual(['wholesale', 'retail', 'wholesale']);
    expect(parsePriceBandAnswer('jumla', choices))
      .toEqual(['wholesale', 'wholesale', 'wholesale']);
  });
});

describe('the shape of the line, which the model could not see', () => {
  // The owner asked whether Risip understands the trend. It saw day figures
  // and nothing else: it could name the best day, because that is a maximum,
  // but not "sales have fallen three weeks running" or "Sunday is your day" —
  // those are properties of the SEQUENCE.
  const day = (date: string, sales: number) =>
    ({ date, label: date.slice(8), sales, profit: sales / 3, recordCount: 2, profitUnknown: false });

  it('counts a run of falls', async () => {
    const { trendShapeFacts } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    const facts = trendShapeFacts([
      day('2026-08-01', 100_000), day('2026-08-02', 90_000),
      day('2026-08-03', 70_000), day('2026-08-04', 50_000),
    ]);
    expect(facts).toContain('consecutive_falls=3');
    expect(facts).not.toContain('consecutive_rises');
  });

  it('splits the period in half rather than trusting one step', async () => {
    const { trendShapeFacts } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    // A direction that survives being split in half is a direction; one that
    // does not is noise.
    const facts = trendShapeFacts([
      day('2026-08-01', 100_000), day('2026-08-02', 100_000),
      day('2026-08-03', 200_000), day('2026-08-04', 200_000),
    ]);
    expect(facts).toContain('first_half_average=100000');
    expect(facts).toContain('second_half_average=200000');
    expect(facts).toContain('half_over_half_change_pct=100');
  });

  it('names a weekday only when it has repeated', async () => {
    const { trendShapeFacts } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    // One good Sunday is a Sunday, not a pattern.
    const oneWeek = trendShapeFacts([
      day('2026-08-02', 900_000), day('2026-08-03', 10_000), day('2026-08-04', 20_000),
    ]);
    expect(oneWeek).not.toContain('best_weekday');
    const twoWeeks = trendShapeFacts([
      day('2026-08-02', 900_000), day('2026-08-03', 10_000),
      day('2026-08-09', 800_000), day('2026-08-10', 20_000),
    ]);
    expect(twoWeeks).toContain('best_weekday=Jumapili');
    expect(twoWeeks).toContain('weeks=2');
  });

  it('says how lumpy the period is, which the average hides', async () => {
    const { trendShapeFacts } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    // One enormous day inside a flat month is a different business from a
    // steady one, and the mean cannot tell them apart.
    const facts = trendShapeFacts([
      day('2026-08-01', 10_000), day('2026-08-02', 10_000),
      day('2026-08-03', 10_000), day('2026-08-04', 970_000),
    ]);
    expect(facts).toContain('median_trading_day=10000');
    expect(facts).toContain('best_day_share_of_total_pct=97');
  });

  it('refuses to describe a shape it does not have', async () => {
    const { trendShapeFacts } =
      await import('../../../../supabase/functions/_shared/whatsappDayClose');
    expect(trendShapeFacts([day('2026-08-01', 10_000)])).toBe('trend=too_few_trading_days');
  });
});
