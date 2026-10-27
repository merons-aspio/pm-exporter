import type { EnrichedTaskData } from '../services/hubstaff';
import { toDateKey } from './dates';

const STATE_KEY = 'hubstaff_task_list_state_v1';
const TRANSITIONS_KEY = 'hubstaff_list_transitions_v1';
const MAX_TRANSITION_DAYS = 365;

export interface ListTransition {
  taskId: number;
  /** When the app observed the list change. */
  at: string;
  from: string;
  to: string;
}

interface TaskListState {
  list: string;
  at: string;
}

type TaskListStateMap = Record<string, TaskListState>;

function loadState(): TaskListStateMap {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const result: TaskListStateMap = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([taskId, value]) => {
      if (!value || typeof value !== 'object') return;
      const state = value as Record<string, unknown>;
      if (typeof state.list !== 'string') return;
      result[taskId] = {
        list: state.list,
        at: typeof state.at === 'string' ? state.at : new Date().toISOString(),
      };
    });
    return result;
  } catch (error) {
    console.warn('Could not read task list state.', error);
    return {};
  }
}

function saveState(state: TaskListStateMap) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Could not persist task list state.', error);
  }
}

export function loadTransitions(): ListTransition[] {
  try {
    const raw = localStorage.getItem(TRANSITIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .map((value) => ({
        taskId: Number(value.taskId),
        at: typeof value.at === 'string' ? value.at : '',
        from: typeof value.from === 'string' ? value.from : '',
        to: typeof value.to === 'string' ? value.to : '',
      }))
      .filter(
        (transition) =>
          Number.isFinite(transition.taskId) &&
          transition.at !== '' &&
          transition.from !== '' &&
          transition.to !== ''
      );
  } catch (error) {
    console.warn('Could not read list transitions.', error);
    return [];
  }
}

function saveTransitions(transitions: ListTransition[]) {
  try {
    localStorage.setItem(TRANSITIONS_KEY, JSON.stringify(transitions));
  } catch (error) {
    console.warn('Could not persist list transitions.', error);
  }
}

function pruneTransitions(transitions: ListTransition[]): ListTransition[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_TRANSITION_DAYS);
  const cutoffKey = toDateKey(cutoff);
  return transitions.filter((transition) => {
    const date = new Date(transition.at);
    if (Number.isNaN(date.getTime())) return false;
    return toDateKey(date) >= cutoffKey;
  });
}

/**
 * Compare the current raw board list of every task with the last observed
 * state and append transitions for anything that moved.
 *
 * We deliberately track raw lists, not effective buckets:
 * - changing a status mapping must not create fake move history
 * - task overrides are current decisions, not historical moves
 *
 * The timestamp is when the app observed the change. `updated_at` is not used
 * because editing a task also changes it.
 */
export function recordListTransitions(tasks: EnrichedTaskData[]): ListTransition[] {
  const now = new Date().toISOString();
  const previousState = loadState();
  const transitions = loadTransitions();
  const nextState: TaskListStateMap = {};

  tasks.forEach((task) => {
    const previous = previousState[String(task.id)];

    if (previous && previous.list !== task.board_status) {
      transitions.push({
        taskId: task.id,
        at: now,
        from: previous.list,
        to: task.board_status,
      });
    }

    // Only current tasks stay in the state map, so deleted tasks are dropped.
    nextState[String(task.id)] = { list: task.board_status, at: now };
  });

  saveState(nextState);
  const pruned = pruneTransitions(transitions);
  saveTransitions(pruned);
  return pruned;
}

export function firstTransitionAt(transitions: ListTransition[]): string | null {
  if (transitions.length === 0) return null;
  return transitions.reduce(
    (earliest, transition) => (transition.at < earliest ? transition.at : earliest),
    transitions[0].at
  );
}
