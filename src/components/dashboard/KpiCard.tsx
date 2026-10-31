import {
  AlertOctagon,
  Archive,
  CheckCircle2,
  FlaskConical,
  ListTodo,
  Loader,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DASHBOARD_STATUS_META,
  type DashboardStatus,
  type DashboardStatusMode,
} from '../../lib/dashboard';

interface KpiCardProps {
  status: DashboardStatus;
  filtered: number;
  total: number;
  mode: DashboardStatusMode;
  onModeChange: (mode: DashboardStatusMode) => void;
  onClick?: () => void;
  disabled?: boolean;
}

const ICONS: Record<DashboardStatus, LucideIcon> = {
  icebox: Archive,
  current_sprint: Zap,
  todo: ListTodo,
  in_progress: Loader,
  testing: FlaskConical,
  blocked: AlertOctagon,
  pushed: CheckCircle2,
};

export default function KpiCard({
  status,
  filtered,
  total,
  mode,
  onModeChange,
  onClick,
  disabled = false,
}: KpiCardProps) {
  const meta = DASHBOARD_STATUS_META[status];
  const Icon = ICONS[status];
  const effective = mode === 'all' ? total : filtered;

  return (
    <div
      className="rounded-xl border bg-white p-3.5 shadow-sm transition-all"
      style={{ borderColor: meta.border, backgroundColor: meta.bg }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || !onClick}
        title={meta.description}
        className={`w-full text-left ${
          onClick && !disabled ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            {meta.label}
          </span>
          <Icon className="h-4 w-4 flex-shrink-0" style={{ color: meta.accent }} />
        </div>

        <div className="text-2xl font-bold" style={{ color: meta.accent }}>
          {effective}
        </div>

        <div className="mt-0.5 text-[10px] text-slate-400">{meta.hint}</div>
      </button>

      <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-200/70 pt-2">
        <span
          className="text-[10px] font-semibold tabular-nums text-slate-500"
          title={
            mode === 'all'
              ? `${total} total task${total === 1 ? '' : 's'} in this status`
              : `${filtered} of ${total} tasks match the selected period`
          }
        >
          {mode === 'all' ? `${total} total` : `${filtered}/${total}`}
        </span>

        <div
          className="flex rounded-md border border-slate-200 bg-white/80 p-0.5"
          role="group"
          aria-label={`${meta.label} scope`}
        >
          {(['period', 'all'] as const).map((option) => {
            const active = mode === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onModeChange(option)}
                aria-pressed={active}
                title={
                  option === 'period'
                    ? `Show only ${meta.label} tasks in the selected period`
                    : `Show all ${meta.label} tasks`
                }
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase transition-all ${
                  active
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {option === 'period' ? 'Period' : 'All'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
