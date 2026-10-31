import { useMemo, useState } from 'react';
import { ArrowRight, FlaskConical } from 'lucide-react';
import type { EnrichedTaskData } from '../../services/hubstaff';
import type { StatusMapping } from '../../lib/status';
import type { ListTransition } from '../../lib/transitions';
import type { TestingTimeframe, WeekStart } from '../../lib/dates';
import {
  DASHBOARD_DATE_BASIS_LABEL,
  buildTestingQueue,
  formatDurationSince,
  type DashboardDateBasis,
  type DashboardPeriodRange,
  type DashboardStatusMode,
} from '../../lib/dashboard';
import { useToast } from '../ToastProvider';

interface TestingBoardProps {
  tasks: EnrichedTaskData[] | null;
  transitions: ListTransition[];
  mapping: StatusMapping;
  boardDate: string;
  range: DashboardPeriodRange;
  dateBasis: DashboardDateBasis;
  mode: DashboardStatusMode;
  weekStart: WeekStart;
  dashboardTotal: number;
  periodLabel: string;
  onViewAll: () => void;
  onDrilldown: (title: string, tasks: EnrichedTaskData[]) => void;
}

const TIMEFRAMES: Array<{ value: TestingTimeframe; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function TestingBoard({
  tasks,
  transitions,
  mapping,
  boardDate,
  range,
  dateBasis,
  mode,
  weekStart,
  dashboardTotal,
  periodLabel,
  onViewAll,
  onDrilldown,
}: TestingBoardProps) {
  const toast = useToast();
  const [timeframe, setTimeframe] = useState<TestingTimeframe>('weekly');

  const queue = useMemo(
    () =>
      buildTestingQueue(tasks, transitions, mapping, timeframe, {
        range,
        basis: dateBasis,
        mode,
        weekStart,
        referenceDate: boardDate,
      }),
    [tasks, transitions, mapping, timeframe, range, dateBasis, mode, weekStart, boardDate]
  );

  const count = queue.available ? queue.items.length : dashboardTotal;
  const countLabel = queue.available ? 'In QA queue' : 'Testing tasks';

  const changeTimeframe = (next: TestingTimeframe) => {
    setTimeframe(next);
    toast.push(`Testing Board QA window updated to: ${next.toUpperCase()}`);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-purple-200/80 bg-white shadow-sm">
      <div className="bg-purple-900 p-4 text-white">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-purple-300" />
            <h3 className="text-sm font-bold">Testing Status Board</h3>
          </div>
          <span className="rounded bg-purple-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-200">
            QA Queue
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-lg border border-purple-700/50 bg-purple-950/60 p-1.5">
          <span className="pl-1 text-[11px] font-medium text-purple-200">QA window:</span>
          <div className="flex gap-1 text-[11px]">
            {TIMEFRAMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeTimeframe(option.value)}
                className={`rounded px-2 py-0.5 transition-all ${
                  timeframe === option.value
                    ? 'bg-purple-600 font-bold text-white shadow-sm'
                    : 'text-purple-200 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">
            {countLabel} (<span className="text-purple-700">{count}</span>)
          </span>
          <span className="text-right text-[11px] font-medium text-purple-700">{queue.label}</span>
        </div>

        <p className="rounded-lg bg-purple-50/70 px-2.5 py-1.5 text-[10px] text-purple-700">
          Dashboard filter: <strong>{mode === 'all' ? 'All testing tasks' : periodLabel}</strong>
          {mode === 'period' ? ` · ${DASHBOARD_DATE_BASIS_LABEL[dateBasis]}` : ''} · QA window is
          applied inside that scope.
        </p>

        {!queue.available ? (
          <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3 text-xs text-slate-500">
            Task-level testing detail is not available for this scope. The dashboard has{' '}
            <strong className="text-purple-700">{dashboardTotal}</strong> testing task
            {dashboardTotal === 1 ? '' : 's'}.
          </div>
        ) : queue.items.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-400">
            No tasks entered testing in this QA window.
          </div>
        ) : (
          <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
            {queue.items.map((item) => (
              <button
                key={item.task.id}
                type="button"
                onClick={() => onDrilldown(`Testing · ${queue.label}`, [item.task])}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-purple-100 bg-purple-50/30 p-2.5 text-left text-xs transition-all hover:bg-purple-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-800">
                    #{item.task.id} {item.task.subject}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    Assignee: <span className="font-semibold text-slate-600">{item.assignee}</span>
                    <span className="ml-2">
                      {item.approximate ? '≈ ' : ''}
                      {formatDurationSince(item.enteredAt, boardDate)} in testing
                    </span>
                  </div>
                </div>
                <span className="flex-shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                  QA Testing
                </span>
              </button>
            ))}
          </div>
        )}

        {queue.approximate && (
          <p className="text-[10px] text-slate-400">
            ≈ Entry time estimated from last update; move history is tracked while the app is in use.
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50 p-3 text-center">
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 transition-all hover:text-purple-900"
        >
          <span>View All Testing Tasks</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
