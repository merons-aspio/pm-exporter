import type { EnrichedTaskData } from '../services/hubstaff';

export type Bucket = 'backlog' | 'todo' | 'in_progress' | 'testing' | 'blocked' | 'pushed' | 'done';

export type StatusMapping = Record<string, Bucket>;
export type StatusOverrides = Record<string, Bucket>;

export const BUCKET_ORDER: Bucket[] = [
  'backlog',
  'todo',
  'in_progress',
  'testing',
  'blocked',
  'pushed',
  'done',
];

export const BUCKET_META: Record<Bucket, { label: string; bg: string; color: string; bar: string }> = {
  backlog: { label: 'Backlog', bg: '#f1f5f9', color: '#475569', bar: '#94a3b8' },
  todo: { label: 'To Do', bg: '#e0f2fe', color: '#0369a1', bar: '#38bdf8' },
  in_progress: { label: 'In Progress', bg: '#fef3c7', color: '#b45309', bar: '#f59e0b' },
  testing: { label: 'Testing', bg: '#ede9fe', color: '#6d28d9', bar: '#8b5cf6' },
  blocked: { label: 'Blocked', bg: '#fee2e2', color: '#b91c1c', bar: '#ef4444' },
  pushed: { label: 'Pushed / Live', bg: '#cffafe', color: '#0e7490', bar: '#06b6d4' },
  done: { label: 'Completed', bg: '#d1fae5', color: '#047857', bar: '#10b981' },
};

export const DEFAULT_LIST_MAPPING: StatusMapping = {
  Icebox: 'backlog',
  'To-do': 'todo',
  'Current sprint': 'in_progress',
  'in progress': 'in_progress',
  'testing(pm)': 'testing',
  'final testing(Ceo, cto...)': 'testing',
  blocked: 'blocked',
  'Pushed/live': 'pushed',
  done: 'done',
};

export function isBucket(value: string): value is Bucket {
  return (BUCKET_ORDER as string[]).includes(value);
}

export function emptyBucketCounts(): Record<Bucket, number> {
  return {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    testing: 0,
    blocked: 0,
    pushed: 0,
    done: 0,
  };
}

/**
 * Resolve the bucket for a raw board list. Explicit mappings always win; the
 * fuzzy fallbacks only protect against a renamed or newly-added list.
 */
export function getListBucket(task: EnrichedTaskData, mapping: StatusMapping): Bucket {
  const mapped = mapping[task.board_status];
  if (mapped) return mapped;

  const name = task.board_status.toLowerCase();
  if (name.includes('testing')) return 'testing';
  if (name.includes('blocked')) return 'blocked';
  if (name.includes('progress') || name.includes('sprint')) return 'in_progress';
  if (name.includes('push') || name.includes('live')) return 'pushed';
  if (name === 'done' || name.includes('complete')) return 'done';
  if (name.includes('icebox') || name.includes('backlog')) return 'backlog';
  return 'todo';
}

export function getEffectiveBucket(
  task: EnrichedTaskData,
  mapping: StatusMapping,
  overrides: StatusOverrides
): Bucket {
  return overrides[String(task.id)] ?? getListBucket(task, mapping);
}
