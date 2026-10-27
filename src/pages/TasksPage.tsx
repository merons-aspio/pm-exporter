import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react';
import {
  Field,
  MultiSelect,
  StatusBadge,
  inputStyle,
  pagerButtonStyle,
  selectStyle,
  tdStyle,
  thStyle,
} from '../components/ui';
import type { Option } from '../components/ui';
import { fileTimestamp, formatDate, isTaskOverdue, parseDate } from '../lib/dates';
import { buildExportRows } from '../lib/exportRows';
import { BUCKET_META, BUCKET_ORDER, getEffectiveBucket, getListBucket } from '../lib/status';
import type { Bucket, StatusMapping, StatusOverrides } from '../lib/status';
import type { EnrichedTaskData } from '../services/hubstaff';
import ExportDialog from '../components/ExportDialog';

type DateField = 'due' | 'start' | 'created' | 'updated' | 'done';
type DueStatus = 'all' | 'has' | 'none' | 'overdue';
type SortKey = 'id' | 'subject' | 'board_status' | 'estimate_hours' | 'due_date' | 'created_at' | 'updated_at';
type AssigneeMatch = 'any' | 'all';

interface TasksPageProps {
  tasks: EnrichedTaskData[];
  mapping: StatusMapping;
  overrides: StatusOverrides;
  onOverride: (taskId: number, bucket: Bucket | null) => void;
}

const exportButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.55rem 0.85rem',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.85rem',
};

function getDateValue(task: EnrichedTaskData, field: DateField): string | null {
  switch (field) {
    case 'due':
      return task.due_date;
    case 'start':
      return task.start_on;
    case 'created':
      return task.created_at;
    case 'updated':
      return task.updated_at;
    case 'done':
      return task.done_at;
  }
}

function preview(text: string, max = 90): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > max ? `${singleLine.slice(0, max)}…` : singleLine;
}

export default function TasksPage({ tasks, mapping, overrides, onOverride }: TasksPageProps) {
  // --- Filters ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBoardStatuses, setSelectedBoardStatuses] = useState<string[]>([]);
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [assigneeMatch, setAssigneeMatch] = useState<AssigneeMatch>('any');
  const [selectedSystemStatuses, setSelectedSystemStatuses] = useState<string[]>([]);
  const [dueStatus, setDueStatus] = useState<DueStatus>('all');
  const [dateField, setDateField] = useState<DateField>('due');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [estimateMin, setEstimateMin] = useState('');
  const [estimateMax, setEstimateMax] = useState('');
  const [hasDescription, setHasDescription] = useState(false);

  // --- Sorting / pagination ---
  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // --- Filter option lists with counts ---
  const boardOptions = useMemo<Option[]>(() => {
    const counts = new Map<string, number>();
    const positions = new Map<string, number>();

    tasks.forEach((task) => {
      counts.set(task.board_status, (counts.get(task.board_status) || 0) + 1);
      positions.set(
        task.board_status,
        Math.min(positions.get(task.board_status) ?? Number.MAX_SAFE_INTEGER, task.list_position)
      );
    });

    const entries = Array.from(counts.entries()).map(([value, count]) => ({
      value,
      label: value,
      count,
      position: positions.get(value) ?? 0,
    }));

    entries.sort((a, b) => a.position - b.position);
    return entries.map((entry) => ({ value: entry.value, label: entry.label, count: entry.count }));
  }, [tasks]);

  const bucketOptions = useMemo<Option[]>(() => {
    const counts = new Map<Bucket, number>();

    tasks.forEach((task) => {
      const bucket = getEffectiveBucket(task, mapping, overrides);
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    });

    return BUCKET_ORDER.map((bucket) => ({
      value: bucket,
      label: BUCKET_META[bucket].label,
      count: counts.get(bucket) ?? 0,
    }));
  }, [tasks, mapping, overrides]);

  const assigneeOptions = useMemo<Option[]>(() => {
    const counts = new Map<string, number>();

    tasks.forEach((task) => {
      const names = task.assignee_names.length > 0 ? task.assignee_names : ['Unassigned'];
      names.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
    });

    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const systemStatusOptions = useMemo<Option[]>(() => {
    const counts = new Map<string, number>();
    tasks.forEach((task) => counts.set(task.system_status, (counts.get(task.system_status) || 0) + 1));
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const isOverdueFor = (task: EnrichedTaskData) =>
    getEffectiveBucket(task, mapping, overrides) !== 'done' && isTaskOverdue(task.due_date, task.done);

  // --- Filtering ---
  const filteredTasks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const minEstimate = estimateMin === '' ? null : Number(estimateMin);
    const maxEstimate = estimateMax === '' ? null : Number(estimateMax);
    const rangeStart = startDate ? (parseDate(startDate)?.getTime() ?? null) : null;
    const rangeEnd = endDate ? (parseDate(endDate)?.getTime() ?? null) : null;
    const rangeEndInclusive = rangeEnd === null ? null : rangeEnd + 86_399_999;

    return tasks.filter((task) => {
      const effectiveBucket = getEffectiveBucket(task, mapping, overrides);

      if (selectedBoardStatuses.length > 0 && !selectedBoardStatuses.includes(task.board_status)) return false;
      if (selectedBuckets.length > 0 && !selectedBuckets.includes(effectiveBucket)) return false;
      if (selectedSystemStatuses.length > 0 && !selectedSystemStatuses.includes(task.system_status)) return false;

      if (selectedAssignees.length > 0) {
        const names = task.assignee_names.length > 0 ? task.assignee_names : ['Unassigned'];
        const matches =
          assigneeMatch === 'all'
            ? selectedAssignees.every((name) => names.includes(name))
            : selectedAssignees.some((name) => names.includes(name));
        if (!matches) return false;
      }

      if (dueStatus === 'has' && !parseDate(task.due_date)) return false;
      if (dueStatus === 'none' && parseDate(task.due_date)) return false;
      if (dueStatus === 'overdue' && !isOverdueFor(task)) return false;

      if (rangeStart !== null || rangeEndInclusive !== null) {
        const value = parseDate(getDateValue(task, dateField));
        if (!value) return false;
        const time = value.getTime();
        if (rangeStart !== null && time < rangeStart) return false;
        if (rangeEndInclusive !== null && time > rangeEndInclusive) return false;
      }

      if (minEstimate !== null && !Number.isNaN(minEstimate) && task.estimate_hours < minEstimate) return false;
      if (maxEstimate !== null && !Number.isNaN(maxEstimate) && task.estimate_hours > maxEstimate) return false;

      if (hasDescription && task.description.trim() === '') return false;

      if (query) {
        const haystack = [
          task.subject,
          task.description,
          String(task.id),
          task.board_status,
          BUCKET_META[effectiveBucket].label,
          task.system_status,
          ...task.assignee_names,
          ...task.label_names,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [
    tasks,
    searchTerm,
    selectedBoardStatuses,
    selectedBuckets,
    selectedAssignees,
    assigneeMatch,
    selectedSystemStatuses,
    dueStatus,
    dateField,
    startDate,
    endDate,
    estimateMin,
    estimateMax,
    hasDescription,
    mapping,
    overrides,
  ]);

  // --- Sorting ---
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    const direction = sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'id':
          return (a.id - b.id) * direction;
        case 'subject':
          return a.subject.localeCompare(b.subject) * direction;
        case 'board_status':
          return (a.list_position - b.list_position || a.board_status.localeCompare(b.board_status)) * direction;
        case 'estimate_hours':
          return (a.estimate_hours - b.estimate_hours) * direction;
        case 'created_at':
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction;
        case 'due_date': {
          const aDue = parseDate(a.due_date)?.getTime() ?? null;
          const bDue = parseDate(b.due_date)?.getTime() ?? null;
          if (aDue === null && bDue === null) return 0;
          if (aDue === null) return 1;
          if (bDue === null) return -1;
          return (aDue - bDue) * direction;
        }
        default:
          return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * direction;
      }
    });

    return sorted;
  }, [filteredTasks, sortKey, sortDir]);

  // --- Pagination ---
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sortedTasks.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = pageSize === 0 ? 0 : safePage * pageSize;
  const pageEnd = pageSize === 0 ? sortedTasks.length : Math.min(pageStart + pageSize, sortedTasks.length);
  const visibleTasks = sortedTasks.slice(pageStart, pageEnd);

  useEffect(() => {
    setPage(0);
  }, [
    searchTerm,
    selectedBoardStatuses,
    selectedBuckets,
    selectedAssignees,
    assigneeMatch,
    selectedSystemStatuses,
    dueStatus,
    dateField,
    startDate,
    endDate,
    estimateMin,
    estimateMax,
    hasDescription,
    sortKey,
    sortDir,
    pageSize,
  ]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'subject' ? 'asc' : 'desc');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedBoardStatuses([]);
    setSelectedBuckets([]);
    setSelectedAssignees([]);
    setAssigneeMatch('any');
    setSelectedSystemStatuses([]);
    setDueStatus('all');
    setDateField('due');
    setStartDate('');
    setEndDate('');
    setEstimateMin('');
    setEstimateMax('');
    setHasDescription(false);
  };

  const activeFilterCount = [
    searchTerm.trim() !== '',
    selectedBoardStatuses.length > 0,
    selectedBuckets.length > 0,
    selectedAssignees.length > 0,
    selectedSystemStatuses.length > 0,
    dueStatus !== 'all',
    startDate !== '' || endDate !== '',
    estimateMin !== '' || estimateMax !== '',
    hasDescription,
  ].filter(Boolean).length;

  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const allTasksRows = useMemo(() => buildExportRows(tasks, mapping, overrides), [tasks, mapping, overrides]);
  const filteredRows = useMemo(() => buildExportRows(sortedTasks, mapping, overrides), [sortedTasks, mapping, overrides]);

  const handleOpenExportDialog = () => {
    setExportDialogOpen(true);
  };

  const renderSortHeader = (label: string, key: SortKey, width?: string) => (
    <th key={key} onClick={() => handleSort(key)} style={{ ...thStyle, width, cursor: 'pointer' }}>
      {label}
      {sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const noResults = sortedTasks.length === 0;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '0.85rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>Task Explorer</h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            {tasks.length} tasks · {sortedTasks.length} matching · status overrides feed the dashboard
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenExportDialog}
            disabled={noResults}
            style={{
              ...exportButtonStyle,
              backgroundColor: '#0f766e',
              cursor: noResults ? 'not-allowed' : 'pointer',
              opacity: noResults ? 0.5 : 1,
            }}
          >
            <Download size={15} /> Export ({sortedTasks.length})
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          backgroundColor: '#fff',
          padding: '1rem 1.1rem',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
            gap: '0.75rem',
            alignItems: 'end',
          }}
        >
          <Field label="SEARCH">
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
              />
              <input
                type="text"
                placeholder="Title, ID, assignee, label…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                style={{ ...inputStyle, paddingLeft: '1.9rem' }}
              />
            </div>
          </Field>

          <Field label="BOARD STATUS">
            <MultiSelect
              label="All board lists"
              options={boardOptions}
              selected={selectedBoardStatuses}
              onChange={setSelectedBoardStatuses}
            />
          </Field>

          <Field label="EFFECTIVE STATUS">
            <MultiSelect
              label="All statuses"
              options={bucketOptions}
              selected={selectedBuckets}
              onChange={setSelectedBuckets}
            />
          </Field>

          <Field label="ASSIGNEE">
            <MultiSelect
              label="All assignees"
              options={assigneeOptions}
              selected={selectedAssignees}
              onChange={setSelectedAssignees}
            />
          </Field>

          <Field label="ASSIGNEE MATCH">
            <select
              value={assigneeMatch}
              onChange={(event) => setAssigneeMatch(event.target.value as AssigneeMatch)}
              style={selectStyle}
            >
              <option value="any">Any selected</option>
              <option value="all">All selected</option>
            </select>
          </Field>

          <Field label="SYSTEM STATUS">
            <MultiSelect
              label="All statuses"
              options={systemStatusOptions}
              selected={selectedSystemStatuses}
              onChange={setSelectedSystemStatuses}
            />
          </Field>

          <Field label="DUE STATUS">
            <select
              value={dueStatus}
              onChange={(event) => setDueStatus(event.target.value as DueStatus)}
              style={selectStyle}
            >
              <option value="all">Any</option>
              <option value="has">Has due date</option>
              <option value="none">No due date</option>
              <option value="overdue">Overdue only</option>
            </select>
          </Field>

          <Field label="DATE FIELD">
            <select
              value={dateField}
              onChange={(event) => setDateField(event.target.value as DateField)}
              style={selectStyle}
            >
              <option value="due">Due date</option>
              <option value="start">Start date</option>
              <option value="created">Created date</option>
              <option value="updated">Updated date</option>
              <option value="done">Done date</option>
            </select>
          </Field>

          <Field label="FROM DATE">
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={inputStyle} />
          </Field>

          <Field label="TO DATE">
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={inputStyle} />
          </Field>

          <Field label="MIN ESTIMATE (H)">
            <input
              type="number"
              min={0}
              step="0.5"
              placeholder="0"
              value={estimateMin}
              onChange={(event) => setEstimateMin(event.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="MAX ESTIMATE (H)">
            <input
              type="number"
              min={0}
              step="0.5"
              placeholder="∞"
              value={estimateMax}
              onChange={(event) => setEstimateMax(event.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="OPTIONS">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.84rem',
                color: '#334155',
                cursor: 'pointer',
                padding: '0.48rem 0',
              }}
            >
              <input
                type="checkbox"
                checked={hasDescription}
                onChange={(event) => setHasDescription(event.target.checked)}
              />
              Has description
            </label>
          </Field>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
            borderTop: '1px solid #f1f5f9',
            marginTop: '0.85rem',
            paddingTop: '0.7rem',
          }}
        >
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            <strong>{sortedTasks.length}</strong> matching of <strong>{tasks.length}</strong> tasks
            {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active` : ''}
          </span>

          <button
            onClick={resetFilters}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.7rem',
              fontSize: '0.8rem',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#475569',
            }}
          >
            <X size={14} /> Reset Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ maxHeight: '68vh', overflow: 'auto' }}>
          <table
            style={{
              width: '100%',
              minWidth: 2150,
              borderCollapse: 'separate',
              borderSpacing: 0,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr>
                {renderSortHeader('ID', 'id', '80px')}
                {renderSortHeader('Task Title', 'subject', '320px')}
                {renderSortHeader('Board Status', 'board_status', '150px')}
                <th style={{ ...thStyle, width: '170px' }}>Status</th>
                <th style={{ ...thStyle, width: '100px' }}>System</th>
                <th style={{ ...thStyle, width: '190px' }}>Assignees</th>
                {renderSortHeader('Estimate', 'estimate_hours', '90px')}
                {renderSortHeader('Due Date', 'due_date', '120px')}
                <th style={{ ...thStyle, width: '110px' }}>Start</th>
                {renderSortHeader('Created', 'created_at', '110px')}
                {renderSortHeader('Updated', 'updated_at', '110px')}
                <th style={{ ...thStyle, width: '110px' }}>Done At</th>
                <th style={{ ...thStyle, width: '320px' }}>Description</th>
                <th style={{ ...thStyle, width: '200px' }}>Labels</th>
              </tr>
            </thead>

            <tbody>
              {visibleTasks.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                    No tasks match the active filters.
                  </td>
                </tr>
              ) : (
                visibleTasks.map((task) => {
                  const listBucket = getListBucket(task, mapping);
                  const effectiveBucket = overrides[String(task.id)] ?? listBucket;
                  const overdue = effectiveBucket !== 'done' && isTaskOverdue(task.due_date, task.done);

                  return (
                    <tr key={task.id}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#64748b' }}>#{task.id}</td>

                      <td style={{ ...tdStyle, fontWeight: 500, color: '#1e293b' }}>{task.subject}</td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 10,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            backgroundColor: '#e0e7ff',
                            color: '#3730a3',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {task.board_status}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <StatusBadge bucket={effectiveBucket} />
                          <select
                            value={overrides[String(task.id)] ?? ''}
                            onChange={(event) =>
                              onOverride(task.id, event.target.value === '' ? null : (event.target.value as Bucket))
                            }
                            title="Override the list-based status for this task"
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.2rem',
                              borderRadius: 4,
                              border: '1px solid #e2e8f0',
                              backgroundColor: '#fff',
                              color: '#475569',
                              maxWidth: 118,
                            }}
                          >
                            <option value="">Auto · {BUCKET_META[listBucket].label}</option>
                            {BUCKET_ORDER.map((bucket) => (
                              <option key={bucket} value={bucket}>
                                {BUCKET_META[bucket].label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 10,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            backgroundColor: task.done ? '#dcfce7' : '#f1f5f9',
                            color: task.done ? '#15803d' : '#64748b',
                          }}
                        >
                          {task.system_status}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        {task.assignee_names.length === 0 ? (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unassigned</span>
                        ) : (
                          task.assignee_names.map((name) => (
                            <span
                              key={name}
                              style={{
                                display: 'inline-block',
                                marginRight: 4,
                                marginBottom: 2,
                                padding: '0.12rem 0.45rem',
                                borderRadius: 10,
                                fontSize: '0.72rem',
                                fontWeight: 500,
                                backgroundColor: '#ecfdf5',
                                color: '#047857',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {name}
                            </span>
                          ))
                        )}
                      </td>

                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {task.estimate_hours > 0 ? `${task.estimate_hours}h` : '—'}
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          color: overdue ? '#dc2626' : '#334155',
                          fontWeight: overdue ? 600 : 400,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatDate(task.due_date)}
                        {overdue ? ' · overdue' : ''}
                      </td>

                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(task.start_on)}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(task.created_at)}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(task.updated_at)}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(task.done_at)}</td>

                      <td style={tdStyle}>
                        {task.description ? (
                          <span title={task.description} style={{ color: '#475569' }}>
                            {preview(task.description)}
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>

                      <td style={tdStyle}>
                        {task.label_names.length === 0 ? (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        ) : (
                          task.label_names.map((name) => (
                            <span
                              key={name}
                              style={{
                                display: 'inline-block',
                                marginRight: 4,
                                marginBottom: 2,
                                padding: '0.12rem 0.45rem',
                                borderRadius: 10,
                                fontSize: '0.7rem',
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {name}
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
            padding: '0.7rem 1rem',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#fcfdff',
          }}
        >
          <span style={{ fontSize: '0.84rem', color: '#64748b' }}>
            Showing <strong>{sortedTasks.length === 0 ? 0 : pageStart + 1}–{pageEnd}</strong> of{' '}
            <strong>{sortedTasks.length}</strong>
            {sortedTasks.length !== tasks.length ? ` (filtered from ${tasks.length})` : ''}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', color: '#64748b' }}>
              Rows per page
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                style={{
                  padding: '0.3rem 0.4rem',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  backgroundColor: '#fff',
                }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={0}>All</option>
              </select>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                style={{
                  ...pagerButtonStyle,
                  opacity: safePage === 0 ? 0.4 : 1,
                  cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                }}
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>

              <span style={{ fontSize: '0.84rem', color: '#475569', whiteSpace: 'nowrap' }}>
                Page {safePage + 1} / {totalPages}
              </span>

              <button
                onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                disabled={safePage >= totalPages - 1}
                style={{
                  ...pagerButtonStyle,
                  opacity: safePage >= totalPages - 1 ? 0.4 : 1,
                  cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                }}
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        title="Export tasks"
        description="Choose titles only or all fields, and export the matching rows or all tasks."
        rows={filteredRows}
        allRows={allTasksRows}
        filteredLabel="Filtered rows"
        allLabel="All tasks"
        baseName={`marketplace-tasks_${fileTimestamp()}`}
        defaultPreset="everything"
      />
    </div>
  );
}
