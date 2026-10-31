import { Check, Clock, XCircle } from 'lucide-react';
import type { AssigneePerformance, HealthTone } from '../../lib/dashboard';

interface AssigneePerformanceTableProps {
  rows: AssigneePerformance[];
  approximateOverdue: boolean;
}

const HEALTH_CLASSES: Record<HealthTone, string> = {
  rose: 'border-rose-200 bg-rose-50 text-rose-600',
  amber: 'border-amber-200 bg-amber-50 text-amber-600',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-600',
  slate: 'border-slate-200 bg-slate-100 text-slate-500',
};

export default function AssigneePerformanceTable({
  rows,
  approximateOverdue,
}: AssigneePerformanceTableProps) {
  const totalPushed = rows.reduce((total, row) => total + row.pushed, 0);
  const totalOverdue = rows.reduce((total, row) => total + row.overdue, 0);
  const totalBlocked = rows.reduce((total, row) => total + row.blocked, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Daily Report &amp; Assignee Performance</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              Daily Focus
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Tasks in <span className="font-semibold text-emerald-700">Pushed/Live</span> count as
            Delivered. <span className="font-semibold text-amber-700">In Progress</span> &amp;{' '}
            <span className="font-semibold text-amber-700">To-Do</span> are flagged as Overdue risk.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 font-semibold text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Delivered
          </span>
          <span className="flex items-center gap-1 rounded-md border border-amber-100 bg-amber-50 px-2 py-1 font-semibold text-amber-600">
            <Clock className="h-3.5 w-3.5" /> Overdue
          </span>
          <span className="flex items-center gap-1 rounded-md border border-rose-100 bg-rose-50 px-2 py-1 font-semibold text-rose-600">
            <XCircle className="h-3.5 w-3.5" /> Blocked
          </span>
        </div>
      </div>

      <div className="max-h-[430px] overflow-auto">
        <table className="w-full min-w-[720px] text-left text-xs text-slate-600">
          <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-3 py-3 text-center">Pushed/Live</th>
              <th className="px-3 py-3 text-center">Overdue (In Progress + To-Do)</th>
              <th className="px-3 py-3 text-center">Blocked</th>
              <th className="px-3 py-3 text-center">Testing</th>
              <th className="px-4 py-3 text-right">Status Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {rows.map((row) => (
              <tr key={row.name} className="transition-colors hover:bg-slate-50/80">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-200 text-[10px] font-bold text-slate-700">
                      {row.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-800">{row.name}</div>
                      <div className="text-[10px] text-slate-400">{row.total} active tasks</div>
                    </div>
                  </div>
                </td>
                <td className="bg-emerald-50/30 px-3 py-3 text-center font-bold text-emerald-600">
                  {row.pushed}
                </td>
                <td
                  className="bg-amber-50/30 px-3 py-3 text-center font-bold text-amber-600"
                  title={
                    row.overdueApproximate
                      ? 'Snapshot days do not store due dates; this is the open In Progress + To-Do count.'
                      : `${row.overduePastDue} past due · ${row.overdue} open in In Progress + To-Do`
                  }
                >
                  {row.overdue}
                  {row.overduePastDue > 0 && (
                    <span className="ml-1 text-[10px] font-semibold text-amber-500">
                      ({row.overduePastDue} late)
                    </span>
                  )}
                </td>
                <td className="bg-rose-50/30 px-3 py-3 text-center font-bold text-rose-600">
                  {row.blocked}
                </td>
                <td className="px-3 py-3 text-center font-bold text-purple-600">{row.testing}</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${HEALTH_CLASSES[row.healthTone]}`}
                  >
                    {row.healthLabel}
                  </span>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No assignee activity on this board.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/70 p-4 text-center text-xs">
        <div>
          <span className="block text-[10px] font-semibold uppercase text-slate-400">Total Pushed</span>
          <span className="text-base font-bold text-emerald-600">{totalPushed} Tasks</span>
        </div>
        <div>
          <span className="block text-[10px] font-semibold uppercase text-slate-400">Total Overdue</span>
          <span className="text-base font-bold text-amber-600">{totalOverdue} Tasks</span>
        </div>
        <div>
          <span className="block text-[10px] font-semibold uppercase text-slate-400">Total Blocked</span>
          <span className="text-base font-bold text-rose-600">{totalBlocked} Tasks</span>
        </div>
      </div>

      {(approximateOverdue || rows.some((row) => row.overdueApproximate)) && (
        <p className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
          ≈ Overdue on snapshot days uses the open In Progress + To-Do count because due dates are
          not stored in historical snapshots.
        </p>
      )}
    </section>
  );
}
