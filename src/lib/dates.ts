export type PeriodKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'custom';

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? date.toLocaleDateString() : '—';
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? date.toLocaleString() : '—';
}

export function toDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDayMs(key: string): number {
  const date = parseDateKey(key);
  if (!date) return 0;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfDayMs(key: string): number {
  const date = parseDateKey(key);
  if (!date) return Date.now();
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function daysBetween(startKey: string, endKey: string): string[] {
  const days: string[] = [];
  let current = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!current || !end) return days;

  while (current.getTime() <= end.getTime() && days.length < 366) {
    days.push(toDateKey(current));
    current = addDays(current, 1);
  }

  return days;
}

export function getPeriodRange(
  period: PeriodKey,
  customStart: string,
  customEnd: string
): { start: string; end: string; days: string[] } {
  const today = todayKey();

  switch (period) {
    case 'today':
      return { start: today, end: today, days: [today] };
    case 'yesterday': {
      const yesterday = toDateKey(addDays(new Date(), -1));
      return { start: yesterday, end: yesterday, days: [yesterday] };
    }
    case 'last7': {
      const start = toDateKey(addDays(new Date(), -6));
      return { start, end: today, days: daysBetween(start, today) };
    }
    case 'last30': {
      const start = toDateKey(addDays(new Date(), -29));
      return { start, end: today, days: daysBetween(start, today) };
    }
    case 'thisMonth': {
      const now = new Date();
      const start = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
      return { start, end: today, days: daysBetween(start, today) };
    }
    case 'custom': {
      const validStart = parseDateKey(customStart) ? customStart : today;
      const validEnd = parseDateKey(customEnd) ? customEnd : today;
      if (validStart > validEnd) {
        return { start: validEnd, end: validStart, days: daysBetween(validEnd, validStart) };
      }
      return { start: validStart, end: validEnd, days: daysBetween(validStart, validEnd) };
    }
  }
}

export function isTaskOverdue(dueDate: string | null, done: boolean): boolean {
  if (done) return false;
  const due = parseDate(dueDate);
  if (!due) return false;
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
}

/** Whole days a task is past due. Returns 0 for today, future dates, and no due date. */
export function daysOverdue(dueDate: string | null | undefined, referenceKey: string = todayKey()): number {
  const due = parseDate(dueDate);
  if (!due) return 0;
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const referenceStart = startOfDayMs(referenceKey);
  if (dueStart >= referenceStart) return 0;
  return Math.floor((referenceStart - dueStart) / 86_400_000);
}

export function isDueToday(dueDate: string | null | undefined, referenceKey: string = todayKey()): boolean {
  const due = parseDate(dueDate);
  if (!due) return false;
  return toDateKey(due) === referenceKey;
}

export function isDueOnOrBefore(dueDate: string | null | undefined, referenceKey: string = todayKey()): boolean {
  const due = parseDate(dueDate);
  if (!due) return false;
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  return dueStart <= startOfDayMs(referenceKey);
}

export function isInRange(value: string | null | undefined, startMs: number, endMs: number): boolean {
  const date = parseDate(value);
  if (!date) return false;
  const time = date.getTime();
  return time >= startMs && time <= endMs;
}

export function fileTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}
