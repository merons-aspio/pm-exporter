import type { EnrichedTaskData } from '../services/hubstaff';
import { getEffectiveBucket, getListBucketByName } from './status';
import type { Bucket, StatusMapping, StatusOverrides } from './status';
import type { BoardState } from './snapshots';
import {
  daysOverdue,
  endOfDayMs,
  getTestingRange,
  isInRange,
  parseDate,
  startOfDayMs,
} from './dates';
import type { TestingTimeframe } from './dates';
import type { ListTransition } from './transitions';

export type DashboardStatus =
  | 'icebox'
  | 'current_sprint'
  | 'todo'
  | 'in_progress'
  | 'testing'
  | 'blocked'
  | 'pushed';

export const DASHBOARD_STATUS_ORDER: DashboardStatus[] = [
  'icebox',
  'current_sprint',
  'todo',
  'in_progress',
  'testing',
  'blocked',
  'pushed',
];

export interface DashboardStatusMeta {
  label: string;
  hint: string;
  accent: string;
  bg: string;
  border: string;
  bar: string;
  description: string;
}

export const DASHBOARD_STATUS_META: Record<DashboardStatus, DashboardStatusMeta> = {
  icebox: {
    label: 'Icebox',
    hint: 'Parked items',
    accent: '#64748b',
    bg: '#f8fafc',
    border: '#e2e8f0',
    bar: '#94a3b8',
    description: 'Parked work that is not scheduled yet.',
  },
  current_sprint: {
    label: 'Current Sprint',
    hint: 'Active scope',
    accent: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    bar: '#3b82f6',
    description: 'Tasks in the current sprint scope.',
  },
  todo: {
    label: 'To-Do',
    hint: 'Pending focus',
    accent: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    bar: '#f59e0b',
    description: 'Queued work that has not started yet.',
  },
  in_progress: {
    label: 'In Progress',
    hint: 'Overdue action',
    accent: '#b45309',
    bg: '#fff7ed',
    border: '#fed7aa',
    bar: '#d97706',
    description: 'Work actively underway outside the sprint list.',
  },
  testing: {
    label: 'Testing',
    hint: 'QA verification',
    accent: '#7c3aed',
    bg: '#faf5ff',
    border: '#e9d5ff',
    bar: '#a855f7',
    description: 'Tasks waiting on or undergoing QA verification.',
  },
  blocked: {
    label: 'Blocked',
    hint: 'Needs unblock',
    accent: '#e11d48',
    bg: '#fff1f2',
    border: '#fecdd3',
    bar: '#f43f5e',
    description: 'Tasks that cannot move forward until an issue is resolved.',
  },
  pushed: {
    label: 'Pushed/Live',
    hint: 'Delivered',
    accent: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    bar: '#10b981',
    description: 'Delivered work, including completed tasks.',
  },
};

export function emptyDashboardCounts(): Record<DashboardStatus, number> {
  return {
    icebox: 0,
    current_sprint: 0,
    todo: 0,
    in_progress: 0,
    testing: 0,
    blocked: 0,
    pushed: 0,
  };
}

/**
 * Dashboard status is a presentation layer over the internal buckets:
 * - `backlog` becomes Icebox
 * - `current_sprint` stays separate from In Progress
 * - `pushed` and `done` both count as delivered
 */
export function getDashboardStatus(
  task: EnrichedTaskData,
  mapping: StatusMapping,
  overrides: StatusOverrides
): DashboardStatus {
  const bucket = getEffectiveBucket(task, mapping, overrides);

  switch (bucket) {
    case 'backlog':
      return 'icebox';
    case 'current_sprint':
      return 'current_sprint';
    case 'todo':
      return 'todo';
    case 'in_progress':
      return 'in_progress';
    case 'testing':
      return 'testing';
    case 'blocked':
      return 'blocked';
    case 'pushed':
    case 'done':
      return 'pushed';
  }
}

export function countDashboardStatuses(
  tasks: EnrichedTaskData[],
  mapping: StatusMapping,
  overrides: StatusOverrides
): Record<DashboardStatus, number> {
  const counts = emptyDashboardCounts();
  tasks.forEach((task) => {
    counts[getDashboardStatus(task, mapping, overrides)] += 1;
  });
  return counts;
}

export function dashboardCountsFromBoard(board: BoardState): Record<DashboardStatus, number> {
  return {
    icebox: board.byBucket.backlog,
    current_sprint: board.byBucket.current_sprint,
    todo: board.byBucket.todo,
    in_progress: board.byBucket.in_progress,
    testing: board.byBucket.testing,
    blocked: board.byBucket.blocked,
    pushed: board.byBucket.pushed + board.byBucket.done,
  };
}

export function sumDashboardCounts(counts: Record<DashboardStatus, number>): number {
  return DASHBOARD_STATUS_ORDER.reduce((total, status) => total + counts[status], 0);
}

export interface DashboardStatusCountRow {
  status: DashboardStatus;
  label: string;
  count: number;
}

export function dashboardStatusRows(
  counts: Record<DashboardStatus, number>
): DashboardStatusCountRow[] {
  return DASHBOARD_STATUS_ORDER.map((status) => ({
    status,
    label: DASHBOARD_STATUS_META[status].label,
    count: counts[status],
  }));
}

export type HealthKey = 'action' | 'high' | 'healthy' | 'idle';
export type HealthTone = 'rose' | 'amber' | 'emerald' | 'slate';

export interface AssigneePerformance {
  name: string;
  initials: string;
  pushed: number;
  overdue: number;
  overduePastDue: number;
  overdueApproximate: boolean;
  blocked: number;
  testing: number;
  inProgress: number;
  todo: number;
  sprint: number;
  total: number;
  health: HealthKey;
  healthLabel: string;
  healthTone: HealthTone;
}

function initialsFor(name: string): string {
  if (!name || name === 'Unassigned') return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function healthFor(
  blocked: number,
  overdue: number,
  total: number
): { health: HealthKey; healthLabel: string; healthTone: HealthTone } {
  if (total === 0) return { health: 'idle', healthLabel: 'No Work', healthTone: 'slate' };
  if (blocked > 0) return { health: 'action', healthLabel: 'Requires Action', healthTone: 'rose' };
  if (overdue > 6) return { health: 'high', healthLabel: 'High Workload', healthTone: 'amber' };
  return { health: 'healthy', healthLabel: 'Healthy Flow', healthTone: 'emerald' };
}

function tasksByAssignee(tasks: EnrichedTaskData[]): Map<string, EnrichedTaskData[]> {
  const result = new Map<string, EnrichedTaskData[]>();

  tasks.forEach((task) => {
    const names = task.assignee_names.length > 0 ? task.assignee_names : ['Unassigned'];
    names.forEach((name) => {
      const list = result.get(name) ?? [];
      list.push(task);
      result.set(name, list);
    });
  });

  return result;
}

/**
 * Assignee rows are built from the stored board counts so snapshot days work.
 * Overdue needs task-level due dates: for live/approximate boards we count open
 * In Progress + To-Do tasks and track how many are genuinely past due. Old
 * snapshots do not store due dates, so they fall back to the open count and are
 * flagged as approximate.
 */
export function computeAssigneePerformance(
  board: BoardState,
  boardTasks: EnrichedTaskData[] | null,
  mapping: StatusMapping,
  overrides: StatusOverrides
): AssigneePerformance[] {
  const tasksLookup = boardTasks ? tasksByAssignee(boardTasks) : null;
  const rows: AssigneePerformance[] = [];

  Object.entries(board.byAssigneeBucket).forEach(([name, counts]) => {
    const pushed = counts.pushed + counts.done;
    const blocked = counts.blocked;
    const testing = counts.testing;
    const inProgress = counts.in_progress;
    const todo = counts.todo;
    const sprint = counts.current_sprint;
    const total =
      counts.backlog +
      counts.current_sprint +
      counts.todo +
      counts.in_progress +
      counts.testing +
      counts.blocked +
      counts.pushed +
      counts.done;

    const open = todo + inProgress;
    let overduePastDue = 0;

    if (tasksLookup) {
      const personTasks = tasksLookup.get(name) ?? [];
      personTasks.forEach((task) => {
        const status = getDashboardStatus(task, mapping, overrides);
        if (status !== 'todo' && status !== 'in_progress') return;
        if (!task.done && daysOverdue(task.due_date, board.date) > 0) overduePastDue += 1;
      });
    }

    const health = healthFor(blocked, open, total);

    rows.push({
      name,
      initials: initialsFor(name),
      pushed,
      overdue: open,
      overduePastDue,
      overdueApproximate: !tasksLookup,
      blocked,
      testing,
      inProgress,
      todo,
      sprint,
      total,
      ...health,
    });
  });

  return rows
    .filter((row) => row.total > 0)
    .sort(
      (a, b) =>
        b.blocked - a.blocked ||
        b.overdue - a.overdue ||
        b.pushed - a.pushed ||
        a.name.localeCompare(b.name)
    );
}

export interface TestingQueueItem {
  task: EnrichedTaskData;
  assignee: string;
  enteredAt: string;
  approximate: boolean;
}

export interface TestingQueue {
  items: TestingQueueItem[];
  label: string;
  available: boolean;
  approximate: boolean;
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

function latestTransitionInto(
  taskId: number,
  transitions: Map<number, ListTransition[]>,
  mapping: StatusMapping,
  bucket: Bucket
): ListTransition | null {
  const list = transitions.get(taskId) ?? [];
  let latest: ListTransition | null = null;

  list.forEach((transition) => {
    if (getListBucketByName(transition.to, mapping) !== bucket) return;
    if (!latest || new Date(transition.at).getTime() > new Date(latest.at).getTime()) {
      latest = transition;
    }
  });

  return latest;
}

/**
 * Currently-Testing tasks that entered Testing within the selected window.
 * Hubstaff does not expose a testing timestamp, so observed list transitions
 * are the reliable source. If none exist for a task, `updated_at` is used and
 * the row is marked approximate.
 */
export function buildTestingQueue(
  boardTasks: EnrichedTaskData[] | null,
  transitions: ListTransition[],
  mapping: StatusMapping,
  overrides: StatusOverrides,
  timeframe: TestingTimeframe
): TestingQueue {
  const range = getTestingRange(timeframe);

  if (!boardTasks) {
    return { items: [], label: range.label, available: false, approximate: false };
  }

  const transitionMap = transitionsByTask(transitions);
  const start = startOfDayMs(range.start);
  const end = endOfDayMs(range.end);
  const items: TestingQueueItem[] = [];

  boardTasks.forEach((task) => {
    if (getEffectiveBucket(task, mapping, overrides) !== 'testing') return;

    const transition = latestTransitionInto(task.id, transitionMap, mapping, 'testing');
    const enteredAt = transition?.at ?? task.updated_at;
    if (!enteredAt || !isInRange(enteredAt, start, end)) return;

    items.push({
      task,
      assignee: task.assignee_names.join(', ') || 'Unassigned',
      enteredAt,
      approximate: !transition,
    });
  });

  items.sort((a, b) => {
    const aTime = parseDate(a.enteredAt)?.getTime() ?? 0;
    const bTime = parseDate(b.enteredAt)?.getTime() ?? 0;
    return aTime - bTime;
  });

  return {
    items,
    label: range.label,
    available: true,
    approximate: items.some((item) => item.approximate),
  };
}

export interface BlockedItem {
  task: EnrichedTaskData;
  assignee: string;
  reason: string;
  blockedSince: string;
  approximate: boolean;
}

function summarizeReason(value: string, max = 120): string {
  const singleLine = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!singleLine) return 'No reason recorded in Hubstaff.';
  return singleLine.length > max ? `${singleLine.slice(0, max)}…` : singleLine;
}

export function buildBlockedItems(
  boardTasks: EnrichedTaskData[] | null,
  transitions: ListTransition[],
  mapping: StatusMapping,
  overrides: StatusOverrides
): BlockedItem[] {
  if (!boardTasks) return [];

  const transitionMap = transitionsByTask(transitions);
  const items: BlockedItem[] = [];

  boardTasks.forEach((task) => {
    if (getEffectiveBucket(task, mapping, overrides) !== 'blocked') return;

    const transition = latestTransitionInto(task.id, transitionMap, mapping, 'blocked');
    items.push({
      task,
      assignee: task.assignee_names.join(', ') || 'Unassigned',
      reason: summarizeReason(task.description),
      blockedSince: transition?.at ?? task.updated_at,
      approximate: !transition,
    });
  });

  return items.sort((a, b) => {
    const aTime = parseDate(a.blockedSince)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = parseDate(b.blockedSince)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

/** Human duration from a timestamp to the end of the reference day. */
export function formatDurationSince(value: string, referenceKey: string): string {
  const date = parseDate(value);
  if (!date) return 'Unknown';

  const ms = endOfDayMs(referenceKey) - date.getTime();
  if (ms <= 0) return 'Less than 1 hour';

  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Less than 1 hour';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
