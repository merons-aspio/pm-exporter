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
} from '../../lib/dashboard';

interface KpiCardProps {
  status: DashboardStatus;
  count: number;
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

export default function KpiCard({ status, count, onClick, disabled = false }: KpiCardProps) {
  const meta = DASHBOARD_STATUS_META[status];
  const Icon = ICONS[status];
  const showPill = status !== 'icebox' && status !== 'current_sprint';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={meta.description}
      className={`group rounded-xl border bg-white p-3.5 text-left shadow-sm transition-all ${
        onClick && !disabled ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default'
      }`}
      style={{ borderColor: meta.border, backgroundColor: meta.bg }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          {meta.label}
        </span>
        <Icon className="h-4 w-4 flex-shrink-0" style={{ color: meta.accent }} />
      </div>

      <div className="text-2xl font-bold" style={{ color: meta.accent }}>
        {count}
      </div>

      {showPill ? (
        <span
          className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: meta.border, color: meta.accent }}
        >
          {meta.hint}
        </span>
      ) : (
        <div className="mt-0.5 text-[10px] text-slate-400">{meta.hint}</div>
      )}
    </button>
  );
}
