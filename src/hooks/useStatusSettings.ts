import { useState } from 'react';
import { DEFAULT_LIST_MAPPING, isBucket } from '../lib/status';
import type { Bucket, StatusMapping, StatusOverrides } from '../lib/status';

const MAPPING_KEY = 'hubstaff_status_map_v1';
const MAPPING_DEFAULT_KEY = 'hubstaff_status_map_default_v1';
const OVERRIDES_KEY = 'hubstaff_task_overrides_v1';

function parseMapping(raw: string | null, fallback: StatusMapping): StatusMapping {
  const result: StatusMapping = { ...fallback };
  if (!raw) return result;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed as Record<string, unknown>).forEach(([list, bucket]) => {
        if (typeof bucket === 'string' && isBucket(bucket)) result[list] = bucket;
      });
    }
  } catch (error) {
    console.warn('Could not read status mapping.', error);
  }

  return result;
}

function loadSavedDefault(): StatusMapping {
  try {
    return parseMapping(localStorage.getItem(MAPPING_DEFAULT_KEY), DEFAULT_LIST_MAPPING);
  } catch {
    return { ...DEFAULT_LIST_MAPPING };
  }
}

function hasStoredDefault(): boolean {
  try {
    return localStorage.getItem(MAPPING_DEFAULT_KEY) !== null;
  } catch {
    return false;
  }
}

function loadMapping(): StatusMapping {
  try {
    return parseMapping(localStorage.getItem(MAPPING_KEY), loadSavedDefault());
  } catch {
    return loadSavedDefault();
  }
}

function loadOverrides(): StatusOverrides {
  const result: StatusOverrides = {};

  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return result;

    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed as Record<string, unknown>).forEach(([taskId, bucket]) => {
        if (typeof bucket === 'string' && isBucket(bucket)) result[taskId] = bucket;
      });
    }
  } catch (error) {
    console.warn('Could not read task status overrides.', error);
  }

  return result;
}

function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not persist ${key}.`, error);
  }
}

export function useStatusSettings() {
  const [mapping, setMapping] = useState<StatusMapping>(loadMapping);
  const [savedDefault, setSavedDefault] = useState<StatusMapping>(loadSavedDefault);
  const [hasSavedDefault, setHasSavedDefault] = useState<boolean>(hasStoredDefault);
  const [overrides, setOverrides] = useState<StatusOverrides>(loadOverrides);

  const updateMapping = (list: string, bucket: Bucket) => {
    setMapping((current) => {
      const next = { ...current, [list]: bucket };
      persist(MAPPING_KEY, next);
      return next;
    });
  };

  /** Save the mapping currently on screen as the user's reset baseline. */
  const setAsDefault = () => {
    const next = { ...mapping };
    persist(MAPPING_DEFAULT_KEY, next);
    setSavedDefault(next);
    setHasSavedDefault(true);
  };

  const resetMappingToDefault = () => {
    const next = { ...savedDefault };
    persist(MAPPING_KEY, next);
    setMapping(next);
  };

  const resetMappingToBuiltIn = () => {
    const next = { ...DEFAULT_LIST_MAPPING };
    persist(MAPPING_KEY, next);
    setMapping(next);
  };

  const setOverride = (taskId: number, bucket: Bucket | null) => {
    setOverrides((current) => {
      const next = { ...current };
      if (bucket) next[String(taskId)] = bucket;
      else delete next[String(taskId)];
      persist(OVERRIDES_KEY, next);
      return next;
    });
  };

  return {
    mapping,
    overrides,
    hasSavedDefault,
    updateMapping,
    setAsDefault,
    resetMappingToDefault,
    resetMappingToBuiltIn,
    setOverride,
  };
}
