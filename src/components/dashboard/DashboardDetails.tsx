import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import type { EnrichedTaskData } from '../../services/hubstaff';
import type { StatusMapping, StatusOverrides, Bucket } from '../../lib/status';
import { BUCKET_META, BUCKET_ORDER, getEffectiveBucket } from '../../lib/status';
import type { SnapshotStore, BoardState } from '../../lib/snapshots';
import { getBoardForDate } from '../../lib/snapshots';
import type { ListTransition } from '../../lib/transitions';
import type { StandupResult } from '../../lib/standup';
import {
  addDays,
  toDateKey,
  todayKey,
} from '../../lib/dates';
import { computeActivity, computeActivityByAssignee } from '../../lib/activity';
import StandupSection from '../StandupSection';
import { Bar, SectionCard, SourceBadge } from '../ui';

interface DashboardDetailsProps {
  tasks: EnrichedTaskData[];
  mapping: StatusMapping;
  overrides: StatusOverrides;
  snapshots: SnapshotStore;
  transitions: ListTransition[];
  range: { start: string; end: string; days: string[] };
  board: BoardState;
  boardDate: string;
  canDrill: boolean;
  onDrilldown: (title: string, tasks: EnrichedTaskData[]) => void;
  standup: StandupResult;
  standupPerson: string;
  onSelectStandupPerson: (name: string) => void;
  doneLists: string[];
  onDoneListsChange: (lists: string[]) => void;
  listOptions: Array<{ name: string; count: number }>;
  onStandupExport: () => void;
  lastSyncedAt: string | null;
  syncing: boolean;
  onSync: () => void;
}

const twoColumnStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  gap: '1rem',
};

const miniTh: CSSProperties = {
  padding: '0.35rem 0.45rem',
  textAlign: 'left',
  borderBottom: '1px solid #e2e8f0',
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: '#64748b',
  whiteSpace: 'nowrap',
  backgroundColor: '#f8fafc',
};

const miniTd: CSSProperties = {
  padding: '0.35rem 0.45rem',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '0.78rem',
  color: '#334155',
};

const miniTdNum: CSSProperties = {
  ...miniTd,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

function ActivityStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: '0.55rem 0.6rem',
        borderRadius: 6,
        backgroundColor: '#f8fafc',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ fontSize: '0.66rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function sumCounts(counts: Record<Bucket, number>): number {
  return BUCKET_ORDER.reduce((total, bucket) => total + counts[bucket], 0);
}

export default function DashboardDetails(props: DashboardDetailsProps) {
  const {
    tasks,
    mapping,
    overrides,
    snapshots,
    range,
    board,
    boardDate,
    canDrill,
    onDrilldown,
    standup,
    standupPerson,
    onSelectStandupPerson,
    doneLists,
    onDoneListsChange,
    listOptions,
    onStandupExport,
    lastSyncedAt,
    syncing,
    onSync,
  } = props;

  const matrixRows = useMemo(
    () =>
      Object.entries(board.byAssigneeBucket)
        .map(([name, counts]) => ({ name, counts, total: sumCounts(counts) }))
        .sort((a, b) => b.total - a.total),
    [board]
  );

  const activity = useMemo(
    () => computeActivity(tasks, range.start, range.end),
    [tasks, range.start, range.end]
  );

  const activityRows = useMemo(
    () => computeActivityByAssignee(tasks, range.start, range.end),
    [tasks, range.start, range.end]
  );

  const today = todayKey();
  const yesterday = toDateKey(addDays(new Date(), -1));

  const todayBoard = useMemo(
    () => getBoardForDate(today, tasks, mapping, overrides, snapshots),
    [today, tasks, mapping, overrides, snapshots]
  );

  const yesterdayBoard = useMemo(
    () => getBoardForDate(yesterday, tasks, mapping, overrides, snapshots),
    [yesterday, tasks, mapping, overrides, snapshots]
  );

  const dailyRows = useMemo(() => {
    if (range.days.length <= 1) return [];
    return range.days.map((date) => ({
      date,
      board: getBoardForDate(date, tasks, mapping, overrides, snapshots),
      activity: computeActivity(tasks, date, date),
    }));
  }, [range.days, tasks, mapping, overrides, snapshots]);

  const boardListRows = Object.entries(board.byList)
    .map(([name, count]) => ({ name, count, bucket: mapping[name] ?? 'todo' }))
    .sort((a, b) => b.count - a.count);
  const boardListMax = Math.max(1, ...boardListRows.map((row) => row.count));

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Detailed breakdown</h2>
          <p className="text-xs text-slate-500">
            Standup, activity, status matrix, board lists and daily trend
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-5 space-y-6">
        <StandupSection
          standup={standup}
          selectedPerson={standupPerson}
          onSelectPerson={onSelectStandupPerson}
          doneLists={doneLists}
          onDoneListsChange={onDoneListsChange}
          listOptions={listOptions}
          onDrilldown={onDrilldown}
          onExport={onStandupExport}
          lastSyncedAt={lastSyncedAt}
          onSync={onSync}
          syncing={syncing}
        />

        <div style={twoColumnStyle}>
          <SectionCard
            title="Today vs Yesterday"
            subtitle={`${today} live · ${yesterday} ${
              yesterdayBoard.source === 'snapshot' ? 'snapshot' : '≈ approximate'
            }`}
          >
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.6rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0f766e' }} /> Today
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#cbd5e1' }} /> Yesterday
              </span>
            </div>

            {BUCKET_ORDER.map((bucket) => {
              const todayCount = todayBoard.byBucket[bucket];
              const yesterdayCount = yesterdayBoard.byBucket[bucket];
              const delta = todayCount - yesterdayCount;
              const max = Math.max(todayCount, yesterdayCount, 1);

              return (
                <div
                  key={bucket}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '96px 1fr 74px',
                    gap: '0.5rem',
                    alignItems: 'center',
                    marginBottom: '0.4rem',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: '#475569' }}>{BUCKET_META[bucket].label}</span>
                  <div>
                    <Bar value={todayCount} max={max} color={BUCKET_META[bucket].bar} height={5} />
                    <div style={{ height: 3 }} />
                    <Bar value={yesterdayCount} max={max} color="#cbd5e1" height={5} />
                  </div>
                  <span style={{ fontSize: '0.76rem', color: '#475569', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <strong>{todayCount}</strong>
                    <span style={{ marginLeft: 4, color: delta === 0 ? '#94a3b8' : '#64748b' }}>
                      {delta === 0 ? '±0' : delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                    </span>
                  </span>
                </div>
              );
            })}
          </SectionCard>

          <SectionCard title="Activity" subtitle={`${range.start} → ${range.end} · created / completed / touched`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <ActivityStat label="Created" value={activity.created} color="#2563eb" />
              <ActivityStat label="Completed" value={activity.completed} color="#059669" />
              <ActivityStat label="Touched" value={activity.touched} color="#7c3aed" />
            </div>

            <div style={{ maxHeight: 210, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={miniTh}>Assignee</th>
                    <th style={miniTh}>Created</th>
                    <th style={miniTh}>Done</th>
                    <th style={miniTh}>Touched</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.slice(0, 12).map((row) => (
                    <tr key={row.name}>
                      <td style={miniTd}>{row.name}</td>
                      <td style={miniTdNum}>{row.created}</td>
                      <td style={miniTdNum}>{row.completed}</td>
                      <td style={miniTdNum}>{row.touched}</td>
                    </tr>
                  ))}
                  {activityRows.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ ...miniTd, color: '#94a3b8' }}>
                        No activity in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div style={twoColumnStyle}>
          <SectionCard title="Assignee × Status" subtitle="Selected board · click a number to drill down">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...miniTh, position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1 }}>Assignee</th>
                    <th style={miniTh}>Total</th>
                    {BUCKET_ORDER.map((bucket) => (
                      <th key={bucket} style={miniTh}>
                        {BUCKET_META[bucket].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((row) => (
                    <tr key={row.name}>
                      <td style={{ ...miniTd, fontWeight: 600, position: 'sticky', left: 0, backgroundColor: '#fff' }}>
                        {row.name}
                      </td>
                      <td style={miniTdNum}>{row.total}</td>
                      {BUCKET_ORDER.map((bucket) => {
                        const value = row.counts[bucket];
                        return (
                          <td key={bucket} style={miniTdNum}>
                            {value > 0 && canDrill ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onDrilldown(
                                    `${row.name} · ${BUCKET_META[bucket].label} · ${boardDate}`,
                                    tasks.filter((task) => {
                                      const names =
                                        task.assignee_names.length > 0 ? task.assignee_names : ['Unassigned'];
                                      return (
                                        names.includes(row.name) &&
                                        getEffectiveBucket(task, mapping, overrides) === bucket
                                      );
                                    })
                                  )
                                }
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  padding: 0,
                                  color: '#2563eb',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  fontSize: '0.78rem',
                                }}
                              >
                                {value}
                              </button>
                            ) : (
                              value
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <td style={{ ...miniTd, fontWeight: 700 }}>Total</td>
                    <td style={{ ...miniTdNum, fontWeight: 700 }}>{board.total}</td>
                    {BUCKET_ORDER.map((bucket) => (
                      <td key={bucket} style={{ ...miniTdNum, fontWeight: 700 }}>
                        {board.byBucket[bucket]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
              Multi-assignee tasks count under each person, so row totals can exceed the board total.
            </p>
          </SectionCard>

          <SectionCard title="Board List Breakdown" subtitle="Raw lists and their mapped bucket">
            {boardListRows.map((row) => (
              <div key={row.name} style={{ marginBottom: '0.45rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.15rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: '#334155',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.name}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.12rem 0.45rem',
                        borderRadius: 10,
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        backgroundColor: BUCKET_META[row.bucket].bg,
                        color: BUCKET_META[row.bucket].color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {BUCKET_META[row.bucket].label}
                    </span>
                    <strong style={{ fontSize: '0.78rem', color: '#0f172a', minWidth: 30, textAlign: 'right' }}>
                      {row.count}
                    </strong>
                  </span>
                </div>
                <Bar value={row.count} max={boardListMax} color={BUCKET_META[row.bucket].bar} />
              </div>
            ))}
            {boardListRows.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No board data.</div>}
          </SectionCard>
        </div>

        {dailyRows.length > 1 && (
          <SectionCard
            title="Daily Trend"
            subtitle={`${range.start} → ${range.end} · created/completed/touched are exact; board cells are live/snapshot/≈`}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={miniTh}>Date</th>
                    <th style={miniTh}>Source</th>
                    <th style={miniTh}>Total</th>
                    {BUCKET_ORDER.map((bucket) => (
                      <th key={bucket} style={miniTh}>
                        {BUCKET_META[bucket].label}
                      </th>
                    ))}
                    <th style={miniTh}>Created</th>
                    <th style={miniTh}>Completed</th>
                    <th style={miniTh}>Touched</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row) => (
                    <tr key={row.date}>
                      <td style={miniTd}>{row.date}</td>
                      <td style={miniTd}>
                        <SourceBadge source={row.board.source} />
                      </td>
                      <td style={miniTdNum}>{row.board.total}</td>
                      {BUCKET_ORDER.map((bucket) => (
                        <td key={bucket} style={miniTdNum}>
                          {row.board.byBucket[bucket]}
                        </td>
                      ))}
                      <td style={miniTdNum}>{row.activity.created}</td>
                      <td style={miniTdNum}>{row.activity.completed}</td>
                      <td style={miniTdNum}>{row.activity.touched}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
      </div>
    </details>
  );
}
