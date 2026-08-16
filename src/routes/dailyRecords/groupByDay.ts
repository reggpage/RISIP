// One card per day, per kind — not one card per message.
//
// The owner recorded a day's takings and three expenses and got four cards. His
// words: "kwa siku expense ni moja lakini imejitenga kwenye card tofauti badala
// ya kusum zote kwenye kadi moja."
//
// He is right, and the reason is how a counter actually works. Sales are entered
// through the day — some in the morning, more after lunch, the rest at closing —
// and every one of them is the SAME day's takings. A card per message turns one
// day into a scroll, and the number the owner wants (what did today make?) is
// nowhere on the screen.
//
// So: group by the day the record happened, in the shop's own timezone, and by
// kind. A record added later that day joins the card that already exists. A new
// card appears only when the date changes.

export type GroupableRecord = {
  id: string;
  kind: string;
  status: string;
  amount: number;
  occurred_at: string;
};

export type DayGroup<T extends GroupableRecord> = {
  /** YYYY-MM-DD in the business timezone, and the grouping key with kind. */
  day: string;
  kind: string;
  key: string;
  records: T[];
  /** Voided records are shown but never counted — the total must be spendable. */
  total: number;
  countedRecords: number;
  hasUnconfirmed: boolean;
};

const TIMEZONE = 'Africa/Dar_es_Salaam';

/**
 * The calendar day a record belongs to, in the shop's timezone.
 *
 * Three hours from UTC, which is enough to file an evening sale on the wrong day
 * and split one day's takings across two cards.
 */
export function businessDay(occurredAt: string, timeZone = TIMEZONE): string {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function groupByDay<T extends GroupableRecord>(records: T[], timeZone = TIMEZONE): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();

  for (const record of records) {
    const day = businessDay(record.occurred_at, timeZone);
    const key = `${day}|${record.kind}`;
    const group = groups.get(key) ?? {
      day, kind: record.kind, key, records: [],
      total: 0, countedRecords: 0, hasUnconfirmed: false,
    };
    group.records.push(record);
    // A voided record stays visible — the ledger is append-only and hiding it
    // would make the card disagree with the history — but it is not money.
    if (record.status !== 'voided') {
      group.total += Number(record.amount) || 0;
      group.countedRecords += 1;
    }
    if (record.status !== 'confirmed' && record.status !== 'voided') group.hasUnconfirmed = true;
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    // Newest first inside a card: the last thing entered is the thing being
    // checked. The cards themselves keep the order the caller gave them.
    group.records.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    group.total = Math.round(group.total * 100) / 100;
  }

  return [...groups.values()].sort((a, b) =>
    b.day.localeCompare(a.day) || a.kind.localeCompare(b.kind));
}
