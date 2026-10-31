export type PeriodKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'custom';

export type TestingTimeframe = 'daily' | 'weekly' | 'monthly';

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

/** Monday of the week containing `date` (local time). */
export function startOfWeekKey(date: Date = new Date()): string {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay(); // 0 = Sunday
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return toDateKey(start);
}

/** Monday–Sunday bounds for the current week plus `offsetWeeks`. */
export function getWeekBounds(offsetWeeks = 0): { start: string; end: string } {
  const start = parseDateKey(startOfWeekKey()) ?? new Date();
  start.setDate(start.getDate() + offsetWeeks * 7);
  const startKey = toDateKey(start);
  start.setDate(start.getDate() + 6);
  return { start: startKey, end: toDateKey(start) };
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatMonthDay(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return `${MONTHS_SHORT[date.getMonth()]} ${pad2(date.getDate())}`;
}

export function formatMonthYear(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** `Oct 26 – Nov 01`, `Oct 26 – 31`, or a single `Oct 31`. */
export function formatRangeDates(startKey: string, endKey: string): string {
  if (startKey === endKey) return formatMonthDay(startKey);
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end) return `${startKey} – ${endKey}`;

  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatMonthDay(startKey)}, ${start.getFullYear()} – ${formatMonthDay(endKey)}, ${end.getFullYear()}`;
  }

  if (start.getMonth() === end.getMonth()) {
    return `${MONTHS_SHORT[start.getMonth()]} ${pad2(start.getDate())} – ${pad2(end.getDate())}`;
  }

  return `${formatMonthDay(startKey)} – ${formatMonthDay(endKey)}`;
}

export function formatPeriodLabel(
  period: PeriodKey,
  range: { start: string; end: string }
): string {
  switch (period) {
    case 'today':
      return `Today (${formatMonthDay(range.start)})`;
    case 'yesterday':
      return `Yesterday (${formatMonthDay(range.start)})`;
    case 'thisWeek': {
      const week = getWeekBounds(0);
      return `This Week (${formatRangeDates(week.start, week.end)})`;
    }
    case 'lastWeek': {
      const week = getWeekBounds(-1);
      return `Last Week (${formatRangeDates(week.start, week.end)})`;
    }
    case 'thisMonth':
      return `This Month (${formatMonthYear(range.start)})`;
    case 'custom':
      return `Custom (${formatRangeDates(range.start, range.end)})`;
  }
}

export function getTestingRange(timeframe: TestingTimeframe): {
  start: string;
  end: string;
  label: string;
} {
  const today = todayKey();

  if (timeframe === 'daily') {
    return { start: today, end: today, label: "Today's QA Queue" };
  }

  if (timeframe === 'weekly') {
    return { start: startOfWeekKey(), end: today, label: "This Week's QA Queue" };
  }

  const now = new Date();
  return {
    start: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: today,
    label: "This Month's QA Queue",
  };
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
    case 'thisWeek': {
      const week = getWeekBounds(0);
      return { start: week.start, end: today, days: daysBetween(week.start, today) };
    }
    case 'lastWeek': {
      const week = getWeekBounds(-1);
      return { start: week.start, end: week.end, days: daysBetween(week.start, week.end) };
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
