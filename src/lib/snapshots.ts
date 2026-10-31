import type { EnrichedTaskData } from '../services/hubstaff';
import { emptyBucketCounts, getEffectiveBucket } from './status';
import type { Bucket, StatusMapping, StatusOverrides } from './status';
import { endOfDayMs, parseDate, toDateKey, todayKey } from './dates';

const SNAPSHOTS_KEY = 'hubstaff_snapshots_v1';
const MAX_SNAPSHOT_DAYS = 90;

export type BoardSource = 'live' | 'snapshot' | 'approximate';

export interface DaySnapshot {
  date: string;
  capturedAt: string;
  total: number;
  byBucket: Record<Bucket, number>;
  byAssigneeBucket: Record<string, Record<Bucket, number>>;
  byList: Record<string, number>;
  byAssigneeList: Record<string, Record<string, number>>;
}

export type SnapshotStore = Record<string, DaySnapshot>;

export interface BoardState {
  date: string;
  source: BoardSource;
  capturedAt?: string;
  total: number;
  byBucket: Record<Bucket, number>;
  byAssigneeBucket: Record<string, Record<Bucket, number>>;
  byList: Record<string, number>;
  byAssigneeList: Record<string, Record<string, number>>;
}

function normalizeBuckets(raw: Partial<Record<Bucket, number>> | undefined): Record<Bucket, number> {
  const counts = emptyBucketCounts();
  if (raw) {
    (Object.keys(counts) as Bucket[]).forEach((bucket) => {
      counts[bucket] = Number(raw[bucket]) || 0;
    });
  }
  return counts;
}

function normalizeAssigneeBuckets(
  raw: Record<string, Record<Bucket, number>> | undefined
): Record<string, Record<Bucket, number>> {
  const result: Record<string, Record<Bucket, number>> = {};
  if (raw) {
    Object.entries(raw).forEach(([name, counts]) => {
      result[name] = normalizeBuckets(counts);
    });
  }
  return result;
}

function normalizeAssigneeLists(
  raw: Record<string, Record<string, number>> | undefined
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  if (raw) {
    Object.entries(raw).forEach(([name, lists]) => {
      result[name] = { ...lists };
    });
  }
  return result;
}

export function loadSnapshots(): SnapshotStore {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as SnapshotStore;
    return {};
  } catch (error) {
    console.warn('Could not read snapshots.', error);
    return {};
  }
}

function saveSnapshots(store: SnapshotStore) {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn('Could not persist snapshots.', error);
  }
}

function prune(store: SnapshotStore): SnapshotStore {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_SNAPSHOT_DAYS);
  const cutoffKey = toDateKey(cutoff);
  const pruned: SnapshotStore = {};

  Object.entries(store).forEach(([date, snapshot]) => {
    if (date >= cutoffKey) pruned[date] = snapshot;
  });

  return pruned;
}

function buildLiveBoard(
  tasks: EnrichedTaskData[],
  mapping: StatusMapping,
  overrides: StatusOverrides,
  date: string,
  source: BoardSource
): BoardState {
  const byBucket = emptyBucketCounts();
  const byAssigneeBucket: Record<string, Record<Bucket, number>> = {};
  const byList: Record<string, number> = {};
  const byAssigneeList: Record<string, Record<string, number>> = {};

  tasks.forEach((task) => {
    const bucket = getEffectiveBucket(task, mapping, overrides);
    byBucket[bucket] += 1;
    byList[task.board_status] = (byList[task.board_status] || 0) + 1;

    const names = task.assignee_names.length > 0 ? task.assignee_names : ['Unassigned'];
    names.forEach((name) => {
      if (!byAssigneeBucket[name]) byAssigneeBucket[name] = emptyBucketCounts();
      byAssigneeBucket[name][bucket] += 1;

      if (!byAssigneeList[name]) byAssigneeList[name] = {};
      byAssigneeList[name][task.board_status] = (byAssigneeList[name][task.board_status] || 0) + 1;
    });
  });

  return {
    date,
    source,
    total: tasks.length,
    byBucket,
    byAssigneeBucket,
    byList,
    byAssigneeList,
  };
}

/**
 * Capture (or refresh) today's aggregate snapshot. Only counts are stored so
 * 90 days fits comfortably in localStorage next to the task cache.
 */
export function captureSnapshot(
  tasks: EnrichedTaskData[],
  mapping: StatusMapping,
  overrides: StatusOverrides
): SnapshotStore {
  const store = prune(loadSnapshots());
  const date = todayKey();
  const live = buildLiveBoard(tasks, mapping, overrides, date, 'live');

  store[date] = {
    date,
    capturedAt: new Date().toISOString(),
    total: live.total,
    byBucket: live.byBucket,
    byAssigneeBucket: live.byAssigneeBucket,
    byList: live.byList,
    byAssigneeList: live.byAssigneeList,
  };

  saveSnapshots(store);
  return store;
}

/**
 * Board state for a specific day:
 * - today -> live
 * - past day with a stored snapshot -> exact captured counts
 * - past day without a snapshot -> approximate (tasks created by that day,
 *   using their current list mapping / overrides)
 */
export function getBoardForDate(
  date: string,
  tasks: EnrichedTaskData[],
  mapping: StatusMapping,
  overrides: StatusOverrides,
  snapshots: SnapshotStore
): BoardState {
  if (date === todayKey()) {
    return buildLiveBoard(tasks, mapping, overrides, date, 'live');
  }

  const snapshot = snapshots[date];
  if (snapshot) {
    const byBucket = normalizeBuckets(snapshot.byBucket);
    const byAssigneeBucket = normalizeAssigneeBuckets(snapshot.byAssigneeBucket);

    // Migrate snapshots captured before Current Sprint became its own bucket:
    // those counts were folded into In Progress. The raw list counts are still
    // present, so split them back out when the snapshot is read.
    if (!Object.prototype.hasOwnProperty.call(snapshot.byBucket, 'current_sprint')) {
      const legacySprint = Number(snapshot.byList?.['Current sprint']) || 0;
      if (legacySprint > 0) {
        byBucket.current_sprint = legacySprint;
        byBucket.in_progress = Math.max(0, byBucket.in_progress - legacySprint);
      }

      Object.entries(byAssigneeBucket).forEach(([name, counts]) => {
        const sprint = Number(snapshot.byAssigneeList?.[name]?.['Current sprint']) || 0;
        if (sprint <= 0) return;
        counts.current_sprint = sprint;
        counts.in_progress = Math.max(0, counts.in_progress - sprint);
      });
    }

    return {
      date,
      source: 'snapshot',
      capturedAt: snapshot.capturedAt,
      total: snapshot.total,
      byBucket,
      byAssigneeBucket,
      byList: { ...snapshot.byList },
      byAssigneeList: normalizeAssigneeLists(snapshot.byAssigneeList),
    };
  }

  const end = endOfDayMs(date);
  const eligible = tasks.filter((task) => {
    const created = parseDate(task.created_at);
    return created !== null && created.getTime() <= end;
  });

  return buildLiveBoard(eligible, mapping, overrides, date, 'approximate');
}
