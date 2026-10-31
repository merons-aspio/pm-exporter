import { useMemo, useState } from 'react';
import type { EnrichedTaskData } from '../services/hubstaff';
import type { Bucket, StatusMapping, StatusOverrides } from '../lib/status';
import { DEFAULT_LIST_MAPPING } from '../lib/status';
import type { SnapshotStore } from '../lib/snapshots';
import { getBoardForDate } from '../lib/snapshots';
import type { PeriodKey, WeekStart } from '../lib/dates';
import { fileTimestamp, formatPeriodLabel, getPeriodRange } from '../lib/dates';
import {
  DASHBOARD_DATE_BASIS_LABEL,
  DASHBOARD_STATUS_META,
  DASHBOARD_STATUS_ORDER,
  buildBlockedItems,
  computeAssigneePerformance,
  effectiveDashboardCounts,
  filterTasksForStatus,
  isTaskInDashboardRange,
  summarizeDashboardStatuses,
  type DashboardDateBasis,
  type DashboardStatus,
  type DashboardStatusMode,
  type DashboardStatusModes,
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
  dateBasis: DashboardDateBasis;
  weekStart: WeekStart;
  statusModes: DashboardStatusModes;
  onSelectPeriod: (period: PeriodKey) => void;
  onCustomRangeChange: (start: string, end: string) => void;
  onDateBasisChange: (basis: DashboardDateBasis) => void;
  onWeekStartChange: (weekStart: WeekStart) => void;
  onStatusModeChange: (status: DashboardStatus, mode: DashboardStatusMode) => void;
  onSetAllStatusModes: (mode: DashboardStatusMode) => void;
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
  dateBasis,
  weekStart,
  statusModes,
  onSelectPeriod,
  onCustomRangeChange,
  onDateBasisChange,
  onWeekStartChange,
  onStatusModeChange,
  onSetAllStatusModes,
  onOpenTasks,
}: DashboardPageProps) {
  const [mappingOpen, setMappingOpen] = useState(false);
  const [standupPerson, setStandupPerson] = useState(loadStandupPerson);
  const [doneLists, setDoneLists] = useState<string[]>(() => loadStandupSettings().doneLists);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [drilldown, setDrilldown] = useState<{ title: string; tasks: EnrichedTaskData[] } | null>(null);

  const range = useMemo(
    () => getPeriodRange(period, customStart, customEnd, weekStart),
    [period, customStart, customEnd, weekStart]
  );
  const boardDate = range.end;
  const periodLabel = formatPeriodLabel(period, range, weekStart);

  const board = useMemo(
    () => getBoardForDate(boardDate, tasks, mapping, overrides, snapshots),
    [boardDate, tasks, mapping, overrides, snapshots]
  );

  // Historical snapshots keep powering the detailed day-by-day breakdown.
  // The top dashboard filters current task status by the selected date basis.
  const dashboardTasks = tasks;
  const canDrill = dashboardTasks.length > 0;

  const statusSummary = useMemo(
    () =>
      summarizeDashboardStatuses(
        dashboardTasks,
        mapping,
        overrides,
        range,
        dateBasis,
        statusModes
      ),
    [dashboardTasks, mapping, overrides, range, dateBasis, statusModes]
  );

  const counts = useMemo(() => effectiveDashboardCounts(statusSummary), [statusSummary]);

  const assigneeRows = useMemo(
    () =>
      computeAssigneePerformance(
        dashboardTasks,
        mapping,
        overrides,
        range,
        dateBasis,
        statusModes
      ),
    [dashboardTasks, mapping, overrides, range, dateBasis, statusModes]
  );

  const blockedAllItems = useMemo(
    () => buildBlockedItems(dashboardTasks, transitions, mapping, overrides),
    [dashboardTasks, transitions, mapping, overrides]
  );

  const blockedPeriodItems = useMemo(
    () =>
      blockedAllItems.filter((item) =>
        isTaskInDashboardRange(item.task, dateBasis, range)
      ),
    [blockedAllItems, dateBasis, range]
  );

  const blockedVisibleItems =
    statusModes.blocked === 'all' ? blockedAllItems : blockedPeriodItems;
  const blockedOutsideItems =
    statusModes.blocked === 'all'
      ? []
      : blockedAllItems.filter(
          (item) => !isTaskInDashboardRange(item.task, dateBasis, range)
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
    if (!canDrill) return;
    const entry = statusSummary[status];
    const scopeLabel = entry.mode === 'all' ? 'all time' : periodLabel;
    setDrilldown({
      title: `${DASHBOARD_STATUS_META[status].label} · ${scopeLabel} · ${entry.effective} tasks`,
      tasks: filterTasksForStatus(
        dashboardTasks,
        status,
        mapping,
        overrides,
        range,
        dateBasis,
        statusModes
      ),
    });
  };

  const openTaskDrilldown = (title: string, drilldownTasks: EnrichedTaskData[]) => {
    if (!canDrill) return;
    setDrilldown({ title, tasks: drilldownTasks });
  };

  const openAllTestingTasks = () => {
    if (!canDrill) {
      onOpenTasks();
      return;
    }
    setDrilldown({
      title: `Testing · ${
        statusModes.testing === 'all' ? 'all testing tasks' : periodLabel
      }`,
      tasks: filterTasksForStatus(
        dashboardTasks,
        'testing',
        mapping,
        overrides,
        range,
        dateBasis,
        statusModes
      ),
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
        dateBasis={dateBasis}
        weekStart={weekStart}
        statusModes={statusModes}
        onSelectPeriod={onSelectPeriod}
        onCustomRangeChange={onCustomRangeChange}
        onDateBasisChange={onDateBasisChange}
        onWeekStartChange={onWeekStartChange}
        onSetAllStatusModes={onSetAllStatusModes}
        onOpenMapping={() => setMappingOpen(true)}
      />

      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {DASHBOARD_STATUS_ORDER.map((status) => {
            const entry = statusSummary[status];
            return (
              <KpiCard
                key={status}
                status={status}
                filtered={entry.filtered}
                total={entry.total}
                mode={entry.mode}
                onModeChange={(mode) => onStatusModeChange(status, mode)}
                onClick={() => openStatusDrilldown(status)}
                disabled={!canDrill}
              />
            );
          })}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <AssigneePerformanceTable
              rows={assigneeRows}
              periodLabel={periodLabel}
              dateBasisLabel={DASHBOARD_DATE_BASIS_LABEL[dateBasis]}
              statusModes={statusModes}
            />
            <PipelineChart
              counts={counts}
              periodLabel={periodLabel}
              onSelect={canDrill ? openStatusDrilldown : undefined}
            />
          </div>

          <div className="space-y-6">
            <TestingBoard
              tasks={dashboardTasks}
              transitions={transitions}
              mapping={mapping}
              overrides={overrides}
              boardDate={boardDate}
              range={range}
              dateBasis={dateBasis}
              mode={statusModes.testing}
              weekStart={weekStart}
              dashboardTotal={statusSummary.testing.total}
              periodLabel={periodLabel}
              onViewAll={openAllTestingTasks}
              onDrilldown={openTaskDrilldown}
            />

            <BlockedPanel
              items={blockedVisibleItems}
              outsideItems={blockedOutsideItems}
              total={statusSummary.blocked.total}
              mode={statusModes.blocked}
              periodLabel={periodLabel}
              boardDate={boardDate}
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
          canDrill={board.source !== 'snapshot'}
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
