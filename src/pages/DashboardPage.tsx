import { useMemo, useState } from 'react';
import type { EnrichedTaskData } from '../services/hubstaff';
import type { Bucket, StatusMapping, StatusOverrides } from '../lib/status';
import { DEFAULT_LIST_MAPPING } from '../lib/status';
import type { SnapshotStore } from '../lib/snapshots';
import { getBoardForDate } from '../lib/snapshots';
import type { PeriodKey } from '../lib/dates';
import { endOfDayMs, fileTimestamp, formatPeriodLabel, getPeriodRange, parseDate } from '../lib/dates';
import {
  DASHBOARD_STATUS_META,
  DASHBOARD_STATUS_ORDER,
  buildBlockedItems,
  computeAssigneePerformance,
  dashboardCountsFromBoard,
  getDashboardStatus,
  type DashboardStatus,
} from '../lib/dashboard';
import {
  buildStandup,
  buildStandupExportRows,
  loadStandupSettings,
  saveStandupSettings,
} from '../lib/standup';
import { buildExportRows } from '../lib/exportRows';
import type { ListTransition } from '../lib/transitions';
import ExportDialog from '../components/ExportDialog';
import StatusMappingModal from '../components/StatusMappingModal';
import DateToolbar from '../components/dashboard/DateToolbar';
import KpiCard from '../components/dashboard/KpiCard';
import AssigneePerformanceTable from '../components/dashboard/AssigneePerformanceTable';
import PipelineChart from '../components/dashboard/PipelineChart';
import TestingBoard from '../components/dashboard/TestingBoard';
import BlockedPanel from '../components/dashboard/BlockedPanel';
import DrilldownModal from '../components/dashboard/DrilldownModal';
import DashboardDetails from '../components/dashboard/DashboardDetails';

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
  period: PeriodKey;
  customStart: string;
  customEnd: string;
  onSelectPeriod: (period: PeriodKey) => void;
  onCustomRangeChange: (start: string, end: string) => void;
  onOpenTasks: () => void;
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
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
  period,
  customStart,
  customEnd,
  onSelectPeriod,
  onCustomRangeChange,
  onOpenTasks,
}: DashboardPageProps) {
  const [mappingOpen, setMappingOpen] = useState(false);
  const [standupPerson, setStandupPerson] = useState(loadStandupPerson);
  const [doneLists, setDoneLists] = useState<string[]>(() => loadStandupSettings().doneLists);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [drilldown, setDrilldown] = useState<{ title: string; tasks: EnrichedTaskData[] } | null>(null);

  const range = useMemo(
    () => getPeriodRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  );
  const boardDate = range.end;
  const periodLabel = formatPeriodLabel(period, range);

  const board = useMemo(
    () => getBoardForDate(boardDate, tasks, mapping, overrides, snapshots),
    [boardDate, tasks, mapping, overrides, snapshots]
  );

  const canDrill = board.source !== 'snapshot';
  const boardTasks = useMemo(() => {
    if (board.source === 'snapshot') return null;
    if (board.source !== 'approximate') return tasks;
    const end = endOfDayMs(boardDate);
    return tasks.filter((task) => {
      const created = parseDate(task.created_at);
      return created !== null && created.getTime() <= end;
    });
  }, [board.source, boardDate, tasks]);

  const counts = useMemo(() => dashboardCountsFromBoard(board), [board]);

  const assigneeRows = useMemo(
    () => computeAssigneePerformance(board, boardTasks, mapping, overrides),
    [board, boardTasks, mapping, overrides]
  );

  const blockedItems = useMemo(
    () => buildBlockedItems(boardTasks, transitions, mapping, overrides),
    [boardTasks, transitions, mapping, overrides]
  );

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

  const listRows = useMemo(() => {
    const listCounts = new Map<string, { count: number; position: number }>();

    tasks.forEach((task) => {
      const current = listCounts.get(task.board_status);
      if (current) {
        current.count += 1;
        current.position = Math.min(current.position, task.list_position);
      } else {
        listCounts.set(task.board_status, { count: 1, position: task.list_position });
      }
    });

    Object.keys(DEFAULT_LIST_MAPPING).forEach((list) => {
      if (!listCounts.has(list)) listCounts.set(list, { count: 0, position: 999 });
    });

    return Array.from(listCounts.entries())
      .map(([name, info]) => ({
        name,
        count: info.count,
        position: info.position,
        bucket: mapping[name] ?? 'todo',
      }))
      .sort((a, b) => a.position - b.position);
  }, [tasks, mapping]);

  const listOptions = useMemo(
    () => listRows.map((row) => ({ name: row.name, count: row.count })),
    [listRows]
  );

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
    const exportRows = buildExportRows(drilldown.tasks, mapping, overrides);
    setExportState({
      title: `Export · ${drilldown.title}`,
      rows: exportRows,
      allRows: exportRows,
      filteredLabel: 'Drill-down tasks',
      allLabel: 'Drill-down tasks',
      baseName: `dashboard_${slugify(drilldown.title)}_${fileTimestamp()}`,
      defaultPreset: 'everything',
      allowAll: false,
    });
  };

  const openStatusDrilldown = (status: DashboardStatus) => {
    if (!canDrill || !boardTasks) return;
    setDrilldown({
      title: `${DASHBOARD_STATUS_META[status].label} · ${boardDate}`,
      tasks: boardTasks.filter((task) => getDashboardStatus(task, mapping, overrides) === status),
    });
  };

  const openTaskDrilldown = (title: string, drilldownTasks: EnrichedTaskData[]) => {
    if (!canDrill) return;
    setDrilldown({ title, tasks: drilldownTasks });
  };

  const openAllTestingTasks = () => {
    if (!boardTasks) {
      onOpenTasks();
      return;
    }
    setDrilldown({
      title: `Testing · ${boardDate}`,
      tasks: boardTasks.filter((task) => getDashboardStatus(task, mapping, overrides) === 'testing'),
    });
  };

  const handleBlockedDrilldown = (title: string, items: ReturnType<typeof buildBlockedItems>) => {
    openTaskDrilldown(title, items.map((item) => item.task));
  };

  return (
    <div>
      <DateToolbar
        period={period}
        customStart={customStart}
        customEnd={customEnd}
        rangeLabel={periodLabel}
        boardDate={boardDate}
        source={board.source}
        capturedAt={board.capturedAt}
        onSelectPeriod={onSelectPeriod}
        onCustomRangeChange={onCustomRangeChange}
        onOpenMapping={() => setMappingOpen(true)}
      />

      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {DASHBOARD_STATUS_ORDER.map((status) => (
            <KpiCard
              key={status}
              status={status}
              count={counts[status]}
              onClick={() => openStatusDrilldown(status)}
              disabled={!canDrill}
            />
          ))}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <AssigneePerformanceTable
              rows={assigneeRows}
              approximateOverdue={board.source === 'snapshot'}
            />
            <PipelineChart
              counts={counts}
              onSelect={canDrill ? openStatusDrilldown : undefined}
            />
          </div>

          <div className="space-y-6">
            <TestingBoard
              boardTasks={boardTasks}
              transitions={transitions}
              mapping={mapping}
              overrides={overrides}
              boardDate={boardDate}
              boardCount={board.byBucket.testing}
              onViewAll={openAllTestingTasks}
              onDrilldown={openTaskDrilldown}
            />

            <BlockedPanel
              items={blockedItems}
              boardDate={boardDate}
              boardSource={board.source}
              boardCount={board.byBucket.blocked}
              onDrilldown={handleBlockedDrilldown}
            />
          </div>
        </div>

        <DashboardDetails
          tasks={tasks}
          mapping={mapping}
          overrides={overrides}
          snapshots={snapshots}
          transitions={transitions}
          range={range}
          board={board}
          boardDate={boardDate}
          canDrill={canDrill}
          onDrilldown={openTaskDrilldown}
          standup={standup}
          standupPerson={effectiveStandupPerson}
          onSelectStandupPerson={handleSelectStandupPerson}
          doneLists={doneLists}
          onDoneListsChange={handleDoneListsChange}
          listOptions={listOptions}
          onStandupExport={handleStandupExport}
          lastSyncedAt={lastSyncedAt}
          syncing={syncing}
          onSync={onSync}
        />
      </main>

      {drilldown && (
        <DrilldownModal
          title={drilldown.title}
          tasks={drilldown.tasks}
          mapping={mapping}
          overrides={overrides}
          onClose={() => setDrilldown(null)}
          onExport={handleDrilldownExport}
        />
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
