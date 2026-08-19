import { describe, expect, it } from 'vitest';
import {
  isFuture,
  parseTimeOfDay,
  resolveDateRange,
  withinTimeOfDay,
} from '../../../../supabase/functions/_shared/whatsappDateRange';
import { parseReadRequest, periodLabel } from '../../../../supabase/functions/_shared/whatsappReadTools';

// A Thursday, 14:30 in Dar es Salaam (11:30 UTC).
const NOW = new Date('2026-08-14T11:30:00Z');

/** What the shop would call the day, so assertions read like the shop does. */
const localDay = (at: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(at);

const range = (said: string) => resolveDateRange(said, NOW)!;

describe('the days people name', () => {
  it('understands juzi, which was refused twice on the live number', () => {
    const juzi = range('nini kimeuza sana juzi');
    expect(localDay(juzi.from)).toBe('2026-08-12');
    expect(localDay(new Date(juzi.to.getTime() - 1))).toBe('2026-08-12');
    expect(juzi.sw).toBe('juzi');
  });

  it('understands jana and leo', () => {
    expect(localDay(range('mauzo ya jana').from)).toBe('2026-08-13');
    expect(localDay(range('mauzo ya leo').from)).toBe('2026-08-14');
  });

  it('reads the day boundary in Dar es Salaam, not in UTC', () => {
    // 22:00 local on the 14th is 19:00 UTC. "Today" must still be the 14th.
    const lateEvening = new Date('2026-08-14T19:00:00Z');
    expect(localDay(resolveDateRange('leo', lateEvening)!.from)).toBe('2026-08-14');
    // 01:00 local on the 15th is 22:00 UTC on the 14th — a different day here.
    const afterMidnight = new Date('2026-08-14T22:00:00Z');
    expect(localDay(resolveDateRange('leo', afterMidnight)!.from)).toBe('2026-08-15');
  });
});

describe('weeks, months and years', () => {
  it('separates this week from last week', () => {
    // The 14th is a Friday; the trading week starts Monday the 10th.
    expect(localDay(range('wiki hii').from)).toBe('2026-08-10');
    const last = range('wiki iliyopita');
    expect(localDay(last.from)).toBe('2026-08-03');
    expect(localDay(new Date(last.to.getTime() - 1))).toBe('2026-08-09');
  });

  it('does not read "wiki iliyopita" as plain "wiki"', () => {
    // The specific phrase contains the loose one, so order of testing matters.
    expect(range('wiki iliyopita').sw).toBe('wiki iliyopita');
    expect(range('wiki jana').sw).toBe('wiki iliyopita');
  });

  it('separates this month from last month', () => {
    expect(localDay(range('mwezi huu').from)).toBe('2026-08-01');
    const last = range('mwezi uliopita');
    expect(localDay(last.from)).toBe('2026-07-01');
    expect(localDay(new Date(last.to.getTime() - 1))).toBe('2026-07-31');
  });

  it('separates this year from last year', () => {
    expect(localDay(range('mwaka huu').from)).toBe('2026-01-01');
    expect(localDay(range('mwaka jana').from)).toBe('2025-01-01');
  });

  it('handles a rolling window of days', () => {
    const seven = range('siku 7 zilizopita');
    expect(localDay(seven.from)).toBe('2026-08-08');
    expect(seven.sw).toBe('siku 7 zilizopita');
  });

  it('understands numbered weeks ago without falling back to this week', () => {
    const two = range('nini kiliuza zaidi wiki mbili zilizopita');
    expect(localDay(two.from)).toBe('2026-07-27');
    expect(localDay(new Date(two.to.getTime() - 1))).toBe('2026-08-02');
    expect(two.sw).toBe('wiki 2 zilizopita');

    const three = range('mauzo ya wiki 3 nyuma');
    expect(localDay(three.from)).toBe('2026-07-20');
    expect(localDay(new Date(three.to.getTime() - 1))).toBe('2026-07-26');
    expect(localDay(range('what sold two weeks ago').from)).toBe('2026-07-27');
  });

  it('understands arbitrary numbered months ago', () => {
    const three = range('mauzo ya miezi mitatu nyuma');
    expect(localDay(three.from)).toBe('2026-05-01');
    expect(localDay(new Date(three.to.getTime() - 1))).toBe('2026-05-31');
    expect(three.sw).toBe('miezi 3 nyuma');

    const six = range('matumizi ya miezi 6 nyuma');
    expect(localDay(six.from)).toBe('2026-02-01');
    expect(localDay(new Date(six.to.getTime() - 1))).toBe('2026-02-28');
    expect(localDay(range('sales three months ago').from)).toBe('2026-05-01');
  });

  it('understands numbered years ago and number words in rolling days', () => {
    const twoYears = range('mauzo ya miaka miwili nyuma');
    expect(localDay(twoYears.from)).toBe('2024-01-01');
    expect(localDay(new Date(twoYears.to.getTime() - 1))).toBe('2024-12-31');
    expect(localDay(range('siku saba zilizopita').from)).toBe('2026-08-08');
    expect(localDay(range('last seven days').from)).toBe('2026-08-08');
  });
});

describe('a date said outright', () => {
  it('understands the example the owner asked for', () => {
    const day = range('tarehe 7 may 2025');
    expect(localDay(day.from)).toBe('2025-05-07');
  });

  it('understands Swahili month names', () => {
    expect(localDay(range('tarehe 7 mei 2025').from)).toBe('2025-05-07');
    expect(localDay(range('3 desemba 2025').from)).toBe('2025-12-03');
  });

  it('understands English written either way round', () => {
    expect(localDay(range('may 7 2025').from)).toBe('2025-05-07');
    expect(localDay(range('7 may 2025').from)).toBe('2025-05-07');
  });

  it('reads a slashed date day-first, as it is written here', () => {
    expect(localDay(range('7/5/2025').from)).toBe('2025-05-07');
    expect(localDay(range('07-05-25').from)).toBe('2025-05-07');
  });

  it('reads an ISO date by its leading four-digit year', () => {
    expect(localDay(range('2025-05-07').from)).toBe('2025-05-07');
  });

  it('assumes the current year when none is given', () => {
    expect(localDay(range('tarehe 7 mei').from)).toBe('2026-05-07');
  });

  it('covers exactly one day', () => {
    const day = range('tarehe 7 mei 2025');
    expect(day.to.getTime() - day.from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('understands an inclusive range between two explicit dates', () => {
    const sw = range('mauzo kutoka tarehe 7 Mei 2025 hadi tarehe 10 Mei 2025');
    expect(localDay(sw.from)).toBe('2025-05-07');
    expect(localDay(new Date(sw.to.getTime() - 1))).toBe('2025-05-10');
    expect(sw.sw).toBe('kutoka tarehe 7 Mei 2025 hadi tarehe 10 Mei 2025');

    const en = range('sales from May 7 2025 to May 10 2025');
    expect(localDay(en.from)).toBe('2025-05-07');
    expect(localDay(new Date(en.to.getTime() - 1))).toBe('2025-05-10');
  });
});

describe('parts of the day', () => {
  it('reads asubuhi, mchana, jioni and usiku', () => {
    expect(parseTimeOfDay('alituma asubuhi')).toBe('morning');
    expect(parseTimeOfDay('mchana')).toBe('afternoon');
    expect(parseTimeOfDay('jioni')).toBe('evening');
    expect(parseTimeOfDay('usiku')).toBe('night');
    expect(parseTimeOfDay('mauzo ya leo')).toBeNull();
  });

  it('combines a day with a part of that day', () => {
    const morning = range('erick alituma risiti gani jana asubuhi');
    expect(localDay(morning.from)).toBe('2026-08-13');
    expect(morning.timeOfDay).toBe('morning');
    expect(morning.sw).toBe('jana asubuhi');
  });

  it('treats a bare part of day as today', () => {
    const morning = range('nani alituma asubuhi');
    expect(localDay(morning.from)).toBe('2026-08-14');
    expect(morning.timeOfDay).toBe('morning');
  });

  it('tests the hour in local time', () => {
    // 08:00 local is 05:00 UTC.
    expect(withinTimeOfDay(new Date('2026-08-14T05:00:00Z'), 'morning')).toBe(true);
    expect(withinTimeOfDay(new Date('2026-08-14T05:00:00Z'), 'evening')).toBe(false);
    // 18:00 local is 15:00 UTC.
    expect(withinTimeOfDay(new Date('2026-08-14T15:00:00Z'), 'evening')).toBe(true);
  });

  it('lets night wrap past midnight', () => {
    // 23:00 local and 02:00 local are both night, either side of midnight.
    expect(withinTimeOfDay(new Date('2026-08-14T20:00:00Z'), 'night')).toBe(true);
    expect(withinTimeOfDay(new Date('2026-08-14T23:00:00Z'), 'night')).toBe(true);
    expect(withinTimeOfDay(new Date('2026-08-14T09:00:00Z'), 'night')).toBe(false);
  });
});

describe('knowing when not to answer', () => {
  it('returns null when no period was named, so the caller keeps its default', () => {
    expect(resolveDateRange('nani ananidai', NOW)).toBeNull();
    expect(resolveDateRange('', NOW)).toBeNull();
    expect(resolveDateRange('nipe link ya login', NOW)).toBeNull();
  });

  it('recognises tomorrow so it can be refused rather than silently answered', () => {
    // Reading "kesho" as "today" would report real figures under a false label.
    const tomorrow = range('mauzo ya kesho');
    expect(localDay(tomorrow.from)).toBe('2026-08-15');
    expect(isFuture(tomorrow, NOW)).toBe(true);
    expect(isFuture(range('leo'), NOW)).toBe(false);
  });

  it('does not invent a date out of an amount', () => {
    // "nimeuza kwa 12000" must not become a date.
    expect(resolveDateRange('nimeuza sukari kwa 12000', NOW)).toBeNull();
  });
});

describe('a question carries its own window through to the query', () => {
  it('turns the refused question into a real request for juzi', () => {
    // "Expenses zangu za juzi ni ngapi" was refused on the live number.
    const request = parseReadRequest('muhtasari wa juzi', NOW);
    expect(request?.tool).toBe('ai_business_summary');
    expect(localDay(request!.range!.from)).toBe('2026-08-12');
  });

  it('labels the answer with the day that was asked for', () => {
    const request = parseReadRequest('muhtasari wa wiki iliyopita', NOW);
    expect(periodLabel(request!.period, 'sw', request!.range)).toBe('wiki iliyopita');
    // Without a range it still falls back to the coarse label.
    expect(periodLabel('week', 'sw', null)).toBe('wiki hii');
  });

  it('leaves the range null when no time was named', () => {
    const request = parseReadRequest('nani anadaiwa', NOW);
    expect(request?.tool).toBe('ai_debtors');
    expect(request?.range).toBeNull();
  });
});
