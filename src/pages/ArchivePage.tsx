import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  Archive,
  CheckSquare,
  Clock,
  Download,
  FileText,
  Folder,
  Layers,
  MessageSquare,
  Paperclip,
  Upload,
  Users,
} from 'lucide-react';
import type { EnrichedTaskData } from '../services/hubstaff';
import type { StatusMapping, StatusOverrides } from '../lib/status';
import {
  formatDuration,
  formatHours,
  loadAllArchiveTasks,
  loadArchiveDeep,
  loadArchiveManifest,
  loadArchiveProjectTasks,
} from '../lib/archive';
import type { ArchiveDeepFile, ArchiveManifest, ArchiveProjectSummary } from '../lib/archive';
import {
  downloadLocalHistory,
  importLocalHistory,
  localHistorySummary,
} from '../lib/localHistory';
import { formatDateTime } from '../lib/dates';
import { useToast } from '../components/ToastProvider';
import TasksPage from './TasksPage';
import ArchiveTaskModal from '../components/archive/ArchiveTaskModal';

interface ArchivePageProps {
  mapping: StatusMapping;
  overrides: StatusOverrides;
}

type Scope = 'all' | number;

function SummaryCard({
  label,
  value,
  sub,
  icon,
  tone = 'slate',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  tone?: 'slate' | 'indigo' | 'rose' | 'emerald' | 'amber';
}) {
  const tones: Record<string, string> = {
    slate: 'border-slate-200 bg-white text-slate-900',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
  };

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${tones[tone]}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wide opacity-70">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[0.72rem] opacity-70">{sub}</div>}
    </div>
  );
}

function deepBadge(project: ArchiveProjectSummary) {
  if (!project.accessible) return 'bg-rose-100 text-rose-700';
  if (project.deepStatus === 'complete') return 'bg-emerald-100 text-emerald-700';
  if (project.deepStatus === 'partial') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

function deepLabel(project: ArchiveProjectSummary) {
  if (!project.accessible) return 'No task access';
  if (project.deepStatus === 'complete') return 'Deep complete';
  if (project.deepStatus === 'partial') return `Deep ${project.deepCounts.capturedTasks}/${project.taskCount}`;
  return 'Deep pending';
}

export default function ArchivePage({ mapping, overrides }: ArchivePageProps) {
  const toast = useToast();
  const [manifest, setManifest] = useState<ArchiveManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [tasks, setTasks] = useState<EnrichedTaskData[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<EnrichedTaskData | null>(null);
  const [deep, setDeep] = useState<ArchiveDeepFile | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [history, setHistory] = useState(localHistorySummary);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadArchiveManifest()
      .then((next) => {
        if (cancelled) return;
        setManifest(next);
        setScope('all');
      })
      .catch((error) => {
        if (!cancelled) setManifestError(String(error.message || error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    setTasksLoading(true);
    setTasksError(null);

    const load =
      scope === 'all'
        ? loadAllArchiveTasks(manifest).then((result) => {
            if (result.errors.length > 0) {
              setTasksError(
                `Some projects could not be loaded: ${result.errors
                  .map((error) => `#${error.projectId}`)
                  .join(', ')}`
              );
            }
            return result.tasks;
          })
        : loadArchiveProjectTasks(scope, manifest);

    load
      .then((next) => {
        if (!cancelled) setTasks(next);
      })
      .catch((error) => {
        if (!cancelled) setTasksError(String(error.message || error));
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [manifest, scope]);

  useEffect(() => {
    if (!selectedTask) {
      setDeep(null);
      setDeepError(null);
      setDeepLoading(false);
      return;
    }

    const projectId = selectedTask.project_id;
    if (!projectId) {
      setDeep(null);
      setDeepError(null);
      setDeepLoading(false);
      return;
    }

    let cancelled = false;
    setDeep(null);
    setDeepError(null);
    setDeepLoading(true);
    loadArchiveDeep(projectId)
      .then((next) => {
        if (!cancelled) setDeep(next);
      })
      .catch((error) => {
        if (!cancelled) setDeepError(String(error.message || error));
      })
      .finally(() => {
        if (!cancelled) setDeepLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTask]);

  const scopeSummary = useMemo<ArchiveProjectSummary | null>(() => {
    if (!manifest || scope === 'all') return null;
    return manifest.projects.find((project) => project.id === scope) ?? null;
  }, [manifest, scope]);

  const summary = useMemo(() => {
    if (!manifest) return null;
    if (scope === 'all') return manifest.totals;
    if (!scopeSummary) return null;
    return {
      projects: 1,
      accessibleProjects: scopeSummary.accessible ? 1 : 0,
      inaccessibleProjects: scopeSummary.accessible ? 0 : 1,
      tasks: scopeSummary.taskCount,
      activeTasks: scopeSummary.activeTaskCount,
      removedTasks: scopeSummary.removedTaskCount,
      lists: scopeSummary.listCount,
      labels: scopeSummary.labelCount,
      members: manifest.totals.members,
      estimatedHours: scopeSummary.estimatedHours,
      comments: scopeSummary.deepCounts.comments,
      checklists: scopeSummary.deepCounts.checklists,
      checklistItems: scopeSummary.deepCounts.checklistItems,
      attachments: scopeSummary.deepCounts.attachments,
      timeEntries: scopeSummary.deepCounts.timeEntries,
      timeSeconds: scopeSummary.deepCounts.timeSeconds,
    };
  }, [manifest, scope, scopeSummary]);

  const visibleProjects = useMemo(() => {
    if (!manifest) return [];
    const query = projectSearch.trim().toLowerCase();
    return manifest.projects.filter((project) => {
      if (!query) return true;
      return `${project.name} ${project.folderName || ''}`.toLowerCase().includes(query);
    });
  }, [manifest, projectSearch]);

  const handleScopeChange = (value: string) => {
    setScope(value === 'all' ? 'all' : Number(value));
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const result = importLocalHistory(JSON.parse(text));
      setHistory(localHistorySummary());
      toast.push(
        `Imported ${result.imported} history section${result.imported === 1 ? '' : 's'}. Reload the page to apply it to the dashboard.`,
        'success'
      );
    } catch (error) {
      toast.push(`Could not import history: ${String((error as Error).message || error)}`, 'error');
    }
  };

  if (manifestError) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          Could not load the archive manifest. {manifestError}
        </div>
      </main>
    );
  }

  if (!manifest || !summary) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Loading lifetime archive…
        </div>
      </main>
    );
  }

  const scopeLabel =
    scope === 'all' ? 'All accessible projects' : scopeSummary?.name || `Project #${scope}`;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.72rem] font-bold text-emerald-700">
            <Archive className="h-3.5 w-3.5" />
            Read-only archive · captured {formatDateTime(manifest.capturedAt)}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Lifetime Hubstaff archive</h1>
          <p className="max-w-3xl text-sm text-slate-500">
            Every task the current Hubstaff token can read, including deleted records, across{' '}
            {manifest.totals.accessibleProjects} accessible projects. Nothing on this page syncs or writes to
            Hubstaff.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              downloadLocalHistory();
              toast.push('Local snapshot and transition history downloaded.', 'success');
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            title="Download daily snapshots, list moves, mappings and local settings"
          >
            <Download className="h-3.5 w-3.5" />
            History ({history.snapshots} days)
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5" />
            Import history
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">
              Archive scope
            </span>
            <select
              value={scope}
              onChange={(event) => handleScopeChange(event.target.value)}
              className="min-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="all">All accessible projects ({manifest.totals.accessibleProjects})</option>
              {manifest.projects
                .filter((project) => project.accessible)
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} · {project.taskCount} tasks
                  </option>
                ))}
            </select>
          </label>

          <div className="text-xs text-slate-500">
            {tasksLoading ? (
              'Loading archived tasks…'
            ) : (
              <>
                <strong className="text-slate-800">{tasks.length}</strong> tasks loaded ·{' '}
                {tasks.filter((task) => task.removed).length} removed
              </>
            )}
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Projects"
          value={`${summary.accessibleProjects}/${summary.projects}`}
          sub={summary.inaccessibleProjects > 0 ? `${summary.inaccessibleProjects} not readable` : 'All readable'}
          icon={<Folder className="h-3.5 w-3.5" />}
          tone="indigo"
        />
        <SummaryCard
          label="Tasks"
          value={String(summary.tasks)}
          sub={`${summary.activeTasks} active · ${summary.removedTasks} removed`}
          icon={<Layers className="h-3.5 w-3.5" />}
        />
        <SummaryCard
          label="Estimated hours"
          value={formatHours(summary.estimatedHours)}
          sub="All archived records"
          icon={<Clock className="h-3.5 w-3.5" />}
          tone="amber"
        />
        <SummaryCard
          label="Members"
          value={String(summary.members)}
          sub="Organization members"
          icon={<Users className="h-3.5 w-3.5" />}
        />
        <SummaryCard
          label="Time logged"
          value={formatDuration(summary.timeSeconds)}
          sub={`${summary.timeEntries} time entries`}
          icon={<Clock className="h-3.5 w-3.5" />}
          tone="emerald"
        />
        <SummaryCard
          label="Comments"
          value={String(summary.comments)}
          sub="Deep capture"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
        />
        <SummaryCard
          label="Checklists"
          value={String(summary.checklists)}
          sub={`${summary.checklistItems} items`}
          icon={<CheckSquare className="h-3.5 w-3.5" />}
        />
        <SummaryCard
          label="Attachments"
          value={String(summary.attachments)}
          sub="Metadata only"
          icon={<Paperclip className="h-3.5 w-3.5" />}
        />
        <SummaryCard
          label="Lists / labels"
          value={`${summary.lists} / ${summary.labels}`}
          sub="Board structure"
          icon={<FileText className="h-3.5 w-3.5" />}
        />
        <SummaryCard
          label="Removed tasks"
          value={String(summary.removedTasks)}
          sub="Still visible in archive"
          icon={<Archive className="h-3.5 w-3.5" />}
          tone="rose"
        />
      </section>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Project browser</h2>
            <p className="text-xs text-slate-500">
              {manifest.organization?.name || 'Hubstaff organization'} · click a readable project to scope the task
              matrix
            </p>
          </div>
          <input
            type="search"
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            placeholder="Search projects or folders…"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:w-64"
          />
        </div>

        <div className="max-h-[280px] overflow-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[0.68rem] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Folder</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2 text-right">Tasks</th>
                <th className="px-3 py-2 text-right">Active</th>
                <th className="px-3 py-2 text-right">Removed</th>
                <th className="px-3 py-2 text-right">Lists</th>
                <th className="px-3 py-2 text-right">Labels</th>
                <th className="px-3 py-2">Deep data</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => project.accessible && setScope(project.id)}
                  className={`border-t border-slate-100 text-sm ${
                    project.accessible ? 'cursor-pointer hover:bg-indigo-50/60' : 'bg-slate-50/60 text-slate-400'
                  } ${scope === project.id ? 'bg-indigo-50' : ''}`}
                >
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {project.name}
                    {scope === project.id && <span className="ml-2 text-[0.65rem] font-bold text-indigo-600">SELECTED</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{project.folderName || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        project.archived ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {project.archived ? 'Archived' : 'Active'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{project.accessible ? project.taskCount : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{project.accessible ? project.activeTaskCount : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{project.accessible ? project.removedTaskCount : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{project.listCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{project.labelCount}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${deepBadge(project)}`}>
                      {deepLabel(project)}
                    </span>
                  </td>
                </tr>
              ))}
              {visibleProjects.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-400">
                    No projects match the search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {manifest.totals.inaccessibleProjects > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <strong>{manifest.totals.inaccessibleProjects} projects could not be read</strong> with the current Hubstaff
          token. They are listed above as “No task access” and were not archived. If those projects matter, re-run the
          exporter with an admin/OAuth token that can access them before the API is suspended.
        </div>
      )}

      {tasksError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {tasksError}
        </div>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Task matrix</h2>
            <p className="text-xs text-slate-500">
              {scopeLabel} · filters, sorting, pagination and CSV/JSON/TXT export all work on the frozen data.
              Click a task title for its full archived detail.
            </p>
          </div>
        </div>

        {tasksLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Loading archived tasks…
          </div>
        ) : (
          <TasksPage
            tasks={tasks}
            mapping={mapping}
            overrides={overrides}
            title="Lifetime task archive"
            description={scopeLabel}
            exportBaseName={`archive-${scope === 'all' ? 'all-projects' : scope}`}
            showProject
            showRemoved
            readOnly
            onTaskClick={setSelectedTask}
          />
        )}
      </section>

      {selectedTask && (
        <ArchiveTaskModal
          task={selectedTask}
          deep={deep}
          deepLoading={deepLoading}
          deepError={deepError}
          members={manifest.members}
          mapping={mapping}
          overrides={overrides}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </main>
  );
}
