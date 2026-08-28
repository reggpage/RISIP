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
    expect(said).toContain('Faida ya leo: *TSh 399,000*');
    expect(said).toContain('NDIYO');
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
    expect(empty).not.toContain('NDIYO');
  });
});

describe('what the person who closed is told', () => {
  it('states sales, cost and profit as three separate figures', () => {
    const said = dayClosedReply(facts, '20:15', 'sw');
    expect(said).toContain('Siku imefungwa');
    expect(said).toContain('Mauzo: TSh 596,500');
    expect(said).toContain('Gharama ya bidhaa: TSh 197,500');
    expect(said).toContain('Faida: *TSh 399,000*');
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
    expect(list).toContain('*Neema* · WhatsApp · 20:11');
    expect(list).toContain('*Juma* · WhatsApp · 14:02');
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
    expect(list).toContain('*Faida: TSh 399,000*');
    expect(list).toContain('Madeni mapya: TSh 45,000');
    expect(list).toContain('• *Mama Anna* — TSh 45,000');
    expect(list).toContain('Miamala 18 · watu 2');
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
