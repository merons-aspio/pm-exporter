import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cardStyle } from './components/ui';
import { useTasks } from './hooks/useTasks';
import { useStatusSettings } from './hooks/useStatusSettings';
import { captureSnapshot, loadSnapshots } from './lib/snapshots';
import type { SnapshotStore } from './lib/snapshots';
import { loadTransitions, recordListTransitions } from './lib/transitions';
import type { ListTransition } from './lib/transitions';
import { formatDateTime } from './lib/dates';
import TasksPage from './pages/TasksPage';
import DashboardPage from './pages/DashboardPage';

type View = 'tasks' | 'dashboard';

function getViewFromHash(): View {
  return window.location.hash.replace('#/', '') === 'dashboard' ? 'dashboard' : 'tasks';
}

export default function App() {
  const { tasks, loading, error, lastSyncedAt, sync } = useTasks();
  const {
    mapping,
    overrides,
    hasSavedDefault,
    updateMapping,
    setAsDefault,
    resetMappingToDefault,
    resetMappingToBuiltIn,
    setOverride,
  } = useStatusSettings();
  const [snapshots, setSnapshots] = useState<SnapshotStore>(() => loadSnapshots());
  const [transitions, setTransitions] = useState<ListTransition[]>(() => loadTransitions());
  const [view, setView] = useState<View>(getViewFromHash);

  useEffect(() => {
    const onHashChange = () => setView(getViewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Capture/refresh today's aggregate snapshot and record observed list moves
  // whenever data or status settings change.
  useEffect(() => {
    if (tasks.length === 0) return;
    setSnapshots(captureSnapshot(tasks, mapping, overrides));
    setTransitions(recordListTransitions(tasks));
  }, [tasks, mapping, overrides]);

  const navigate = (next: View) => {
    window.location.hash = next === 'dashboard' ? '#/dashboard' : '#/tasks';
    setView(next);
  };

  const firstLoad = loading && tasks.length === 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        padding: '1.5rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.1rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.55rem', color: '#0f172a' }}>Hubstaff PM Exporter</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.86rem' }}>
            Marketplace 2.0.0 · {firstLoad ? 'Loading tasks…' : `${tasks.length} tasks`}
            {lastSyncedAt ? ` · last synced ${formatDateTime(lastSyncedAt)}` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              overflow: 'hidden',
              backgroundColor: '#fff',
            }}
          >
            {(['tasks', 'dashboard'] as const).map((item) => (
              <button
                key={item}
                onClick={() => navigate(item)}
                style={{
                  padding: '0.5rem 0.9rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  backgroundColor: view === item ? '#0f766e' : '#fff',
                  color: view === item ? '#fff' : '#475569',
                }}
              >
                {item === 'tasks' ? 'Tasks' : 'Dashboard'}
              </button>
            ))}
          </div>

          <button
            onClick={sync}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.85rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
            {loading ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            color: '#b91c1c',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            padding: '0.8rem 1rem',
            borderRadius: 6,
            marginBottom: '1rem',
          }}
        >
          <span>
            <strong>Could not load tasks.</strong> {error}
          </span>
          <button
            onClick={sync}
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.78rem',
              border: '1px solid #fca5a5',
              borderRadius: 4,
              backgroundColor: '#fff',
              color: '#b91c1c',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {firstLoad ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#64748b', padding: '3rem' }}>
          Loading Marketplace 2.0.0 tasks…
        </div>
      ) : view === 'tasks' ? (
        <TasksPage tasks={tasks} mapping={mapping} overrides={overrides} onOverride={setOverride} />
      ) : (
        <DashboardPage
          tasks={tasks}
          mapping={mapping}
          overrides={overrides}
          snapshots={snapshots}
          transitions={transitions}
          lastSyncedAt={lastSyncedAt}
          syncing={loading}
          onSync={sync}
          onMappingChange={updateMapping}
          onSetMappingDefault={setAsDefault}
          onResetMappingToDefault={resetMappingToDefault}
          onResetMappingToBuiltIn={resetMappingToBuiltIn}
          hasSavedDefault={hasSavedDefault}
        />
      )}

      <p style={{ marginTop: '1.25rem', fontSize: '0.72rem', color: '#94a3b8' }}>
        Status mappings and task overrides are saved locally. Daily snapshots are captured on every load/sync and kept
        for 90 days; past days without a snapshot are shown as approximate.
      </p>
    </div>
  );
}
