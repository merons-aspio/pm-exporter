import type { EnrichedTaskData } from '../services/hubstaff';
import { BUCKET_META, getEffectiveBucket, getListBucket } from './status';
import type { StatusMapping, StatusOverrides } from './status';
import {
  daysOverdue as getDaysOverdue,
  formatDate,
  formatDateTime,
  isDueOnOrBefore,
  isDueToday,
  parseDate,
  toDateKey,
  todayKey,
} from './dates';
import { firstTransitionAt } from './transitions';
import type { ListTransition } from './transitions';

const DONE_LISTS_KEY = 'hubstaff_standup_done_lists_v1';

export const DEFAULT_DONE_LISTS = [
  'testing(pm)',
  'final testing(Ceo, cto...)',
  'Pushed/live',
  'done',
];

export interface StandupSettings {
  doneLists: string[];
}

export interface StandupItem {
  task: EnrichedTaskData;
  assignee: string;
  movedTo: string | null;
  movedAt: string | null;
  dueDate: string | null;
  daysOverdue: number;
  dueToday: boolean;
}

export interface StandupPerson {
  name: string;
  moved: StandupItem[];
  overdue: StandupItem[];
  todo: StandupItem[];
  blocked: StandupItem[];
  unverified: StandupItem[];
  wip: StandupItem[];
  movedByList: Record<string, number>;
}

export interface StandupResult {
  date: string;
  doneLists: string[];
  people: StandupPerson[];
  all: StandupPerson;
  firstTrackedAt: string | null;
}

export function loadStandupSettings(): StandupSettings {
  try {
    const raw = localStorage.getItem(DONE_LISTS_KEY);
    if (!raw) return { doneLists: [...DEFAULT_DONE_LISTS] };
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { doneLists: parsed.filter((value): value is string => typeof value === 'string') };
    }
  } catch (error) {
    console.warn('Could not read standup settings.', error);
  }
  return { doneLists: [...DEFAULT_DONE_LISTS] };
}

export function saveStandupSettings(settings: StandupSettings) {
  try {
    localStorage.setItem(DONE_LISTS_KEY, JSON.stringify(settings.doneLists));
  } catch (error) {
    console.warn('Could not persist standup settings.', error);
  }
}

function emptyPerson(name: string): StandupPerson {
  return {
    name,
    moved: [],
    overdue: [],
    todo: [],
    blocked: [],
    unverified: [],
    wip: [],
    movedByList: {},
  };
}

function dedupeItems(items: StandupItem[]): StandupItem[] {
  return Array.from(new Map(items.map((item) => [item.task.id, item])).values());
}

export function aggregateStandup(people: StandupPerson[]): StandupPerson {
  const moved = dedupeItems(people.flatMap((person) => person.moved));
  const movedByList: Record<string, number> = {};
  moved.forEach((item) => {
    if (item.movedTo) movedByList[item.movedTo] = (movedByList[item.movedTo] || 0) + 1;
  });

  return {
    name: 'All assignees',
    moved,
    overdue: dedupeItems(people.flatMap((person) => person.overdue)),
    todo: dedupeItems(people.flatMap((person) => person.todo)),
    blocked: dedupeItems(people.flatMap((person) => person.blocked)),
    unverified: dedupeItems(people.flatMap((person) => person.unverified)),
    wip: dedupeItems(people.flatMap((person) => person.wip)),
    movedByList,
  };
}

function transitionsByTask(transitions: ListTransition[]): Map<number, ListTransition[]> {
  const result = new Map<number, ListTransition[]>();
  transitions.forEach((transition) => {
    const list = result.get(transition.taskId) ?? [];
    list.push(transition);
    result.set(transition.taskId, list);
  });
  return result;
}

/**
 * Build the daily standup from:
 * - observed raw-list transitions (reliable move history)
 * - done_at for completed tasks (reliable completion timestamp)
 * - current effective status for overdue / To Do / blocked / WIP
 *
 * `updated_at` is only used for the separate "unverified recent updates" list.
 * It is never counted as a move.
 */
export function buildStandup(
  tasks: EnrichedTaskData[],
  mapping: StatusMapping,
  overrides: StatusOverrides,
  transitions: ListTransition[],
  date: string,
  doneLists: string[]
): StandupResult {
  const doneSet = new Set(doneLists);
  const today = todayKey();
  const people = new Map<string, StandupPerson>();
  const transitionsMap = transitionsByTask(transitions);

  const ensurePerson = (name: string): StandupPerson => {
    const existing = people.get(name);
    if (existing) return existing;
    const person = emptyPerson(name);
    people.set(name, person);
    return person;
  };

  tasks.forEach((task) => {
    const bucket = getEffectiveBucket(task, mapping, overrides);
    const dueDate = task.due_date;
    const late = getDaysOverdue(dueDate, today);
    const dueToday = isDueToday(dueDate, today);
    const dueOnOrBefore = isDueOnOrBefore(dueDate, today);
    const currentListIsDone = doneSet.has(task.board_status) && getListBucket(task, mapping) === 'done';

    // The latest observed list change on the selected day decides whether this
    // task moved into one of the configured done lists that day.
    const transitionsOnDate = (transitionsMap.get(task.id) ?? []).filter((transition) => {
      const observed = new Date(transition.at);
      return !Number.isNaN(observed.getTime()) && toDateKey(observed) === date;
    });
    const latestTransition = transitionsOnDate.reduce<ListTransition | null>(
      (latest, transition) =>
        !latest || new Date(transition.at).getTime() > new Date(latest.at).getTime() ? transition : latest,
      null
    );

    let movedTo: string | null = null;
    let movedAt: string | null = null;

    if (latestTransition && doneSet.has(latestTransition.to)) {
      movedTo = latestTransition.to;
      movedAt = latestTransition.at;
    }

    // Completed tasks have a reliable done_at timestamp, so they can be
    // backfilled without move history. Only use it while the task is still in
    // a list that maps to the Completed bucket.
    const doneAtDate = task.done_at && parseDate(task.done_at) ? toDateKey(parseDate(task.done_at) as Date) : null;
    if (!movedTo && currentListIsDone && doneAtDate === date) {
      movedTo = task.board_status;
      movedAt = task.done_at;
    }

    const updatedDate = parseDate(task.updated_at) ? toDateKey(parseDate(task.updated_at) as Date) : null;
    const unverified = !movedTo && doneSet.has(task.board_status) && updatedDate === date;

    const names = task.assignee_names.length > 0 ? task.assignee_names : ['Unassigned'];
    names.forEach((name) => {
      const person = ensurePerson(name);
      const item: StandupItem = {
        task,
        assignee: name,
        movedTo,
        movedAt,
        dueDate,
        daysOverdue: late,
        dueToday,
      };

      if (movedTo) person.moved.push(item);
      if (unverified) person.unverified.push(item);
      const activeWork = bucket === 'in_progress' || bucket === 'current_sprint';
      if (activeWork) person.wip.push(item);
      if (activeWork && late > 0) person.overdue.push(item);
      if (bucket === 'todo' && dueOnOrBefore) person.todo.push(item);
      if (bucket === 'blocked') person.blocked.push(item);
    });
  });

  const peopleList = Array.from(people.values());
  peopleList.forEach((person) => {
    const movedByList: Record<string, number> = {};
    person.moved.forEach((item) => {
      if (item.movedTo) movedByList[item.movedTo] = (movedByList[item.movedTo] || 0) + 1;
    });
    person.movedByList = movedByList;
  });

  const attentionCount = (person: StandupPerson) =>
    person.overdue.length + person.todo.length + person.blocked.length;

  peopleList.sort(
    (a, b) =>
      attentionCount(b) - attentionCount(a) ||
      b.moved.length - a.moved.length ||
      a.name.localeCompare(b.name)
  );

  return {
    date,
    doneLists: [...doneLists],
    people: peopleList,
    all: aggregateStandup(peopleList),
    firstTrackedAt: firstTransitionAt(transitions),
  };
}

export function getMovedBreakdown(movedByList: Record<string, number>): {
  pushed: number;
  testing: number;
  done: number;
  other: number;
} {
  let pushed = 0;
  let testing = 0;
  let done = 0;
  let other = 0;

  Object.entries(movedByList).forEach(([list, count]) => {
    if (/push|live/i.test(list)) pushed += count;
    else if (/test/i.test(list)) testing += count;
    else if (/^done$|complete/i.test(list)) done += count;
    else other += count;
  });

  return { pushed, testing, done, other };
}

export function buildStandupExportRows(
  result: StandupResult,
  personName: string,
  mapping: StatusMapping,
  overrides: StatusOverrides
): Record<string, unknown>[] {
  const people = personName === 'all' ? [result.all] : result.people.filter((person) => person.name === personName);
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const add = (items: StandupItem[], category: string) => {
    items.forEach((item) => {
      const key = `${category}:${item.task.id}`;
      if (seen.has(key)) return;
      seen.add(key);

      rows.push({
        Assignee:
          personName === 'all'
            ? item.task.assignee_names.join('; ') || 'Unassigned'
            : people[0]?.name ?? item.assignee,
        Category: category,
        ID: item.task.id,
        Title: item.task.subject,
        'Board List': item.task.board_status,
        Status: BUCKET_META[getEffectiveBucket(item.task, mapping, overrides)].label,
        'System Status': item.task.system_status,
        'Due Date': item.dueDate ? formatDate(item.dueDate) : '',
        'Days Overdue': item.dueDate ? item.daysOverdue : '',
        'Moved At': item.movedAt ? formatDateTime(item.movedAt) : '',
        'Updated At': formatDate(item.task.updated_at),
        'Done At': item.task.done_at ? formatDate(item.task.done_at) : '',
        'Estimate Hours': item.task.estimate_hours,
        Description: item.task.description,
      });
    });
  };

  people.forEach((person) => {
    add(person.moved, 'Moved forward');
    add(person.overdue, 'Overdue (In Progress)');
    add(person.todo, 'Due / Needs questioning');
    add(person.blocked, 'Blocked');
    add(person.unverified, 'Recent update (unverified)');
  });

  return rows;
}

export function buildStandupSummary(result: StandupResult, personName: string): string {
  const selected = personName === 'all' ? null : result.people.find((person) => person.name === personName);
  const person = selected ?? result.all;
  const lines: string[] = [`Standup · ${result.date}`, selected ? selected.name : 'All assignees', ''];

  if (!selected) {
    result.people.forEach((row) => {
      lines.push(
        `${row.name} — moved ${row.moved.length}, overdue ${row.overdue.length}, to-do ${row.todo.length}, blocked ${row.blocked.length}, unverified ${row.unverified.length}`
      );
    });
    lines.push('');
    lines.push(
      `Team total — moved ${result.all.moved.length}, overdue ${result.all.overdue.length}, to-do ${result.all.todo.length}, blocked ${result.all.blocked.length}, unverified ${result.all.unverified.length}`
    );
    return lines.join('\n');
  }

  lines.push(`Moved forward (tracked): ${person.moved.length}`);
  if (person.unverified.length > 0) lines.push(`Recent updates (unverified): ${person.unverified.length}`);
  lines.push(`Overdue (In Progress): ${person.overdue.length}`);
  lines.push(`Due / Needs questioning: ${person.todo.length}`);
  lines.push(`Blocked: ${person.blocked.length}`);

  if (person.moved.length > 0) {
    const breakdown = Object.entries(person.movedByList)
      .sort((a, b) => b[1] - a[1])
      .map(([list, count]) => `${list} ${count}`)
      .join(' · ');
    lines.push(`Moved breakdown: ${breakdown}`);
  }

  const addList = (title: string, items: StandupItem[]) => {
    if (items.length === 0) return;
    lines.push('', title);
    items.slice(0, 8).forEach((item) => {
      const due = item.dueDate
        ? ` — due ${formatDate(item.dueDate)}${
            item.daysOverdue > 0 ? ` (${item.daysOverdue}d overdue)` : item.dueToday ? ' (today)' : ''
          }`
        : '';
      const moved = item.movedTo ? ` → ${item.movedTo}` : '';
      lines.push(`- #${item.task.id} ${item.task.subject}${moved}${due}`);
    });
    if (items.length > 8) lines.push(`…and ${items.length - 8} more`);
  };

  addList('Needs questioning', person.todo);
  addList('Overdue', person.overdue);
  addList('Moved forward', person.moved);
  addList('Blocked', person.blocked);

  if (person.unverified.length > 0) {
    lines.push('', 'Recent updates (unverified — not counted as done):');
    person.unverified.slice(0, 8).forEach((item) => {
      lines.push(`- #${item.task.id} ${item.task.subject} — ${item.task.board_status}`);
    });
    if (person.unverified.length > 8) lines.push(`…and ${person.unverified.length - 8} more`);
  }

  return lines.join('\n');
}
