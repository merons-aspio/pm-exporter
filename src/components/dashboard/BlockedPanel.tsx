import type { BoardSource } from '../../lib/snapshots';
import type { BlockedItem } from '../../lib/dashboard';
import { formatDurationSince } from '../../lib/dashboard';

interface BlockedPanelProps {
  items: BlockedItem[];
  boardDate: string;
  boardSource: BoardSource;
  boardCount: number;
  onDrilldown: (title: string, tasks: BlockedItem[]) => void;
}

export default function BlockedPanel({
  items,
  boardDate,
  boardSource,
  boardCount,
  onDrilldown,
}: BlockedPanelProps) {
  const visible = items.slice(0, 4);
  const count = items.length > 0 ? items.length : boardCount;

  return (
    <section className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          <h3 className="text-sm font-bold text-slate-900">Critical Blocked Items</h3>
        </div>
        <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600">
          {count} Blocked
        </span>
      </div>

      {boardSource === 'snapshot' ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 text-xs text-slate-500">
          Task-level blocked detail is not stored for past snapshots. This board has{' '}
          <strong className="text-rose-600">{boardCount}</strong> blocked task
          {boardCount === 1 ? '' : 's'}.
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs text-emerald-700">
          No blocked items on this board. Nice.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((item) => (
            <button
              key={item.task.id}
              type="button"
              onClick={() => onDrilldown('Blocked tasks', [item])}
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
          onClick={() => onDrilldown('Blocked tasks', items)}
          className="mt-3 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
        >
          View all {items.length} blocked tasks
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
