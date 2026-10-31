import { useEffect, useMemo, useState } from 'react';
import {
  DownloadCloud,
  FileJson,
  FileSpreadsheet,
  FileText,
  Info,
  X,
} from 'lucide-react';
import type { EnrichedTaskData } from '../services/hubstaff';
import type { BoardState } from '../lib/snapshots';
import type { StatusMapping, StatusOverrides } from '../lib/status';
import {
  DASHBOARD_STATUS_META,
  DASHBOARD_STATUS_ORDER,
  computeAssigneePerformance,
  dashboardCountsFromBoard,
  dashboardStatusRows,
  getDashboardStatus,
  type DashboardStatus,
} from '../lib/dashboard';
import { buildExportRows } from '../lib/exportRows';
import { fileTimestamp } from '../lib/dates';
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
  overrides: StatusOverrides;
  board: BoardState;
  boardTasks: EnrichedTaskData[] | null;
  range: { start: string; end: string };
  periodLabel: string;
}

const FORMATS: Array<{ value: ExportFormat; label: string; icon: typeof FileSpreadsheet; color: string }> = [
  { value: 'csv', label: 'CSV File', icon: FileSpreadsheet, color: 'text-emerald-600' },
  { value: 'json', label: 'JSON Format', icon: FileJson, color: 'text-amber-600' },
  { value: 'txt', label: 'TXT / File', icon: FileText, color: 'text-indigo-600' },
];

export default function ExportStudioModal({
  open,
  onClose,
  defaultScope,
  tasks,
  mapping,
  overrides,
  board,
  boardTasks,
  range,
  periodLabel,
}: ExportStudioModalProps) {
  const toast = useToast();
  const [scope, setScope] = useState<ExportScope>(defaultScope);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [selectedStatuses, setSelectedStatuses] = useState<DashboardStatus[]>([]);

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

  const taskRows = useMemo(() => {
    if (scope !== 'tasks') return [];
    const filtered = tasks.filter((task) => selectedSet.has(getDashboardStatus(task, mapping, overrides)));
    const rows = buildExportRows(filtered, mapping, overrides);

    return rows.map((row, index) => ({
      'Dashboard Status':
        DASHBOARD_STATUS_META[getDashboardStatus(filtered[index], mapping, overrides)].label,
      ...row,
    }));
  }, [scope, tasks, mapping, overrides, selectedSet]);

  const dashboardData = useMemo(() => {
    const counts = dashboardCountsFromBoard(board);
    const summary = dashboardStatusRows(counts).filter((row) => selectedSet.has(row.status));
    const assignees = computeAssigneePerformance(board, boardTasks, mapping, overrides);

    return { counts, summary, assignees };
  }, [board, boardTasks, mapping, overrides, selectedSet]);

  if (!open) return null;

  const toggleStatus = (status: DashboardStatus) => {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status]
    );
  };

  const selectAll = () => setSelectedStatuses([...DASHBOARD_STATUS_ORDER]);
  const deselectAll = () => setSelectedStatuses([]);

  const buildDashboardCsvRows = (): Record<string, unknown>[] => {
    const rows: Record<string, unknown>[] = [];

    dashboardData.summary.forEach((row) => {
      rows.push({
        Section: 'Status Summary',
        Status: row.label,
        Assignee: '',
        Count: row.count,
        'Pushed/Live': '',
        Overdue: '',
        Blocked: '',
        Testing: '',
        Health: '',
      });
    });

    dashboardData.assignees.forEach((row) => {
      rows.push({
        Section: 'Assignee Performance',
        Status: '',
        Assignee: row.name,
        Count: row.total,
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
    period: periodLabel,
    range,
    statuses: dashboardData.summary.map((row) => row.label),
    statusSummary: dashboardData.summary.map((row) => ({
      status: row.label,
      count: row.count,
    })),
    assignees: dashboardData.assignees.map((row) => ({
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
      `Generated: ${new Date().toLocaleString()}`,
      `Statuses: ${dashboardData.summary.map((row) => row.label).join(', ')}`,
      '',
      'STATUS SUMMARY',
    ];

    dashboardData.summary.forEach((row) => lines.push(`- ${row.label}: ${row.count}`));

    lines.push('', 'ASSIGNEE PERFORMANCE');
    dashboardData.assignees.forEach((row) => {
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

    const baseName = `pm_${scope}_${range.start}_to_${range.end}_${fileTimestamp()}`;

    if (scope === 'dashboard') {
      if (format === 'csv') downloadCsv(buildDashboardCsvRows(), `${baseName}.csv`);
      else if (format === 'json') downloadJson(buildDashboardJson(), `${baseName}.json`);
      else downloadText(buildDashboardText(), `${baseName}.txt`);
    } else {
      if (taskRows.length === 0) {
        toast.push('No tasks match the selected statuses.', 'error');
        return;
      }
      if (format === 'csv') downloadCsv(taskRows, `${baseName}.csv`);
      else if (format === 'json') downloadJson(taskRows, `${baseName}.json`);
      else {
        const text = taskRows
          .map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value ?? ''}`).join('\n'))
          .join('\n\n---\n\n');
        downloadText(text, `${baseName}.txt`);
      }
    }

    toast.push(`Export generated! Filtered by ${selectedStatuses.length} statuses.`);
    onClose();
  };

  const rowCount = scope === 'dashboard' ? dashboardData.summary.length : taskRows.length;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
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
                  { value: 'dashboard', title: 'Dashboard View', subtitle: 'Summary & Metrics' },
                  { value: 'tasks', title: 'Tasks Matrix View', subtitle: 'Full Task Details' },
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
              <div className="space-x-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAll}
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={deselectAll} className="text-slate-500 hover:underline">
                  Deselect All
                </button>
              </div>
            </div>

            <p className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 p-2 text-[11px] font-medium text-amber-600">
              <Info className="h-3.5 w-3.5 flex-shrink-0" />
              <span>All options are unselected by default so you can choose specifically.</span>
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {DASHBOARD_STATUS_ORDER.map((status) => {
                const meta = DASHBOARD_STATUS_META[status];
                const checked = selectedStatuses.includes(status);
                return (
                  <label
                    key={status}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors ${
                      checked ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 hover:bg-slate-50'
                    } ${status === 'pushed' ? 'col-span-2' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStatus(status)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium text-slate-700">{meta.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            {selectedStatuses.length} status{selectedStatuses.length === 1 ? '' : 'es'} selected ·{' '}
            <strong>{rowCount}</strong> {scope === 'dashboard' ? 'summary rows' : 'task rows'}
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
