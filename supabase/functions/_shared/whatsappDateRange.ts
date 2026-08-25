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

const SMALL_COUNTS: Record<string, number> = {
  moja: 1, mmoja: 1, one: 1,
  mbili: 2, miwili: 2, two: 2,
  tatu: 3, mitatu: 3, three: 3,
  nne: 4, minne: 4, four: 4,
  tano: 5, mitano: 5, five: 5,
  sita: 6, six: 6,
  saba: 7, seven: 7,
  nane: 8, minane: 8, eight: 8,
  tisa: 9, nine: 9,
  kumi: 10, ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const ENGLISH_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Counts typed as digits or the short number words people normally use in chat. */
function parseCount(value: string | null | undefined): number | null {
  const said = normalise(String(value ?? '')).replace(/-/g, ' ');
  if (/^\d{1,3}$/.test(said)) {
    const count = Number(said);
    return count >= 1 ? count : null;
  }
  if (SMALL_COUNTS[said]) return SMALL_COUNTS[said];

  const swTeen = said.match(/^kumi(?:\s+na)?\s+(moja|mbili|tatu|nne|tano|sita|saba|nane|tisa)$/);
  if (swTeen) return 10 + SMALL_COUNTS[swTeen[1]];

  const swTwenty = said.match(/^ishirini(?:\s+na)?(?:\s+(moja|mbili|tatu|nne|tano|sita|saba|nane|tisa))?$/);
  if (swTwenty) return 20 + (swTwenty[1] ? SMALL_COUNTS[swTwenty[1]] : 0);

  const enCompound = said.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?$/);
  if (enCompound) return ENGLISH_TENS[enCompound[1]] + (enCompound[2] ? SMALL_COUNTS[enCompound[2]] : 0);
  return null;
}

const COUNT_WORDS = '[a-z0-9]+(?:\\s+(?:na|and)\\s+[a-z0-9]+)?';

function relativeCount(said: string, swUnit: string, enUnit: string, swEndings: string): number | null {
  const sw = said.match(new RegExp(`\\b(?:${swUnit})\\s+(${COUNT_WORDS})\\s+(?:${swEndings}|nyuma)\\b`));
  if (sw) return parseCount(sw[1]);

  const en = said.match(new RegExp(`\\b(${COUNT_WORDS})\\s+(?:${enUnit})\\s+(?:ago|back)\\b`));
  return en ? parseCount(en[1]) : null;
}

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

function explicitDateRange(said: string, now: Date): ResolvedRange | null {
  const split = said.match(/\b(?:kutoka|from)\s+(.+?)\s+(?:hadi|mpaka|to|through|until)\s+(.+)$/)
    ?? said.match(/(.+?)\s+(?:hadi|mpaka|through|until)\s+(.+)$/);
  if (!split) return null;

  const first = explicitDate(split[1], now);
  const last = explicitDate(split[2], now);
  if (!first || !last || first.from.getTime() > last.from.getTime()) return null;
  return {
    from: first.from,
    to: last.to,
    timeOfDay: null,
    sw: `kutoka ${first.sw} hadi ${last.sw}`,
    en: `from ${first.en} to ${last.en}`,
  };
}

function weekAgo(today: Date, count: number): ResolvedRange | null {
  if (count < 1 || count > 999) return null;
  const thisWeek = startOfWeek(today);
  const from = shiftDays(thisWeek, -7 * count);
  const to = shiftDays(thisWeek, -7 * (count - 1));
  return {
    from, to, timeOfDay: null,
    sw: count === 1 ? 'wiki iliyopita' : `wiki ${count} zilizopita`,
    en: count === 1 ? 'last week' : `${count} weeks ago`,
  };
}

function monthAgo(now: Date, count: number): ResolvedRange | null {
  if (count < 1 || count > 999) return null;
  return {
    from: startOfMonth(now, count),
    to: startOfMonth(now, count - 1),
    timeOfDay: null,
    sw: count === 1 ? 'mwezi uliopita' : `miezi ${count} nyuma`,
    en: count === 1 ? 'last month' : `${count} months ago`,
  };
}

function yearAgo(now: Date, count: number): ResolvedRange | null {
  if (count < 1 || count > 999) return null;
  const { year } = localParts(now);
  return {
    from: midnight(year - count, 1, 1),
    to: midnight(year - count + 1, 1, 1),
    timeOfDay: null,
    sw: count === 1 ? 'mwaka jana' : `miaka ${count} nyuma`,
    en: count === 1 ? 'last year' : `${count} years ago`,
  };
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

  // ── An explicit range beats any date word contained inside it ────────────
  const explicitRange = explicitDateRange(said, now);
  if (explicitRange) return withTime(explicitRange);

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
  const rolling = said.match(new RegExp(`\\b(?:siku|days?)\\s+(${COUNT_WORDS})\\s*(?:zilizopita|iliyopita|ago|last)?\\b`))
    ?? said.match(new RegExp(`\\b(?:last|past)\\s+(${COUNT_WORDS})\\s+days?\\b`));
  if (rolling) {
    const parsedDays = parseCount(rolling[1]);
    const days = parsedDays === null ? null : Math.min(parsedDays, 366);
    if (days !== null && days >= 1) {
      const start = shiftDays(today, -(days - 1));
      return withTime({
        from: start, to: shiftDays(today, 1), timeOfDay: null,
        sw: `siku ${days} zilizopita`, en: `the last ${days} days`,
      });
    }
  }

  // ── Weeks ─────────────────────────────────────────────────────────────────
  const thisWeek = startOfWeek(today);
  const weeksBack = relativeCount(said, 'wiki', 'weeks?', 'zilizopita|iliyopita');
  if (weeksBack !== null) {
    const resolved = weekAgo(today, weeksBack);
    if (resolved) return withTime(resolved);
  }
  if (/\bwiki\s+(?:iliyopita|jana|iliyoisha|liyopita)\b|\blast week\b|\bwiki ya jana\b/.test(said)) {
    return withTime(weekAgo(today, 1)!);
  }
  if (/\bwiki\b|\bweek\b/.test(said)) {
    return withTime({ from: thisWeek, to: shiftDays(today, 1), timeOfDay: null, sw: 'wiki hii', en: 'this week' });
  }

  // ── Months ────────────────────────────────────────────────────────────────
  const monthsBack = relativeCount(said, 'mwezi|miezi', 'months?', 'uliopita|iliyopita|zilizopita');
  if (monthsBack !== null) {
    const resolved = monthAgo(now, monthsBack);
    if (resolved) return withTime(resolved);
  }
  if (/\bmwezi\s+(?:uliopita|jana|uliyopita|uliokwisha)\b|\blast month\b/.test(said)) {
    return withTime(monthAgo(now, 1)!);
  }
  if (/\bmwezi\b|\bmonth\b/.test(said)) {
    return withTime({ from: startOfMonth(now, 0), to: shiftDays(today, 1), timeOfDay: null, sw: 'mwezi huu', en: 'this month' });
  }

  // ── Years ─────────────────────────────────────────────────────────────────
  const { year } = localParts(now);
  const yearsBack = relativeCount(said, 'mwaka|miaka', 'years?', 'uliopita|iliyopita|zilizopita');
  if (yearsBack !== null) {
    const resolved = yearAgo(now, yearsBack);
    if (resolved) return withTime(resolved);
  }
  if (/\bmwaka\s+(?:jana|uliopita)\b|\blast year\b/.test(said)) {
    return withTime(yearAgo(now, 1)!);
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

export type TransactionDateResolution =
  | { kind: 'current'; occurredAt: null }
  | { kind: 'historical'; occurredAt: string; label: string }
  | { kind: 'invalid'; reason: 'future' | 'range' };

/** Resolve one transaction day without inventing a time inside a broad period. */
export function resolveTransactionDate(
  text: string | null | undefined,
  now = new Date(),
): TransactionDateResolution {
  const range = resolveDateRange(text, now);
  if (!range) return { kind: 'current', occurredAt: null };
  if (isFuture(range, now)) return { kind: 'invalid', reason: 'future' };
  if (range.to.getTime() - range.from.getTime() !== DAY) {
    return { kind: 'invalid', reason: 'range' };
  }
  const today = startOfToday(now);
  if (range.from.getTime() === today.getTime()) {
    return { kind: 'current', occurredAt: null };
  }
  return { kind: 'historical', occurredAt: range.from.toISOString(), label: range.sw };
}
