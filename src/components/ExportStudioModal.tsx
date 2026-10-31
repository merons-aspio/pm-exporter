import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DownloadCloud,
  FileJson,
  FileSpreadsheet,
  FileText,
  Info,
  X,
} from 'lucide-react';
import type { EnrichedTaskData } from '../services/hubstaff';
import type { StatusMapping } from '../lib/status';
import {
  DASHBOARD_DATE_BASIS_LABEL,
  DASHBOARD_STATUS_META,
  DASHBOARD_STATUS_ORDER,
  computeAssigneePerformance,
  countDashboardStatuses,
  getDashboardStatus,
  summarizeDashboardStatuses,
  type DashboardDateBasis,
  type DashboardStatus,
  type DashboardStatusModes,
} from '../lib/dashboard';
import { WEEK_START_OPTIONS, fileTimestamp } from '../lib/dates';
import type { WeekStart } from '../lib/dates';
import { buildStrictExportRows } from '../lib/exportRows';
import { downloadCsv, downloadJson, downloadText } from '../lib/csv';
import { useToast } from './ToastProvider';

export type ExportScope = 'dashboard' | 'tasks';
type ExportFormat = 'csv' | 'json' | 'txt';

interface ExportStudioModalProps {
  open: boolean;
  onClose: () => void;
  defaultScope: ExportScope;
  tasks: EnrichedTaskData[];
  mapping: StatusMapping;
  range: { start: string; end: string };
  periodLabel: string;
  dateBasis: DashboardDateBasis;
  weekStart: WeekStart;
  statusModes: DashboardStatusModes;
}

const FORMATS: Array<{ value: ExportFormat; label: string; icon: typeof FileSpreadsheet; color: string }> = [
  { value: 'csv', label: 'CSV File', icon: FileSpreadsheet, color: 'text-emerald-600' },
  { value: 'json', label: 'JSON Format', icon: FileJson, color: 'text-amber-600' },
  { value: 'txt', label: 'TXT / File', icon: FileText, color: 'text-indigo-600' },
];

const WEEK_START_LABEL = Object.fromEntries(
  WEEK_START_OPTIONS.map((option) => [option.value, option.label])
) as Record<WeekStart, string>;

function modeLabel(mode: DashboardStatusModes[DashboardStatus]): string {
  return mode === 'all' ? 'All time' : 'Period';
}

export default function ExportStudioModal({
  open,
  onClose,
  defaultScope,
  tasks,
  mapping,
  range,
  periodLabel,
  dateBasis,
  weekStart,
  statusModes,
}: ExportStudioModalProps) {
  const toast = useToast();
  const [scope, setScope] = useState<ExportScope>(defaultScope);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [selectedStatuses, setSelectedStatuses] = useState<DashboardStatus[]>([]);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setScope(defaultScope);
    setFormat('csv');
    setSelectedStatuses([]);
  }, [open, defaultScope]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const selectedSet = useMemo(() => new Set(selectedStatuses), [selectedStatuses]);
  const allSelected = selectedStatuses.length === DASHBOARD_STATUS_ORDER.length;
  const someSelected = selectedStatuses.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const statusSummary = useMemo(
    () =>
      summarizeDashboardStatuses(
        tasks,
        mapping,
        range,
        dateBasis,
        statusModes
      ),
    [tasks, mapping, range, dateBasis, statusModes]
  );

  const taskStatusCounts = useMemo(
    () => countDashboardStatuses(tasks, mapping),
    [tasks, mapping]
  );

  const assignees = useMemo(
    () =>
      computeAssigneePerformance(
        tasks,
        mapping,
        range,
        dateBasis,
        statusModes
      ),
    [tasks, mapping, range, dateBasis, statusModes]
  );

  const taskRows = useMemo(() => {
    if (scope !== 'tasks') return [];

    const filtered = tasks
      .map((task) => ({ task, status: getDashboardStatus(task, mapping) }))
      .filter(
        (
          entry
        ): entry is { task: EnrichedTaskData; status: DashboardStatus } =>
          entry.status !== null && selectedSet.has(entry.status)
      );

    const rows = buildStrictExportRows(
      filtered.map((entry) => entry.task),
      mapping
    );

    return rows.map((row, index) => ({
      'Dashboard Status': DASHBOARD_STATUS_META[filtered[index].status].label,
      ...row,
    }));
  }, [scope, tasks, mapping, selectedSet]);

  if (!open) return null;

  const toggleStatus = (status: DashboardStatus) => {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status]
    );
  };

  const toggleAll = () => {
    setSelectedStatuses((current) =>
      current.length === DASHBOARD_STATUS_ORDER.length ? [] : [...DASHBOARD_STATUS_ORDER]
    );
  };

  const selectedTaskCount = selectedStatuses.reduce(
    (total, status) =>
      total +
      (scope === 'dashboard' ? statusSummary[status].effective : taskStatusCounts[status]),
    0
  );

  const selectedSummaryRows = DASHBOARD_STATUS_ORDER.filter((status) =>
    selectedSet.has(status)
  ).map((status) => statusSummary[status]);

  const buildDashboardCsvRows = (): Record<string, unknown>[] => {
    const rows: Record<string, unknown>[] = [];

    selectedSummaryRows.forEach((row) => {
      rows.push({
        Section: 'Status Summary',
        Period: periodLabel,
        'Date Basis': DASHBOARD_DATE_BASIS_LABEL[dateBasis],
        'Week Start': WEEK_START_LABEL[weekStart],
        'Range Start': range.start,
        'Range End': range.end,
        Status: DASHBOARD_STATUS_META[row.status].label,
        Mode: modeLabel(row.mode),
        'Filtered Count': row.filtered,
        'Total Count': row.total,
        Assignee: '',
        'Task Count': row.effective,
        'Pushed/Live': '',
        Overdue: '',
        Blocked: '',
        Testing: '',
        Health: '',
      });
    });

    assignees.forEach((row) => {
      rows.push({
        Section: 'Assignee Performance',
        Period: periodLabel,
        'Date Basis': DASHBOARD_DATE_BASIS_LABEL[dateBasis],
        'Week Start': WEEK_START_LABEL[weekStart],
        'Range Start': range.start,
        'Range End': range.end,
        Status: '',
        Mode: '',
        'Filtered Count': '',
        'Total Count': '',
        Assignee: row.name,
        'Task Count': row.total,
        'Pushed/Live': selectedSet.has('pushed') ? row.pushed : '',
        Overdue:
          selectedSet.has('todo') || selectedSet.has('in_progress')
            ? `${row.overdue}${row.overduePastDue > 0 ? ` (${row.overduePastDue} late)` : ''}`
            : '',
        Blocked: selectedSet.has('blocked') ? row.blocked : '',
        Testing: selectedSet.has('testing') ? row.testing : '',
        Health: row.healthLabel,
      });
    });

    return rows;
  };

  const buildDashboardJson = () => ({
    generatedAt: new Date().toISOString(),
    scope: 'dashboard',
    filter: {
      period: periodLabel,
      range,
      dateBasis,
      dateBasisLabel: DASHBOARD_DATE_BASIS_LABEL[dateBasis],
      weekStart,
      weekStartLabel: WEEK_START_LABEL[weekStart],
    },
    statuses: selectedSummaryRows.map((row) => DASHBOARD_STATUS_META[row.status].label),
    statusScope: selectedSummaryRows.map((row) => ({
      status: DASHBOARD_STATUS_META[row.status].label,
      mode: row.mode,
    })),
    statusSummary: selectedSummaryRows.map((row) => ({
      status: DASHBOARD_STATUS_META[row.status].label,
      mode: row.mode,
      filtered: row.filtered,
      total: row.total,
      effective: row.effective,
    })),
    assignees: assignees.map((row) => ({
      assignee: row.name,
      total: row.total,
      pushedLive: selectedSet.has('pushed') ? row.pushed : null,
      overdue:
        selectedSet.has('todo') || selectedSet.has('in_progress')
          ? { open: row.overdue, pastDue: row.overduePastDue, approximate: row.overdueApproximate }
          : null,
      blocked: selectedSet.has('blocked') ? row.blocked : null,
      testing: selectedSet.has('testing') ? row.testing : null,
      health: row.healthLabel,
    })),
  });

  const buildDashboardText = (): string => {
    const lines: string[] = [
      'Hubstaff PM Simplifier — Dashboard Export',
      `Period: ${periodLabel}`,
      `Range: ${range.start} → ${range.end}`,
      `Date basis: ${DASHBOARD_DATE_BASIS_LABEL[dateBasis]}`,
      `Week starts: ${WEEK_START_LABEL[weekStart]}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Statuses: ${selectedSummaryRows.map((row) => DASHBOARD_STATUS_META[row.status].label).join(', ')}`,
      '',
      'STATUS SUMMARY',
    ];

    selectedSummaryRows.forEach((row) =>
      lines.push(
        `- ${DASHBOARD_STATUS_META[row.status].label} [${modeLabel(row.mode)}]: ${row.filtered} filtered / ${row.total} total → ${row.effective} included`
      )
    );

    lines.push('', 'ASSIGNEE PERFORMANCE');
    assignees.forEach((row) => {
      const parts = [`total ${row.total}`];
      if (selectedSet.has('pushed')) parts.push(`pushed/live ${row.pushed}`);
      if (selectedSet.has('todo') || selectedSet.has('in_progress')) {
        parts.push(`overdue ${row.overdue}${row.overduePastDue > 0 ? ` (${row.overduePastDue} late)` : ''}`);
      }
      if (selectedSet.has('blocked')) parts.push(`blocked ${row.blocked}`);
      if (selectedSet.has('testing')) parts.push(`testing ${row.testing}`);
      parts.push(`health ${row.healthLabel}`);
      lines.push(`- ${row.name}: ${parts.join(' · ')}`);
    });

    return lines.join('\n');
  };

  const handleExport = () => {
    if (selectedStatuses.length === 0) {
      toast.push('Please select at least ONE pipeline status to export!', 'error');
      return;
    }

    if (scope === 'dashboard') {
      const baseName = `pm_dashboard_${range.start}_to_${range.end}_${dateBasis}_week-${weekStart}_${fileTimestamp()}`;
      if (format === 'csv') downloadCsv(buildDashboardCsvRows(), `${baseName}.csv`);
      else if (format === 'json') downloadJson(buildDashboardJson(), `${baseName}.json`);
      else downloadText(buildDashboardText(), `${baseName}.txt`);
    } else {
      if (taskRows.length === 0) {
        toast.push('No tasks match the selected statuses.', 'error');
        return;
      }
      const baseName = `pm_tasks_${fileTimestamp()}`;
      if (format === 'csv') downloadCsv(taskRows, `${baseName}.csv`);
      else if (format === 'json') downloadJson(taskRows, `${baseName}.json`);
      else {
        const text = taskRows
          .map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value ?? ''}`).join('\n'))
          .join('\n\n---\n\n');
        downloadText(text, `${baseName}.txt`);
      }
    }

    toast.push(
      `Export generated! ${selectedStatuses.length} statuses · ${selectedTaskCount} tasks represented.`
    );
    onClose();
  };

  const rowCount = scope === 'dashboard' ? selectedTaskCount : taskRows.length;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between bg-slate-900 p-5 text-white">
          <div className="flex items-center gap-2.5">
            <DownloadCloud className="h-5 w-5 text-indigo-400" />
            <div>
              <h3 className="text-base font-bold">Custom Export Studio</h3>
              <p className="text-xs text-slate-400">Select custom statuses and preferred file format</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export studio"
            className="text-slate-400 transition-colors hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-6">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">
              1. Select Target View Scope
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: 'dashboard', title: 'Dashboard View', subtitle: 'Period summary & metrics' },
                  { value: 'tasks', title: 'Tasks Matrix View', subtitle: 'Full task details' },
                ] as const
              ).map((option) => {
                const active = scope === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScope(option.value)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      active
                        ? 'border-indigo-600 bg-indigo-50/40'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-xs font-bold text-slate-800">{option.title}</span>
                    <span className="block text-[10px] text-slate-500">{option.subtitle}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              {scope === 'dashboard'
                ? `${periodLabel} · ${DASHBOARD_DATE_BASIS_LABEL[dateBasis]} · week starts ${WEEK_START_LABEL[weekStart]}`
                : 'Tasks Matrix export includes all-time tasks in the selected board statuses; dashboard period filters do not apply.'}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Choose Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map((option) => {
                const Icon = option.icon;
                const active = format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormat(option.value)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                      active
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`mb-1 h-5 w-5 ${option.color}`} />
                    <span className="text-xs font-bold text-slate-700">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                3. Select Pipeline Statuses to Include
              </label>
              <span className="text-[11px] font-semibold text-slate-400">
                {selectedStatuses.length} / {DASHBOARD_STATUS_ORDER.length}
              </span>
            </div>

            <label className="mb-2.5 flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold text-slate-700">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all statuses"
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>Select all statuses</span>
            </label>

            <p className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 p-2 text-[11px] font-medium text-amber-600">
              <Info className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                All options start unselected. Counts use only tasks currently in the selected board
                lists, then apply each status&apos;s Period/All scope and the selected date basis.
              </span>
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {DASHBOARD_STATUS_ORDER.map((status) => {
                const meta = DASHBOARD_STATUS_META[status];
                const checked = selectedStatuses.includes(status);
                const summary = statusSummary[status];
                const countText =
                  scope === 'dashboard'
                    ? summary.mode === 'all'
                      ? `${summary.total} (All)`
                      : `${summary.filtered} / ${summary.total}`
                    : `${taskStatusCounts[status]}`;
                return (
                  <label
                    key={status}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2 transition-colors ${
                      checked ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 hover:bg-slate-50'
                    } ${status === 'pushed' ? 'col-span-2' : ''}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStatus(status)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-slate-700">{meta.label}</span>
                    </span>
                    <span
                      className="flex-shrink-0 text-[10px] font-semibold tabular-nums text-slate-400"
                      title={
                        scope === 'dashboard'
                          ? `${buttonModeTitle(summary.filtered, summary.total, summary.mode)}`
                          : `${taskStatusCounts[status]} tasks currently in this board status`
                      }
                    >
                      {countText}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            {selectedStatuses.length} status{selectedStatuses.length === 1 ? '' : 'es'} selected ·{' '}
            <strong>{rowCount}</strong> {scope === 'dashboard' ? 'tasks represented' : 'task rows'}
            {scope === 'dashboard' && (
              <span className="block text-[10px] text-slate-400">
                Status summary rows: {selectedSummaryRows.length} · assignee rows: {assignees.length}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-95"
          >
            <DownloadCloud className="h-4 w-4" />
            <span>Generate &amp; Download</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function buttonModeTitle(filtered: number, total: number, mode: DashboardStatusModes[DashboardStatus]): string {
  return mode === 'all' ? `${total} all-time tasks` : `${filtered} of ${total} tasks in period`;
}
