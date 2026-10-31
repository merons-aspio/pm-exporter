import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import type { EnrichedTaskData } from '../../services/hubstaff';
import type { StatusMapping, StatusOverrides } from '../../lib/status';
import { getEffectiveBucket } from '../../lib/status';
import { daysOverdue, formatDate, isDueToday, parseDate } from '../../lib/dates';
import { StatusBadge } from '../ui';

interface DrilldownModalProps {
  title: string;
  tasks: EnrichedTaskData[];
  mapping: StatusMapping;
  overrides: StatusOverrides;
  onClose: () => void;
  onExport: () => void;
}

export default function DrilldownModal({
  title,
  tasks,
  mapping,
  overrides,
  onClose,
  onExport,
}: DrilldownModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{tasks.length} tasks</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition-colors hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {['ID', 'Title', 'Board', 'Status', 'Assignees', 'Due', 'Days Late', 'Updated', 'Estimate'].map(
                  (label) => (
                    <th
                      key={label}
                      className="sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600"
                    >
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {tasks.slice(0, 500).map((task) => {
                const late = daysOverdue(task.due_date);
                const due = parseDate(task.due_date);
                const lateLabel = !due ? '—' : late > 0 ? `${late}d` : isDueToday(task.due_date) ? 'today' : '—';

                return (
                  <tr key={task.id} className="hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-500">#{task.id}</td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-xs font-medium text-slate-800">
                      {task.subject}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-600">
                      {task.board_status}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-xs">
                      <StatusBadge bucket={getEffectiveBucket(task, mapping, overrides)} />
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-600">
                      {task.assignee_names.join(', ') || 'Unassigned'}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-600">
                      {formatDate(task.due_date)}
                    </td>
                    <td
                      className={`border-b border-slate-100 px-3 py-2.5 text-xs ${
                        late > 0 ? 'font-semibold text-rose-700' : 'text-slate-500'
                      }`}
                    >
                      {lateLabel}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-600">
                      {formatDate(task.updated_at)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-600">
                      {task.estimate_hours > 0 ? `${task.estimate_hours}h` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {tasks.length > 500 && (
            <div className="px-4 py-2 text-xs text-slate-400">
              Showing first 500 of {tasks.length}. Export for all.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
