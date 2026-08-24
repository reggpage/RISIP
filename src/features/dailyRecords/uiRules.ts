export const DAILY_RECORD_RANGES = ['day', 'week', 'month', 'year'] as const;
export type DailyRecordRange = (typeof DAILY_RECORD_RANGES)[number];

export const DAILY_RECORD_CHART_COLORS = {
  sale: 'rgb(var(--role-admin))',
  expense: '#f97316',
  // Deliberately close to expense — both are money out — but distinct, because
  // the whole point of the split is being able to tell them apart on a bad day.
  stockPurchase: '#b45309',
  debt: '#7c3aed',
  customerPayment: '#171717',
  // Loss is the only red on this chart. Nothing else on a shop's day is a
  // number that simply disappeared, and it should not have to compete for
  // attention with money that merely moved.
  stockLoss: '#dc2626',
  ownerUse: '#0d9488',
  supplierPayable: '#a16207',
  supplierPayment: '#4d7c0f',
  cashMovement: '#0891b2',
} as const;

export function startOfLocalDay(value: Date | string = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isSameLocalDay(value: Date | string, selectedDay: Date) {
  const date = new Date(value);
  return date.getFullYear() === selectedDay.getFullYear()
    && date.getMonth() === selectedDay.getMonth()
    && date.getDate() === selectedDay.getDate();
}

export function moveDailyRecordsDate(selectedDay: Date, offset: number, now: Date = new Date()) {
  const next = startOfLocalDay(selectedDay);
  next.setDate(next.getDate() + offset);
  return next > startOfLocalDay(now) ? null : next;
}
