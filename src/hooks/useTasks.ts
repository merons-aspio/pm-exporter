import { useCallback, useEffect, useState } from 'react';
import type { EnrichedTaskData } from '../services/hubstaff';
import { loadArchiveManifest, loadArchiveProjectTasks } from '../lib/archive';

/**
 * Frozen archive loader for the default dashboard project (Marketplace 2.0.0).
 * It reads static JSON from /archive and never calls Hubstaff or /api/auth.
 * Deleted tasks are archived too, but the dashboard keeps its original scope:
 * current tasks only. The Archive page is the lifetime view.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<EnrichedTaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      const manifest = await loadArchiveManifest(force);
      const projectId = manifest.defaultProjectId;
      if (!projectId) throw new Error('No accessible project was found in the archive manifest.');

      const allTasks = await loadArchiveProjectTasks(projectId, manifest, force);
      setTasks(allTasks.filter((task) => !task.removed));
      setLastSyncedAt(manifest.capturedAt);
      setProjectName(
        manifest.projects.find((project) => project.id === projectId)?.name ?? null
      );
    } catch (caught) {
      setError(String((caught as Error).message || caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    tasks,
    loading,
    error,
    lastSyncedAt,
    projectName,
    sync: () => {
      void load(true);
    },
  };
}
