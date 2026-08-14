// Dates and times, in the words people use.
//
// MEASURED GAP. Until now a question could only be about one of four periods:
// today, this week, this month, this year. Anything else was refused. From the
// live number, twice in one conversation:
//
//   "Nini kimeuza sana juzi"        -> "siwezi kupata takwimu za siku maalum"
//   "Expenses zangu za juzi ni ngapi" -> the same refusal again
//
// "Juzi" is not an exotic request. Neither is "wiki iliyopita", "mwezi jana" or
// "tarehe 7 Mei 2025". A book you cannot ask about a particular day is not
// really a book.
//
// Everything here is pure and works in Africa/Dar_es_Salaam, because a shop's
// "yesterday" ends at local midnight, not UTC midnight — three hours apart, and
// an evening sale would otherwise land on the wrong day.

export type Lang = 'sw' | 'en';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export type ResolvedRange = {
  /** Inclusive start, as a UTC instant. */
  from: Date;
  /** Exclusive end, as a UTC instant. */
  to: Date;
  /** Narrowing inside each day, when the person said "asubuhi" and similar. */
  timeOfDay: TimeOfDay | null;
  sw: string;
  en: string;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Tanzania is UTC+3 all year; there is no daylight saving to track. */
const OFFSET = 3 * HOUR;

function localParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

/** The UTC instant of local midnight starting that calendar day. */
function midnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - OFFSET);
}

function startOfToday(now: Date): Date {
  const { year, month, day } = localParts(now);
  return midnight(year, month, day);
}

function shiftDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * DAY);
}

function normalise(text: string): string {
  return text
    .toLocaleLowerCase('en')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s\/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Swahili and English, plus the abbreviations people type on a phone.
const MONTHS: Record<string, number> = {
  januari: 1, january: 1, jan: 1,
  februari: 2, february: 2, feb: 2,
  machi: 3, march: 3, mar: 3,
  aprili: 4, april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  julai: 7, july: 7, jul: 7,
  agosti: 8, august: 8, aug: 8, ago: 8,
  septemba: 9, september: 9, sep: 9, sept: 9,
  oktoba: 10, october: 10, oct: 10, okt: 10,
  novemba: 11, november: 11, nov: 11,
  desemba: 12, december: 12, dec: 12, des: 12,
};

const MONTH_LABEL_SW = [
  'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni',
  'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
];
const MONTH_LABEL_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Hours of the local day. Deliberately generous at the edges: somebody who says
 * a receipt came in "asubuhi" is not going to quarrel about 11:58.
 */
const TIME_OF_DAY: Record<TimeOfDay, { fromHour: number; toHour: number; sw: string; en: string }> = {
  morning:   { fromHour: 5,  toHour: 12, sw: 'asubuhi', en: 'in the morning' },
  afternoon: { fromHour: 12, toHour: 16, sw: 'mchana',  en: 'in the afternoon' },
  evening:   { fromHour: 16, toHour: 20, sw: 'jioni',   en: 'in the evening' },
  night:     { fromHour: 20, toHour: 5,  sw: 'usiku',   en: 'at night' },
};

export function parseTimeOfDay(text: string | null | undefined): TimeOfDay | null {
  const said = normalise(String(text ?? ''));
  if (/\basubuhi\b|\bmorning\b/.test(said)) return 'morning';
  if (/\bmchana\b|\bafternoon\b|\bmid ?day\b/.test(said)) return 'afternoon';
  if (/\bjioni\b|\bevening\b/.test(said)) return 'evening';
  if (/\busiku\b|\bnight\b/.test(said)) return 'night';
  return null;
}

/**
 * Whether a moment falls inside the named part of its own local day. Night wraps
 * past midnight, so it is the one window whose start hour is after its end hour.
 */
export function withinTimeOfDay(at: Date, timeOfDay: TimeOfDay): boolean {
  const window = TIME_OF_DAY[timeOfDay];
  const localHour = new Date(at.getTime() + OFFSET).getUTCHours();
  return window.fromHour <= window.toHour
    ? localHour >= window.fromHour && localHour < window.toHour
    : localHour >= window.fromHour || localHour < window.toHour;
}

function dayRange(start: Date, sw: string, en: string): ResolvedRange {
  return { from: start, to: shiftDays(start, 1), timeOfDay: null, sw, en };
}

function formatDay(start: Date): { sw: string; en: string } {
  const local = new Date(start.getTime() + OFFSET);
  const day = local.getUTCDate();
  const month = local.getUTCMonth();
  const year = local.getUTCFullYear();
  return {
    sw: `tarehe ${day} ${MONTH_LABEL_SW[month]} ${year}`,
    en: `${day} ${MONTH_LABEL_EN[month]} ${year}`,
  };
}

/** Monday-start, because a Tanzanian trading week is talked about that way. */
function startOfWeek(today: Date): Date {
  const local = new Date(today.getTime() + OFFSET);
  const mondayOffset = (local.getUTCDay() + 6) % 7;
  return shiftDays(today, -mondayOffset);
}

function startOfMonth(now: Date, monthsBack: number): Date {
  const { year, month } = localParts(now);
  const target = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
  return midnight(target.getUTCFullYear(), target.getUTCMonth() + 1, 1);
}

function explicitDate(said: string, now: Date): ResolvedRange | null {
  // "7 mei 2025", "tarehe 7 mei", "may 7 2025"
  const named = said.match(/\b(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{4}))?\b/)
    ?? said.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/);
  if (named) {
    const first = named[1];
    const second = named[2];
    const dayFirst = /^\d+$/.test(first);
    const month = MONTHS[dayFirst ? second : first];
    const day = Number(dayFirst ? first : second);
    if (month && day >= 1 && day <= 31) {
      const year = named[3] ? Number(named[3]) : localParts(now).year;
      const start = midnight(year, month, day);
      const label = formatDay(start);
      return dayRange(start, label.sw, label.en);
    }
  }

  // "2025-05-07", "7/5/2025", "7-5-2025". Day-first, which is how it is written
  // here; the ISO form is recognised by its four-digit year coming first.
  const iso = said.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const start = midnight(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const label = formatDay(start);
    return dayRange(start, label.sw, label.en);
  }
  const slashed = said.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (slashed) {
    const day = Number(slashed[1]);
    const month = Number(slashed[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const raw = slashed[3] ? Number(slashed[3]) : localParts(now).year;
      const year = raw < 100 ? 2000 + raw : raw;
      const start = midnight(year, month, day);
      const label = formatDay(start);
      return dayRange(start, label.sw, label.en);
    }
  }
  return null;
}

/**
 * Turns whatever the person wrote into a real window, or null when they named no
 * period at all and the caller should keep its own default.
 *
 * Order matters: the specific phrases are tested before the loose ones, so
 * "wiki iliyopita" is not read as "wiki".
 */
export function resolveDateRange(text: string | null | undefined, now = new Date()): ResolvedRange | null {
  const said = normalise(String(text ?? ''));
  if (!said) return null;

  const today = startOfToday(now);
  const timeOfDay = parseTimeOfDay(said);
  const withTime = (range: ResolvedRange): ResolvedRange => {
    if (!timeOfDay) return range;
    const window = TIME_OF_DAY[timeOfDay];
    return {
      ...range,
      timeOfDay,
      sw: `${range.sw} ${window.sw}`,
      en: `${range.en} ${window.en}`,
    };
  };

  // ── Named days ────────────────────────────────────────────────────────────
  if (/\bjuzi\b|\bmtondo\b|day before yesterday/.test(said)) {
    const start = shiftDays(today, -2);
    return withTime(dayRange(start, 'juzi', 'the day before yesterday'));
  }
  // "jana" is also the tail of "wiki jana", "mwezi jana" and "mwaka jana",
  // which mean last week, last month and last year — not yesterday. The word
  // before it decides, so it has to be looked at.
  if (/(?<!\b(?:wiki|mwezi|mwaka)\s)\bjana\b|\byesterday\b/.test(said)) {
    return withTime(dayRange(shiftDays(today, -1), 'jana', 'yesterday'));
  }
  if (/\bkesho\b|\btomorrow\b/.test(said)) {
    // Recognised so it can be refused clearly rather than silently answered
    // with today's figures. There are no records from the future.
    return withTime(dayRange(shiftDays(today, 1), 'kesho', 'tomorrow'));
  }
  if (/\bleo\b|\btoday\b/.test(said)) {
    return withTime(dayRange(today, 'leo', 'today'));
  }

  // ── An explicit date beats every relative phrase ──────────────────────────
  const explicit = explicitDate(said, now);
  if (explicit) return withTime(explicit);

  // ── Rolling windows ───────────────────────────────────────────────────────
  const rolling = said.match(/\b(?:siku|days?)\s+(\d{1,3})\s*(?:zilizopita|zilizopita|iliyopita|ago|last)?\b/)
    ?? said.match(/\b(?:last|past)\s+(\d{1,3})\s+days?\b/);
  if (rolling) {
    const days = Math.min(Number(rolling[1]), 366);
    if (days >= 1) {
      const start = shiftDays(today, -(days - 1));
      return withTime({
        from: start, to: shiftDays(today, 1), timeOfDay: null,
        sw: `siku ${days} zilizopita`, en: `the last ${days} days`,
      });
    }
  }

  // ── Weeks ─────────────────────────────────────────────────────────────────
  const thisWeek = startOfWeek(today);
  if (/\bwiki\s+(?:iliyopita|jana|iliyoisha|liyopita)\b|\blast week\b|\bwiki ya jana\b/.test(said)) {
    const start = shiftDays(thisWeek, -7);
    return withTime({ from: start, to: thisWeek, timeOfDay: null, sw: 'wiki iliyopita', en: 'last week' });
  }
  if (/\bwiki\b|\bweek\b/.test(said)) {
    return withTime({ from: thisWeek, to: shiftDays(today, 1), timeOfDay: null, sw: 'wiki hii', en: 'this week' });
  }

  // ── Months ────────────────────────────────────────────────────────────────
  if (/\bmwezi\s+(?:uliopita|jana|uliyopita|uliokwisha)\b|\blast month\b/.test(said)) {
    const start = startOfMonth(now, 1);
    return withTime({ from: start, to: startOfMonth(now, 0), timeOfDay: null, sw: 'mwezi uliopita', en: 'last month' });
  }
  if (/\bmwezi\b|\bmonth\b/.test(said)) {
    return withTime({ from: startOfMonth(now, 0), to: shiftDays(today, 1), timeOfDay: null, sw: 'mwezi huu', en: 'this month' });
  }

  // ── Years ─────────────────────────────────────────────────────────────────
  const { year } = localParts(now);
  if (/\bmwaka\s+(?:jana|uliopita)\b|\blast year\b/.test(said)) {
    return withTime({
      from: midnight(year - 1, 1, 1), to: midnight(year, 1, 1), timeOfDay: null,
      sw: 'mwaka jana', en: 'last year',
    });
  }
  if (/\bmwaka\b|\byear\b/.test(said)) {
    return withTime({
      from: midnight(year, 1, 1), to: shiftDays(today, 1), timeOfDay: null,
      sw: 'mwaka huu', en: 'this year',
    });
  }

  // A bare "asubuhi" with no day named means today's morning.
  if (timeOfDay) return withTime(dayRange(today, 'leo', 'today'));

  return null;
}

export function rangeLabel(range: ResolvedRange, lang: Lang): string {
  return lang === 'sw' ? range.sw : range.en;
}

/** True when the window has not happened yet, so there is nothing to report. */
export function isFuture(range: ResolvedRange, now = new Date()): boolean {
  return range.from.getTime() > now.getTime();
}
