import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { AlertTriangle, CalendarDays, Download, Settings2, X } from 'lucide-react';
import type { EnrichedTaskData } from '../services/hubstaff';
import { BUCKET_META, BUCKET_ORDER, DEFAULT_LIST_MAPPING, getEffectiveBucket } from '../lib/status';
import type { Bucket, StatusMapping, StatusOverrides } from '../lib/status';
import { getBoardForDate } from '../lib/snapshots';
import type { SnapshotStore } from '../lib/snapshots';
import {
  addDays,
  daysOverdue,
  endOfDayMs,
  fileTimestamp,
  formatDate,
  formatDateTime,
  getPeriodRange,
  isDueToday,
  isInRange,
  isTaskOverdue,
  parseDate,
  parseDateKey,
  startOfDayMs,
  toDateKey,
  todayKey,
} from '../lib/dates';
import type { PeriodKey } from '../lib/dates';
import { computeActivity, computeActivityByAssignee } from '../lib/activity';
import { buildExportRows } from '../lib/exportRows';
import {
  buildStandup,
  buildStandupExportRows,
  loadStandupSettings,
  saveStandupSettings,
} from '../lib/standup';
import type { ListTransition } from '../lib/transitions';
import ExportDialog from '../components/ExportDialog';
import StandupSection from '../components/StandupSection';
import StatusMappingModal from '../components/StatusMappingModal';
import {
  Bar,
  SectionCard,
  SourceBadge,
  StatusBadge,
  cardStyle,
  inputStyle,
  selectStyle,
  tdStyle,
  thStyle,
} from '../components/ui';

interface DashboardPageProps {
  tasks: EnrichedTaskData[];
  mapping: StatusMapping;
  overrides: StatusOverrides;
  snapshots: SnapshotStore;
  transitions: ListTransition[];
  lastSyncedAt: string | null;
  syncing: boolean;
  onSync: () => void;
  onMappingChange: (list: string, bucket: Bucket) => void;
  onSetMappingDefault: () => void;
  onResetMappingToDefault: () => void;
  onResetMappingToBuiltIn: () => void;
  hasSavedDefault: boolean;
}

interface ExportState {
  title: string;
  description?: string;
  rows: Record<string, unknown>[];
  allRows: Record<string, unknown>[];
  filteredLabel: string;
  allLabel: string;
  baseName: string;
  defaultPreset: 'titles' | 'everything' | 'custom';
  allowAll: boolean;
}

const STANDUP_PERSON_KEY = 'hubstaff_standup_person_v1';

function loadStandupPerson(): string {
  try {
    return localStorage.getItem(STANDUP_PERSON_KEY) || 'Lidetu Ketema';
  } catch {
    return 'Lidetu Ketema';
  }
}

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

const twoColumnStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  gap: '1rem',
  marginBottom: '1rem',
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

const modalButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.4rem 0.65rem',
  border: 'none',
  borderRadius: 5,
  color: '#fff',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
};

function sumCounts(counts: Record<Bucket, number>): number {
  return BUCKET_ORDER.reduce((total, bucket) => total + counts[bucket], 0);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

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

function AttentionStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '0.5rem 0.55rem', borderRadius: 6, backgroundColor: '#fff7f7', border: '1px solid #fee2e2' }}>
      <div style={{ fontSize: '0.64rem', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default function DashboardPage({
  tasks,
  mapping,
  overrides,
  snapshots,
  transitions,
  lastSyncedAt,
  syncing,
  onSync,
  onMappingChange,
  onSetMappingDefault,
  onResetMappingToDefault,
  onResetMappingToBuiltIn,
  hasSavedDefault,
}: DashboardPageProps) {
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [customStart, setCustomStart] = useState(todayKey());
  const [customEnd, setCustomEnd] = useState(todayKey());
  const [mappingOpen, setMappingOpen] = useState(false);
  const [standupPerson, setStandupPerson] = useState(loadStandupPerson);
  const [doneLists, setDoneLists] = useState<string[]>(() => loadStandupSettings().doneLists);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [drilldown, setDrilldown] = useState<{ title: string; tasks: EnrichedTaskData[] } | null>(null);

  const range = useMemo(() => getPeriodRange(period, customStart, customEnd), [period, customStart, customEnd]);
  const boardDate = range.end;
  const periodLabel =
    period === 'custom'
      ? `${range.start} → ${range.end}`
      : (PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Custom range');

  const board = useMemo(
    () => getBoardForDate(boardDate, tasks, mapping, overrides, snapshots),
    [boardDate, tasks, mapping, overrides, snapshots]
  );

  const previousDate = useMemo(
    () => toDateKey(addDays(parseDateKey(boardDate) ?? new Date(), -1)),
    [boardDate]
  );

  const previousBoard = useMemo(
    () => getBoardForDate(previousDate, tasks, mapping, overrides, snapshots),
    [previousDate, tasks, mapping, overrides, snapshots]
  );

  const canDrill = board.source !== 'snapshot';

  // For approximate days only tasks that existed by the end of that day are shown.
  const boardTasks = useMemo(() => {
    if (board.source !== 'approximate') return tasks;
    const end = endOfDayMs(boardDate);
    return tasks.filter((task) => {
      const created = parseDate(task.created_at);
      return created !== null && created.getTime() <= end;
    });
  }, [board.source, boardDate, tasks]);

  const standup = useMemo(
    () => buildStandup(tasks, mapping, overrides, transitions, boardDate, doneLists),
    [tasks, mapping, overrides, transitions, boardDate, doneLists]
  );

  const effectiveStandupPerson = useMemo(() => {
    if (standupPerson === 'all') return 'all';
    if (standup.people.some((person) => person.name === standupPerson)) return standupPerson;
    const lidetu = standup.people.find((person) => person.name.toLowerCase().includes('lidetu'));
    return lidetu?.name ?? standup.people[0]?.name ?? 'all';
  }, [standup, standupPerson]);

  const handleSelectStandupPerson = (name: string) => {
    setStandupPerson(name);
    try {
      localStorage.setItem(STANDUP_PERSON_KEY, name);
    } catch {
      // Ignore storage failures; the selection still works for this session.
    }
  };

  const handleDoneListsChange = (lists: string[]) => {
    setDoneLists(lists);
    saveStandupSettings({ doneLists: lists });
  };

  const handleStandupExport = () => {
    const rows = buildStandupExportRows(standup, effectiveStandupPerson, mapping, overrides);
    const allRows = buildStandupExportRows(standup, 'all', mapping, overrides);
    setExportState({
      title: `Standup export · ${boardDate}`,
      description:
        'Choose titles only or all fields, and whether to export the selected assignee or all assignees.',
      rows,
      allRows,
      filteredLabel: effectiveStandupPerson === 'all' ? 'All assignees' : effectiveStandupPerson,
      allLabel: 'All assignees',
      baseName: `standup_${boardDate}`,
      defaultPreset: 'titles',
      allowAll: effectiveStandupPerson !== 'all',
    });
  };

  const handleDrilldownExport = () => {
    if (!drilldown) return;
    const rows = buildExportRows(drilldown.tasks, mapping, overrides);
    setExportState({
      title: `Export · ${drilldown.title}`,
      rows,
      allRows: rows,
      filteredLabel: 'Drill-down tasks',
      allLabel: 'Drill-down tasks',
      baseName: `dashboard_${slugify(drilldown.title)}_${fileTimestamp()}`,
      defaultPreset: 'everything',
      allowAll: false,
    });
  };

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

  const activity = useMemo(
    () => computeActivity(tasks, range.start, range.end),
    [tasks, range.start, range.end]
  );

  const activityRows = useMemo(
    () => computeActivityByAssignee(tasks, range.start, range.end),
    [tasks, range.start, range.end]
  );

  const dailyRows = useMemo(() => {
    if (range.days.length <= 1) return [];
    return range.days.map((date) => ({
      date,
      board: getBoardForDate(date, tasks, mapping, overrides, snapshots),
      activity: computeActivity(tasks, date, date),
    }));
  }, [range.days, tasks, mapping, overrides, snapshots]);

  const matrixRows = useMemo(
    () =>
      Object.entries(board.byAssigneeBucket)
        .map(([name, counts]) => ({ name, counts, total: sumCounts(counts) }))
        .sort((a, b) => b.total - a.total),
    [board]
  );

  const sprintRows = useMemo(
    () =>
      Object.entries(board.byAssigneeList)
        .map(([name, lists]) => ({ name, count: lists['Current sprint'] ?? 0 }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count),
    [board]
  );

  const sprintCount = board.byList['Current sprint'] ?? 0;
  const previousSprint = previousBoard.byList['Current sprint'] ?? 0;
  const sprintDelta = sprintCount - previousSprint;
  const sprintMax = Math.max(1, ...sprintRows.map((row) => row.count));

  const sprintTouched = useMemo(() => {
    const start = startOfDayMs(range.start);
    const end = endOfDayMs(range.end);
    return boardTasks.filter(
      (task) => task.board_status === 'Current sprint' && isInRange(task.updated_at, start, end)
    ).length;
  }, [boardTasks, range.start, range.end]);

  const attention = useMemo(() => {
    const blocked: EnrichedTaskData[] = [];
    const overdue: EnrichedTaskData[] = [];

    tasks.forEach((task) => {
      const bucket = getEffectiveBucket(task, mapping, overrides);
      if (bucket === 'blocked') blocked.push(task);
      if (bucket !== 'done' && isTaskOverdue(task.due_date, task.done)) overdue.push(task);
    });

    const merged = Array.from(new Map([...blocked, ...overdue].map((task) => [task.id, task])).values()).sort(
      (a, b) =>
        (parseDate(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY) -
        (parseDate(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY)
    );

    return { blocked, overdue, merged };
  }, [tasks, mapping, overrides]);

  const bothCount = attention.blocked.filter((task) => isTaskOverdue(task.due_date, task.done)).length;

  const listRows = useMemo(() => {
    const counts = new Map<string, { count: number; position: number }>();

    tasks.forEach((task) => {
      const current = counts.get(task.board_status);
      if (current) {
        current.count += 1;
        current.position = Math.min(current.position, task.list_position);
      } else {
        counts.set(task.board_status, { count: 1, position: task.list_position });
      }
    });

    Object.keys(DEFAULT_LIST_MAPPING).forEach((list) => {
      if (!counts.has(list)) counts.set(list, { count: 0, position: 999 });
    });

    return Array.from(counts.entries())
      .map(([name, info]) => ({
        name,
        count: info.count,
        position: info.position,
        bucket: mapping[name] ?? 'todo',
      }))
      .sort((a, b) => a.position - b.position);
  }, [tasks, mapping]);

  const boardListRows = Object.entries(board.byList)
    .map(([name, count]) => ({ name, count, bucket: mapping[name] ?? 'todo' }))
    .sort((a, b) => b.count - a.count);
  const boardListMax = Math.max(1, ...boardListRows.map((row) => row.count));

  const openDrilldown = (title: string, filter: (task: EnrichedTaskData) => boolean) => {
    if (!canDrill) return;
    setDrilldown({ title, tasks: boardTasks.filter(filter) });
  };

  const kpiCards: Array<{
    key: string;
    label: string;
    value: number;
    delta: number;
    accent: string;
    onClick: () => void;
  }> = [];

  kpiCards.push({
    key: 'total',
    label: 'Total Tasks',
    value: board.total,
    delta: board.total - previousBoard.total,
    accent: '#0f766e',
    onClick: () => openDrilldown(`All tasks · ${boardDate}`, () => true),
  });

  kpiCards.push({
    key: 'sprint',
    label: 'Current Sprint',
    value: sprintCount,
    delta: sprintDelta,
    accent: '#0891b2',
    onClick: () => openDrilldown(`Current sprint · ${boardDate}`, (task) => task.board_status === 'Current sprint'),
  });

  (['todo', 'in_progress', 'testing', 'blocked', 'pushed', 'done', 'backlog'] as Bucket[]).forEach((bucket) => {
    kpiCards.push({
      key: bucket,
      label: BUCKET_META[bucket].label,
      value: board.byBucket[bucket],
      delta: board.byBucket[bucket] - previousBoard.byBucket[bucket],
      accent: BUCKET_META[bucket].bar,
      onClick: () =>
        openDrilldown(
          `${BUCKET_META[bucket].label} · ${boardDate}`,
          (task) => getEffectiveBucket(task, mapping, overrides) === bucket
        ),
    });
  });

  return (
    <div>
      {/* Period bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '0.85rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>Daily Status</h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            {tasks.length} tasks · {periodLabel} · board as of {boardDate}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <CalendarDays size={16} color="#64748b" />
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as PeriodKey)}
            style={{ ...selectStyle, width: 'auto' }}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {period === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                style={{ ...inputStyle, width: 'auto' }}
              />
              <span style={{ color: '#94a3b8' }}>→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                style={{ ...inputStyle, width: 'auto' }}
              />
            </>
          )}

          <button
            onClick={() => setMappingOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0.65rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#475569',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Settings2 size={15} /> Status Mapping
          </button>

          <button
            onClick={handleStandupExport}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0.65rem',
              borderRadius: 6,
              border: '1px solid #0f766e',
              backgroundColor: '#0f766e',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download size={15} /> Export
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.6rem',
          marginBottom: '0.6rem',
        }}
      >
        {kpiCards.map((card) => {
          const deltaLabel = card.delta === 0 ? '±0' : card.delta > 0 ? `+${card.delta}` : String(card.delta);

          return (
            <div
              key={card.key}
              onClick={canDrill ? card.onClick : undefined}
              title={canDrill ? 'Click to view matching tasks' : 'Snapshot days do not store task-level detail'}
              style={{
                ...cardStyle,
                padding: '0.75rem 0.85rem',
                borderLeft: `4px solid ${card.accent}`,
                cursor: canDrill ? 'pointer' : 'default',
                opacity: card.value === 0 ? 0.72 : 1,
              }}
            >
              <div
                style={{
                  fontSize: '0.68rem',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {card.label}
              </div>
              <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                {card.value}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <span>{deltaLabel} vs prev.</span>
                {previousBoard.source === 'approximate' && <span title="Previous day is approximate">≈</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily standup — the primary daily view */}
      <div style={{ marginBottom: '1rem' }}>
        <StandupSection
          standup={standup}
          selectedPerson={effectiveStandupPerson}
          onSelectPerson={handleSelectStandupPerson}
          doneLists={doneLists}
          onDoneListsChange={handleDoneListsChange}
          listOptions={listRows.map((row) => ({ name: row.name, count: row.count }))}
          onDrilldown={(title, standupTasks) => setDrilldown({ title, tasks: standupTasks })}
          onExport={handleStandupExport}
          lastSyncedAt={lastSyncedAt}
          onSync={onSync}
          syncing={syncing}
        />
      </div>

      {/* Board source note */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          fontSize: '0.78rem',
          color: '#64748b',
          marginBottom: '1rem',
        }}
      >
        <SourceBadge source={board.source} />
        <span>Board · {board.date}</span>
        {board.source === 'snapshot' && board.capturedAt && (
          <span>captured {formatDateTime(board.capturedAt)}</span>
        )}
        {board.source === 'approximate' && (
          <span>
            Reconstructed from tasks created by this date using current list/status. Per-list history starts from the
            first snapshot.
          </span>
        )}
        {board.source === 'live' && <span>Live from the current board.</span>}
      </div>

      {/* Today vs Yesterday + Activity */}
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

        <SectionCard title="Activity" subtitle={`${periodLabel} · created / completed / touched`}>
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

      {/* Assignee matrix + Sprint */}
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
                              onClick={() =>
                                openDrilldown(
                                  `${row.name} · ${BUCKET_META[bucket].label} · ${boardDate}`,
                                  (task) => {
                                    const names =
                                      task.assignee_names.length > 0 ? task.assignee_names : ['Unassigned'];
                                    return (
                                      names.includes(row.name) &&
                                      getEffectiveBucket(task, mapping, overrides) === bucket
                                    );
                                  }
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

        <SectionCard title="Current Sprint" subtitle={`Raw "Current sprint" list · ${boardDate}`}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>{sprintCount}</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>tasks</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: '#64748b' }}>
              {sprintDelta === 0 ? '±0' : sprintDelta > 0 ? `+${sprintDelta}` : sprintDelta} vs prev.
            </span>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>
            {sprintTouched} sprint task{sprintTouched === 1 ? '' : 's'} touched · {periodLabel}
          </div>

          {sprintRows.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>No tasks in the sprint.</div>
          ) : (
            <div style={{ maxHeight: 210, overflowY: 'auto' }}>
              {sprintRows.map((row) => (
                <div
                  key={row.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr 32px',
                    gap: '0.5rem',
                    alignItems: 'center',
                    marginBottom: '0.35rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: '#475569',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.name}
                  </span>
                  <Bar value={row.count} max={sprintMax} color="#0891b2" />
                  <span style={{ fontSize: '0.78rem', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: '0.6rem',
              fontSize: '0.72rem',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            Mapped to <StatusBadge bucket={mapping['Current sprint'] ?? 'todo'} />
          </div>
        </SectionCard>
      </div>

      {/* Needs attention + Board lists */}
      <div style={twoColumnStyle}>
        <SectionCard
          title="Needs Attention"
          subtitle="Current blocked + overdue tasks"
          action={<AlertTriangle size={16} color="#dc2626" />}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <AttentionStat label="Blocked" value={attention.blocked.length} color="#dc2626" />
            <AttentionStat label="Overdue" value={attention.overdue.length} color="#f59e0b" />
            <AttentionStat label="Both" value={bothCount} color="#7f1d1d" />
          </div>

          {attention.merged.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Nothing blocked or overdue. Nice.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {attention.merged.slice(0, 8).map((task) => {
                  const overdue = isTaskOverdue(task.due_date, task.done);
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.35rem 0.45rem',
                        borderRadius: 5,
                        backgroundColor: '#fff7f7',
                        border: '1px solid #fee2e2',
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#94a3b8' }}>
                        #{task.id}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: '0.78rem',
                          color: '#334155',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={task.subject}
                      >
                        {task.subject}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {task.assignee_names.join(', ') || 'Unassigned'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: overdue ? '#dc2626' : '#94a3b8',
                          whiteSpace: 'nowrap',
                          fontWeight: overdue ? 600 : 400,
                        }}
                      >
                        {overdue ? formatDate(task.due_date) : 'No due'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {attention.merged.length > 8 && (
                <button
                  onClick={() => setDrilldown({ title: 'Blocked + overdue tasks', tasks: attention.merged })}
                  style={{
                    marginTop: '0.6rem',
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: 4,
                    backgroundColor: '#fff',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  View all {attention.merged.length}
                </button>
              )}
            </>
          )}
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
                  <StatusBadge bucket={row.bucket} />
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

      {/* Daily trend */}
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

      {/* Drill-down modal */}
      {drilldown && (
        <div
          onClick={() => setDrilldown(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              borderRadius: 8,
              width: 'min(1200px, 100%)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1rem',
                borderBottom: '1px solid #e2e8f0',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{drilldown.title}</h3>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  {drilldown.tasks.length} tasks
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button
                  onClick={handleDrilldownExport}
                  style={{ ...modalButtonStyle, backgroundColor: '#0f766e' }}
                >
                  <Download size={14} /> Export
                </button>
                <button
                  onClick={() => setDrilldown(null)}
                  aria-label="Close"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 30,
                    height: 30,
                    border: '1px solid #cbd5e1',
                    borderRadius: 5,
                    backgroundColor: '#fff',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div style={{ overflow: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  textAlign: 'left',
                  minWidth: 1000,
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Title</th>
                    <th style={thStyle}>Board</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Assignees</th>
                    <th style={thStyle}>Due</th>
                    <th style={thStyle}>Days Late</th>
                    <th style={thStyle}>Updated</th>
                    <th style={thStyle}>Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldown.tasks.slice(0, 500).map((task) => {
                    const late = daysOverdue(task.due_date);
                    const due = parseDate(task.due_date);
                    const lateLabel = !due ? '—' : late > 0 ? `${late}d` : isDueToday(task.due_date) ? 'today' : '—';

                    return (
                      <tr key={task.id}>
                        <td style={tdStyle}>#{task.id}</td>
                        <td style={{ ...tdStyle, fontWeight: 500, color: '#1e293b' }}>{task.subject}</td>
                        <td style={tdStyle}>{task.board_status}</td>
                        <td style={tdStyle}>
                          <StatusBadge bucket={getEffectiveBucket(task, mapping, overrides)} />
                        </td>
                        <td style={tdStyle}>{task.assignee_names.join(', ') || 'Unassigned'}</td>
                        <td style={tdStyle}>{formatDate(task.due_date)}</td>
                        <td style={{ ...tdStyle, color: late > 0 ? '#b91c1c' : '#64748b' }}>{lateLabel}</td>
                        <td style={tdStyle}>{formatDate(task.updated_at)}</td>
                        <td style={tdStyle}>{task.estimate_hours > 0 ? `${task.estimate_hours}h` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {drilldown.tasks.length > 500 && (
                <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Showing first 500 of {drilldown.tasks.length}. Export for all.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <StatusMappingModal
        open={mappingOpen}
        onClose={() => setMappingOpen(false)}
        listRows={listRows}
        mapping={mapping}
        onMappingChange={onMappingChange}
        onSetAsDefault={onSetMappingDefault}
        onResetToDefault={onResetMappingToDefault}
        onResetToBuiltIn={onResetMappingToBuiltIn}
        hasSavedDefault={hasSavedDefault}
      />

      {exportState && (
        <ExportDialog
          open
          onClose={() => setExportState(null)}
          title={exportState.title}
          description={exportState.description}
          rows={exportState.rows}
          allRows={exportState.allRows}
          filteredLabel={exportState.filteredLabel}
          allLabel={exportState.allLabel}
          baseName={exportState.baseName}
          defaultPreset={exportState.defaultPreset}
          allowAll={exportState.allowAll}
        />
      )}
    </div>
  );
}
