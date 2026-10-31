import { BarChart3 } from 'lucide-react';
import {
  DASHBOARD_STATUS_META,
  DASHBOARD_STATUS_ORDER,
  type DashboardStatus,
} from '../../lib/dashboard';

interface PipelineChartProps {
  counts: Record<DashboardStatus, number>;
  periodLabel: string;
  onSelect?: (status: DashboardStatus) => void;
}

export default function PipelineChart({ counts, periodLabel, onSelect }: PipelineChartProps) {
  const max = Math.max(1, ...DASHBOARD_STATUS_ORDER.map((status) => counts[status]));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">7-Status Workload Overview</h3>
          </div>
          <p className="text-xs text-slate-500">
            Effective distribution · <span className="font-medium text-slate-600">{periodLabel}</span>
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-400">All Assignees</span>
      </div>

      <div className="h-56">
        <div className="flex h-full items-end gap-2 overflow-x-auto pb-1 sm:gap-3">
          {DASHBOARD_STATUS_ORDER.map((status) => {
            const meta = DASHBOARD_STATUS_META[status];
            const value = counts[status];
            const height = Math.max(4, Math.round((value / max) * 100));

            return (
              <button
                key={status}
                type="button"
                onClick={onSelect ? () => onSelect(status) : undefined}
                disabled={!onSelect}
                title={`${meta.label}: ${value} task${value === 1 ? '' : 's'}`}
                className={`flex h-full min-w-[54px] flex-1 flex-col items-center justify-end gap-1.5 rounded-lg px-1 py-1 transition-colors ${
                  onSelect ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
                }`}
              >
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{ height: `${height}%`, backgroundColor: meta.bar, minHeight: 4 }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-700">{value}</span>
                <span className="min-h-[24px] text-center text-[10px] font-semibold leading-tight text-slate-500">
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
