import type { EnrichedTaskData } from '../services/hubstaff';
import { getEffectiveBucket, getListBucketByName } from './status';
import type { Bucket, StatusMapping, StatusOverrides } from './status';
import {
  daysOverdue,
  endOfDayMs,
  getTestingRange,
  isInRange,
  parseDate,
  startOfDayMs,
} from './dates';
import type { TestingTimeframe, WeekStart } from './dates';
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

export type DashboardDateBasis = 'updated' | 'created' | 'due';
export type DashboardStatusMode = 'period' | 'all';
export type DashboardStatusModes = Record<DashboardStatus, DashboardStatusMode>;
export type DashboardPeriodRange = { start: string; end: string };

export const DASHBOARD_DATE_BASIS_LABEL: Record<DashboardDateBasis, string> = {
  updated: 'Updated date',
  created: 'Created date',
  due: 'Due date',
};

export const DASHBOARD_DATE_BASIS_OPTIONS: Array<{ value: DashboardDateBasis; label: string }> = [
  { value: 'updated', label: DASHBOARD_DATE_BASIS_LABEL.updated },
  { value: 'created', label: DASHBOARD_DATE_BASIS_LABEL.created },
  { value: 'due', label: DASHBOARD_DATE_BASIS_LABEL.due },
];

const DASHBOARD_SETTINGS_KEY = 'hubstaff_dashboard_filters_v1';

export interface DashboardFilterSettings {
  dateBasis: DashboardDateBasis;
  weekStart: WeekStart;
  statusModes: DashboardStatusModes;
}

export function emptyStatusModes(mode: DashboardStatusMode = 'period'): DashboardStatusModes {
  return {
    icebox: mode,
    current_sprint: mode,
    todo: mode,
    in_progress: mode,
    testing: mode,
    blocked: mode,
    pushed: mode,
  };
}

export function isDashboardDateBasis(value: string): value is DashboardDateBasis {
  return value === 'updated' || value === 'created' || value === 'due';
}

export function isDashboardStatusMode(value: string): value is DashboardStatusMode {
  return value === 'period' || value === 'all';
}

export function isWeekStart(value: string): value is WeekStart {
  return value === 'monday' || value === 'friday' || value === 'saturday';
}

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

function usableDate(value: string | null | undefined): string | null {
  return value && parseDate(value) ? value : null;
}

/**
 * The date used by the dashboard for a task. Updated-date filtering falls back
 * to Created date when Hubstaff has no usable updated timestamp.
 */
export function getDashboardTaskDate(
  task: EnrichedTaskData,
  basis: DashboardDateBasis
): string | null {
  switch (basis) {
    case 'updated':
      return usableDate(task.updated_at) ?? usableDate(task.created_at);
    case 'created':
      return usableDate(task.created_at);
    case 'due':
      return usableDate(task.due_date) ?? usableDate(task.due_on) ?? usableDate(task.due_at);
  }
}

export function isTaskInDashboardRange(
  task: EnrichedTaskData,
  basis: DashboardDateBasis,
  range: DashboardPeriodRange
): boolean {
  const value = getDashboardTaskDate(task, basis);
  if (!value) return false;
  const time = parseDate(value)?.getTime();
  if (time === undefined) return false;
  return time >= startOfDayMs(range.start) && time <= endOfDayMs(range.end);
}

export interface DashboardStatusSummaryEntry {
  status: DashboardStatus;
  filtered: number;
  total: number;
  effective: number;
  mode: DashboardStatusMode;
}

export type DashboardStatusSummary = Record<DashboardStatus, DashboardStatusSummaryEntry>;

export function summarizeDashboardStatuses(
  tasks: EnrichedTaskData[],
  mapping: StatusMapping,
  overrides: StatusOverrides,
  range: DashboardPeriodRange,
  basis: DashboardDateBasis,
  modes: DashboardStatusModes
): DashboardStatusSummary {
  const summary = {} as DashboardStatusSummary;
  DASHBOARD_STATUS_ORDER.forEach((status) => {
    summary[status] = {
      status,
      filtered: 0,
      total: 0,
      effective: 0,
      mode: modes[status],
    };
  });

  tasks.forEach((task) => {
    const status = getDashboardStatus(task, mapping, overrides);
    const entry = summary[status];
    entry.total += 1;
    if (isTaskInDashboardRange(task, basis, range)) entry.filtered += 1;
  });

  DASHBOARD_STATUS_ORDER.forEach((status) => {
    const entry = summary[status];
    entry.effective = entry.mode === 'all' ? entry.total : entry.filtered;
  });

  return summary;
}

export function effectiveDashboardCounts(
  summary: DashboardStatusSummary
): Record<DashboardStatus, number> {
  const counts = emptyDashboardCounts();
  DASHBOARD_STATUS_ORDER.forEach((status) => {
    counts[status] = summary[status].effective;
  });
  return counts;
}

export function totalDashboardCounts(
  summary: DashboardStatusSummary
): Record<DashboardStatus, number> {
  const counts = emptyDashboardCounts();
  DASHBOARD_STATUS_ORDER.forEach((status) => {
    counts[status] = summary[status].total;
  });
  return counts;
}

function summaryForTask(
  task: EnrichedTaskData,
  status: DashboardStatus,
  range: DashboardPeriodRange,
  basis: DashboardDateBasis,
  modes: DashboardStatusModes
): boolean {
  return modes[status] === 'all' || isTaskInDashboardRange(task, basis, range);
}

export function filterTasksForStatus(
  tasks: EnrichedTaskData[],
  status: DashboardStatus,
  mapping: StatusMapping,
  overrides: StatusOverrides,
  range: DashboardPeriodRange,
  basis: DashboardDateBasis,
  modes: DashboardStatusModes
): EnrichedTaskData[] {
  return tasks.filter(
    (task) =>
      getDashboardStatus(task, mapping, overrides) === status &&
      summaryForTask(task, status, range, basis, modes)
  );
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
 * Assignee counts use the same period, date basis and per-status Period/All
 * modes as the KPI cards. Overdue remains the open To-Do + In Progress count,
 * with a past-due subset shown when due dates are available.
 */
export function computeAssigneePerformance(
  tasks: EnrichedTaskData[],
  mapping: StatusMapping,
  overrides: StatusOverrides,
  range: DashboardPeriodRange,
  basis: DashboardDateBasis,
  modes: DashboardStatusModes
): AssigneePerformance[] {
  const rows: AssigneePerformance[] = [];

  tasksByAssignee(tasks).forEach((personTasks, name) => {
    const counts = emptyDashboardCounts();
    let overduePastDue = 0;

    personTasks.forEach((task) => {
      const status = getDashboardStatus(task, mapping, overrides);
      if (!summaryForTask(task, status, range, basis, modes)) return;

      counts[status] += 1;

      if (
        (status === 'todo' || status === 'in_progress') &&
        !task.done &&
        daysOverdue(task.due_date, range.end) > 0
      ) {
        overduePastDue += 1;
      }
    });

    const total = sumDashboardCounts(counts);
    if (total === 0) return;

    const open = counts.todo + counts.in_progress;
    const health = healthFor(counts.blocked, open, total);

    rows.push({
      name,
      initials: initialsFor(name),
      pushed: counts.pushed,
      overdue: open,
      overduePastDue,
      overdueApproximate: false,
      blocked: counts.blocked,
      testing: counts.testing,
      inProgress: counts.in_progress,
      todo: counts.todo,
      sprint: counts.current_sprint,
      total,
      ...health,
    });
  });

  return rows.sort(
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

export interface TestingQueueOptions {
  range: DashboardPeriodRange;
  basis: DashboardDateBasis;
  mode: DashboardStatusMode;
  weekStart: WeekStart;
  referenceDate: string;
}

/**
 * Currently-Testing tasks that pass the dashboard period filter and entered
 * Testing within the selected Daily/Weekly/Monthly QA window. The outer
 * dashboard filter applies first; the QA window is a second, more precise one.
 */
export function buildTestingQueue(
  boardTasks: EnrichedTaskData[] | null,
  transitions: ListTransition[],
  mapping: StatusMapping,
  overrides: StatusOverrides,
  timeframe: TestingTimeframe,
  options: TestingQueueOptions
): TestingQueue {
  const range = getTestingRange(timeframe, options.weekStart, options.referenceDate);

  if (!boardTasks) {
    return { items: [], label: range.label, available: false, approximate: false };
  }

  const transitionMap = transitionsByTask(transitions);
  const start = startOfDayMs(range.start);
  const end = endOfDayMs(range.end);
  const items: TestingQueueItem[] = [];

  boardTasks.forEach((task) => {
    if (getEffectiveBucket(task, mapping, overrides) !== 'testing') return;
    if (
      options.mode === 'period' &&
      !isTaskInDashboardRange(task, options.basis, options.range)
    ) {
      return;
    }

    const transition = latestTransitionInto(task.id, transitionMap, mapping, 'testing');
    const enteredAt = transition?.at ?? task.updated_at ?? task.created_at;
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

export function loadDashboardFilterSettings(): DashboardFilterSettings {
  const defaults: DashboardFilterSettings = {
    dateBasis: 'updated',
    weekStart: 'monday',
    statusModes: emptyStatusModes('period'),
  };

  try {
    const raw = localStorage.getItem(DASHBOARD_SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<DashboardFilterSettings> | null;
    if (!parsed || typeof parsed !== 'object') return defaults;

    const dateBasis = isDashboardDateBasis(String(parsed.dateBasis))
      ? (parsed.dateBasis as DashboardDateBasis)
      : defaults.dateBasis;
    const weekStart = isWeekStart(String(parsed.weekStart))
      ? (parsed.weekStart as WeekStart)
      : defaults.weekStart;
    const statusModes = { ...defaults.statusModes };
    const rawModes = parsed.statusModes as Partial<DashboardStatusModes> | undefined;

    DASHBOARD_STATUS_ORDER.forEach((status) => {
      const value = String(rawModes?.[status] ?? '');
      if (isDashboardStatusMode(value)) statusModes[status] = value;
    });

    return { dateBasis, weekStart, statusModes };
  } catch {
    return defaults;
  }
}

export function saveDashboardFilterSettings(settings: DashboardFilterSettings): void {
  try {
    localStorage.setItem(DASHBOARD_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable; the in-memory choices still work.
  }
}
