import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Kanban, RefreshCw } from 'lucide-react';
import { useTasks } from './hooks/useTasks';
import { useStatusSettings } from './hooks/useStatusSettings';
import { useToast } from './components/ToastProvider';
import { captureSnapshot, loadSnapshots } from './lib/snapshots';
import type { SnapshotStore } from './lib/snapshots';
import { loadTransitions, recordListTransitions } from './lib/transitions';
import type { ListTransition } from './lib/transitions';
import { formatDateTime, formatPeriodLabel, getPeriodRange, todayKey } from './lib/dates';
import type { PeriodKey, WeekStart } from './lib/dates';
import {
  emptyStatusModes,
  loadDashboardFilterSettings,
  saveDashboardFilterSettings,
} from './lib/dashboard';
import type {
  DashboardDateBasis,
  DashboardStatus,
  DashboardStatusMode,
} from './lib/dashboard';
import TasksPage from './pages/TasksPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ExportStudioModal from './components/ExportStudioModal';
import type { ExportScope } from './components/ExportStudioModal';

type View = 'tasks' | 'dashboard' | 'login';

function getViewFromHash(): View {
  const hash = window.location.hash.replace('#/', '');
  if (hash === 'tasks') return 'tasks';
  if (hash === 'login') return 'login';
  return 'dashboard';
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
  const toast = useToast();
  const [snapshots, setSnapshots] = useState<SnapshotStore>(() => loadSnapshots());
  const [transitions, setTransitions] = useState<ListTransition[]>(() => loadTransitions());
  const [view, setView] = useState<View>(getViewFromHash);
  const [period, setPeriod] = useState<PeriodKey>('thisWeek');
  const [customStart, setCustomStart] = useState(todayKey());
  const [customEnd, setCustomEnd] = useState(todayKey());
  const [dashboardFilters, setDashboardFilters] = useState(loadDashboardFilterSettings);
  const [exportOpen, setExportOpen] = useState(false);
  const [defaultExportScope, setDefaultExportScope] = useState<ExportScope>('dashboard');
  const lastErrorRef = useRef<string | null>(null);

  const { dateBasis, weekStart, statusModes } = dashboardFilters;

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

  useEffect(() => {
    saveDashboardFilterSettings(dashboardFilters);
  }, [dashboardFilters]);

  useEffect(() => {
    if (error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      toast.push(`Could not load tasks: ${error}`, 'error');
    }
  }, [error, toast]);

  const range = useMemo(
    () => getPeriodRange(period, customStart, customEnd, weekStart),
    [period, customStart, customEnd, weekStart]
  );

  const setDateBasis = (next: DashboardDateBasis) => {
    setDashboardFilters((current) => ({ ...current, dateBasis: next }));
  };

  const setWeekStart = (next: WeekStart) => {
    setDashboardFilters((current) => ({ ...current, weekStart: next }));
  };

  const setStatusMode = (status: DashboardStatus, mode: DashboardStatusMode) => {
    setDashboardFilters((current) => ({
      ...current,
      statusModes: { ...current.statusModes, [status]: mode },
    }));
  };

  const setAllStatusModes = (mode: DashboardStatusMode) => {
    setDashboardFilters((current) => ({
      ...current,
      statusModes: emptyStatusModes(mode),
    }));
  };

  const navigate = (next: View) => {
    window.location.hash = next === 'dashboard' ? '#/dashboard' : next === 'login' ? '#/login' : '#/tasks';
    setView(next);
  };

  const openExportStudio = () => {
    setDefaultExportScope(view === 'tasks' ? 'tasks' : 'dashboard');
    setExportOpen(true);
  };

  if (view === 'login') {
    return <LoginPage />;
  }

  const firstLoad = loading && tasks.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="flex items-center gap-3 text-left"
          >
            <div className="flex items-center justify-center rounded-lg bg-indigo-600 p-2 text-white shadow-md shadow-indigo-100">
              <Kanban className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-900">Hubstaff PM Simplifier</h1>
              <p className="text-xs font-medium text-slate-500">
                Clean &amp; Focused PM Analytics
                {!firstLoad ? ` · ${tasks.length} tasks` : ''}
              </p>
            </div>
          </button>

          <nav className="order-3 flex w-full rounded-xl border border-slate-200/60 bg-slate-100 p-1 text-sm font-medium md:order-none md:w-auto">
            {(['dashboard', 'tasks'] as const).map((item) => {
              const active = view === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => navigate(item)}
                  className={`flex-1 rounded-lg px-4 py-1.5 font-semibold transition-all md:flex-none ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item === 'dashboard' ? 'Dashboard' : 'Tasks Matrix'}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={sync}
              disabled={loading}
              title={lastSyncedAt ? `Last synced ${formatDateTime(lastSyncedAt)}` : 'Sync tasks'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Sync tasks"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={openExportStudio}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-95"
            >
              <Download className="h-4 w-4" />
              <span>Export Data</span>
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 flex w-full max-w-7xl flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="flex-1">
            <strong>Could not load tasks.</strong> {error}
          </span>
          <button
            type="button"
            onClick={sync}
            className="rounded border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {firstLoad ? (
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
            Loading Marketplace 2.0.0 tasks…
          </div>
        </main>
      ) : view === 'tasks' ? (
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-900">Tasks Matrix</h2>
            <p className="text-sm text-slate-500">
              Filter, inspect and export the full Marketplace 2.0.0 task set.
            </p>
          </div>
          <TasksPage tasks={tasks} mapping={mapping} overrides={overrides} onOverride={setOverride} />
        </main>
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
          period={period}
          customStart={customStart}
          customEnd={customEnd}
          dateBasis={dateBasis}
          weekStart={weekStart}
          statusModes={statusModes}
          onSelectPeriod={setPeriod}
          onCustomRangeChange={(start, end) => {
            setCustomStart(start);
            setCustomEnd(end);
          }}
          onDateBasisChange={setDateBasis}
          onWeekStartChange={setWeekStart}
          onStatusModeChange={setStatusMode}
          onSetAllStatusModes={setAllStatusModes}
          onOpenTasks={() => navigate('tasks')}
        />
      )}

      <footer className="mx-auto w-full max-w-7xl px-4 pb-6 pt-2 text-[11px] text-slate-400 sm:px-6 lg:px-8">
        Status mappings and task overrides are saved locally. Daily snapshots are captured on every
        load/sync and kept for 90 days; past days without a snapshot are shown as approximate.
      </footer>

      <ExportStudioModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaultScope={defaultExportScope}
        tasks={tasks}
        mapping={mapping}
        overrides={overrides}
        range={range}
        periodLabel={formatPeriodLabel(period, range, weekStart)}
        dateBasis={dateBasis}
        weekStart={weekStart}
        statusModes={statusModes}
      />
    </div>
  );
}
