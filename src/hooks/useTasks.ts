import { useEffect, useState } from 'react';
import { fetchProjectTasksRich } from '../services/hubstaff';
import type { EnrichedTaskData } from '../services/hubstaff';

// Marketplace 2.0.0 on the tasks.hubstaff.com service (NOT the v2 API id 3685595)
const MARKETPLACE_PROJECT_ID = 1110971;
const CACHE_KEY = 'hubstaff_mkt_rich_m2';
const LAST_SYNC_KEY = 'hubstaff_mkt_last_sync_v1';

export function useTasks() {
  const [tasks, setTasks] = useState<EnrichedTaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const load = async (forceRefresh: boolean) => {
    setLoading(true);
    setError(null);

    try {
      if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const parsed: unknown = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setTasks(parsed as EnrichedTaskData[]);
              setLastSyncedAt(localStorage.getItem(LAST_SYNC_KEY));
              setLoading(false);
              return;
            }
          } catch (parseError) {
            console.warn('Ignoring corrupt task cache.', parseError);
          }
        }
      }

      const richTasks = await fetchProjectTasksRich(MARKETPLACE_PROJECT_ID);
      const now = new Date().toISOString();

      setTasks(richTasks);
      setLastSyncedAt(now);

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(richTasks));
      } catch (cacheError) {
        // 2,195 tasks with descriptions can exceed the ~5 MB localStorage quota
        console.warn('Task cache exceeds localStorage quota; keeping data in memory only.', cacheError);
      }

      try {
        localStorage.setItem(LAST_SYNC_KEY, now);
      } catch (syncError) {
        console.warn('Could not persist the last-sync timestamp.', syncError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching Marketplace tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => {
    void load(true);
  };

  return { tasks, loading, error, lastSyncedAt, sync };
}
