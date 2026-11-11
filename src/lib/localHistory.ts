import { downloadJson } from './csv';
import { fileTimestamp } from './dates';

/**
 * Browser-local history is not part of the Hubstaff API. This module lets the
 * archive page export/import the app's own snapshot and list-move history so it
 * survives the move to the static archive. Token keys are deliberately excluded.
 */
export const LOCAL_HISTORY_KEYS = [
  'hubstaff_snapshots_v1',
  'hubstaff_task_list_state_v1',
  'hubstaff_list_transitions_v1',
  'hubstaff_status_map_v1',
  'hubstaff_status_map_default_v1',
  'hubstaff_task_overrides_v1',
  'hubstaff_dashboard_filters_v1',
  'hubstaff_standup_person_v1',
  'hubstaff_standup_done_lists_v1',
] as const;

type HistoryKey = (typeof LOCAL_HISTORY_KEYS)[number];

export interface LocalHistoryFile {
  version: 1;
  exportedAt: string;
  origin: string;
  entries: Partial<Record<HistoryKey, unknown>>;
}

function parseStored(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function buildLocalHistory(): LocalHistoryFile {
  const entries: Partial<Record<HistoryKey, unknown>> = {};
  LOCAL_HISTORY_KEYS.forEach((key) => {
    const parsed = parseStored(localStorage.getItem(key));
    if (parsed !== undefined) entries[key] = parsed;
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    entries,
  };
}

export function downloadLocalHistory() {
  downloadJson(buildLocalHistory(), `hubstaff-local-history_${fileTimestamp()}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeSnapshots(existing: unknown, incoming: unknown): unknown {
  if (!isRecord(existing)) return incoming;
  if (!isRecord(incoming)) return existing;
  return { ...existing, ...incoming };
}

function mergeState(existing: unknown, incoming: unknown): unknown {
  if (!isRecord(existing)) return incoming;
  if (!isRecord(incoming)) return existing;
  return { ...existing, ...incoming };
}

function mergeTransitions(existing: unknown, incoming: unknown): unknown {
  const current = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [];
  const seen = new Set<string>();
  const merged: unknown[] = [];

  [...current, ...next].forEach((entry) => {
    if (!isRecord(entry)) return;
    const key = `${entry.taskId}|${entry.at}|${entry.from}|${entry.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(entry);
  });

  return merged;
}

export interface ImportResult {
  keys: string[];
  imported: number;
}

/**
 * Merge a previously exported history file into localStorage. Existing entries
 * are kept; snapshots/state prefer the imported value for the same key/date and
 * list transitions are de-duplicated.
 */
export function importLocalHistory(raw: unknown): ImportResult {
  const source = isRecord(raw) && isRecord(raw.entries) ? raw.entries : raw;
  if (!isRecord(source)) throw new Error('This file does not contain a history object.');

  const importedKeys: string[] = [];
  LOCAL_HISTORY_KEYS.forEach((key) => {
    if (!(key in source)) return;
    const incoming = source[key];
    if (incoming === undefined) return;

    let value: unknown = incoming;
    if (key === 'hubstaff_snapshots_v1') {
      value = mergeSnapshots(parseStored(localStorage.getItem(key)), incoming);
    } else if (key === 'hubstaff_task_list_state_v1') {
      value = mergeState(parseStored(localStorage.getItem(key)), incoming);
    } else if (key === 'hubstaff_list_transitions_v1') {
      value = mergeTransitions(parseStored(localStorage.getItem(key)), incoming);
    }

    localStorage.setItem(key, JSON.stringify(value));
    importedKeys.push(key);
  });

  if (importedKeys.length === 0) {
    throw new Error('No recognized Hubstaff history keys were found in this file.');
  }

  return { keys: importedKeys, imported: importedKeys.length };
}

export function localHistorySummary(): { snapshots: number; transitions: number; stateEntries: number } {
  const snapshots = parseStored(localStorage.getItem('hubstaff_snapshots_v1'));
  const transitions = parseStored(localStorage.getItem('hubstaff_list_transitions_v1'));
  const state = parseStored(localStorage.getItem('hubstaff_task_list_state_v1'));

  return {
    snapshots: isRecord(snapshots) ? Object.keys(snapshots).length : 0,
    transitions: Array.isArray(transitions) ? transitions.length : 0,
    stateEntries: isRecord(state) ? Object.keys(state).length : 0,
  };
}
