import type { BlockedItem, DashboardStatusMode } from '../../lib/dashboard';
import { formatDurationSince } from '../../lib/dashboard';

interface BlockedPanelProps {
  items: BlockedItem[];
  outsideItems: BlockedItem[];
  total: number;
  mode: DashboardStatusMode;
  periodLabel: string;
  boardDate: string;
  onDrilldown: (title: string, items: BlockedItem[]) => void;
}

export default function BlockedPanel({
  items,
  outsideItems,
  total,
  mode,
  periodLabel,
  boardDate,
  onDrilldown,
}: BlockedPanelProps) {
  const visible = items.slice(0, 4);
  const countLabel = mode === 'all' ? `${total} Blocked` : `${items.length} / ${total} Blocked`;

  return (
    <section className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          <h3 className="text-sm font-bold text-slate-900">Critical Blocked Items</h3>
        </div>
        <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600">
          {countLabel}
        </span>
      </div>

      <p className="mb-3 text-[10px] text-slate-400">
        Scope: <strong className="font-semibold text-slate-500">{mode === 'all' ? 'All time' : periodLabel}</strong>
      </p>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs text-emerald-700">
          {mode === 'all'
            ? 'No blocked items on this board. Nice.'
            : 'No blocked items in this period. Nice.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((item) => (
            <button
              key={item.task.id}
              type="button"
              onClick={() => onDrilldown(`Blocked · ${periodLabel}`, [item])}
              className="w-full space-y-1 rounded-xl border border-rose-100 bg-rose-50/40 p-2.5 text-left text-xs transition-colors hover:bg-rose-50"
            >
              <div className="flex items-center justify-between gap-2 font-bold text-slate-800">
                <span className="truncate">
                  #{item.task.id} {item.task.subject}
                </span>
                <span className="flex-shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                  Blocked
                </span>
              </div>
              <p className="line-clamp-2 text-[11px] text-slate-500">{item.reason}</p>
              <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-slate-400">
                <span className="truncate">
                  Assignee: <strong className="text-slate-600">{item.assignee}</strong>
                </span>
                <span className="flex-shrink-0">
                  {item.approximate ? '≈ ' : ''}
                  {formatDurationSince(item.blockedSince, boardDate)} stuck
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {items.length > visible.length && (
        <button
          type="button"
          onClick={() => onDrilldown(`Blocked · ${periodLabel}`, items)}
          className="mt-3 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
        >
          View all {items.length} blocked tasks
        </button>
      )}

      {outsideItems.length > 0 && (
        <button
          type="button"
          onClick={() =>
            onDrilldown(`Blocked outside this period · ${outsideItems.length} tasks`, outsideItems)
          }
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
        >
          View {outsideItems.length} blocked outside this period
        </button>
      )}

      {items.some((item) => item.approximate) && (
        <p className="mt-1.5 text-[10px] text-slate-400">
          ≈ Stuck duration estimated from last update; move history is tracked while the app is in use.
        </p>
      )}
    </section>
  );
}
