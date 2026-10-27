import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Check, Clipboard, Download, Info, RefreshCw } from 'lucide-react';
import type { EnrichedTaskData } from '../services/hubstaff';
import { formatDate, formatDateTime } from '../lib/dates';
import { DEFAULT_DONE_LISTS, buildStandupSummary, getMovedBreakdown } from '../lib/standup';
import type { StandupItem, StandupResult } from '../lib/standup';
import { SectionCard } from './ui';

interface StandupSectionProps {
  standup: StandupResult;
  selectedPerson: string;
  onSelectPerson: (name: string) => void;
  doneLists: string[];
  onDoneListsChange: (lists: string[]) => void;
  listOptions: Array<{ name: string; count: number }>;
  onDrilldown: (title: string, tasks: EnrichedTaskData[]) => void;
  onExport: () => void;
  lastSyncedAt: string | null;
  onSync: () => void;
  syncing: boolean;
}

const miniTh: CSSProperties = {
  padding: '0.4rem 0.45rem',
  textAlign: 'left',
  borderBottom: '1px solid #e2e8f0',
  fontSize: '0.67rem',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: '#64748b',
  whiteSpace: 'nowrap',
  backgroundColor: '#f8fafc',
};

const miniTd: CSSProperties = {
  padding: '0.4rem 0.45rem',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '0.78rem',
  color: '#334155',
  whiteSpace: 'nowrap',
};

const miniTdNum: CSSProperties = {
  ...miniTd,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const controlButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.4rem 0.6rem',
  borderRadius: 5,
  border: '1px solid #cbd5e1',
  backgroundColor: '#fff',
  color: '#475569',
  fontSize: '0.76rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const summaryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.4rem',
  padding: '0.4rem 0.55rem',
  borderRadius: 5,
  border: '1px solid #cbd5e1',
  fontSize: '0.76rem',
  backgroundColor: '#fff',
  color: '#334155',
  cursor: 'pointer',
  listStyle: 'none',
};

const panelStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 40,
  marginTop: 4,
  minWidth: 270,
  maxHeight: 320,
  overflowY: 'auto',
  padding: '0.55rem',
  background: '#fff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
};

function Pill({ children, bg, color }: { children: ReactNode; bg: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.4rem',
        borderRadius: 10,
        backgroundColor: bg,
        color,
        fontSize: '0.66rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function StandupCard({
  label,
  value,
  sub,
  color,
  bg,
  onClick,
  disabled,
}: {
  label: string;
  value: number;
  sub: string;
  color: string;
  bg: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        textAlign: 'left',
        padding: '0.65rem 0.75rem',
        borderRadius: 7,
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${color}`,
        backgroundColor: bg,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.72 : 1,
        minWidth: 0,
      }}
      title={disabled ? 'Nothing to show' : 'Click to view the matching tasks'}
    >
      <div style={{ fontSize: '0.66rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.1rem', lineHeight: 1.35 }}>{sub}</div>
    </button>
  );
}

function StandupRow({ item, mode }: { item: StandupItem; mode: 'moved' | 'overdue' | 'todo' | 'blocked' | 'unverified' }) {
  const due = item.dueDate ? formatDate(item.dueDate) : '';
  const late = item.daysOverdue;

  let pill: ReactNode = null;
  if (mode === 'moved') {
    pill = <Pill bg="#cffafe" color="#0e7490">→ {item.movedTo}</Pill>;
  } else if (mode === 'unverified') {
    pill = <Pill bg="#fef3c7" color="#b45309">unverified</Pill>;
  } else if (mode === 'todo') {
    pill = late > 0 ? <Pill bg="#fee2e2" color="#b91c1c">{late}d late</Pill> : <Pill bg="#fef3c7" color="#b45309">due today</Pill>;
  } else if (mode === 'overdue') {
    pill = <Pill bg="#fee2e2" color="#b91c1c">{late}d late</Pill>;
  } else if (mode === 'blocked') {
    pill = <Pill bg="#fee2e2" color="#b91c1c">blocked</Pill>;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.28rem 0',
        borderBottom: '1px solid #f8fafc',
        minWidth: 0,
      }}
    >
      <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', color: '#94a3b8', flexShrink: 0 }}>
        #{item.task.id}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: '0.77rem',
          color: '#334155',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={item.task.subject}
      >
        {item.task.subject}
      </span>
      {pill}
      {due && <span style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0 }}>{due}</span>}
    </div>
  );
}

function StandupList({
  title,
  items,
  mode,
  empty,
  onViewAll,
}: {
  title: string;
  items: StandupItem[];
  mode: 'moved' | 'overdue' | 'todo' | 'blocked' | 'unverified';
  empty: string;
  onViewAll: () => void;
}) {
  return (
    <div
      style={{
        border: '1px solid #eef2f7',
        borderRadius: 7,
        padding: '0.55rem 0.65rem',
        backgroundColor: '#fff',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{title}</span>
        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{items.length}</span>
        {items.length > 0 && (
          <button
            onClick={onViewAll}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'none',
              color: '#2563eb',
              fontSize: '0.7rem',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            View all
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.25rem 0' }}>{empty}</div>
      ) : (
        <div>
          {items.slice(0, 5).map((item) => (
            <StandupRow key={`${mode}-${item.task.id}`} item={item} mode={mode} />
          ))}
          {items.length > 5 && (
            <button
              onClick={onViewAll}
              style={{
                marginTop: '0.3rem',
                border: 'none',
                background: 'none',
                color: '#2563eb',
                fontSize: '0.72rem',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              View all {items.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function StandupSection({
  standup,
  selectedPerson,
  onSelectPerson,
  doneLists,
  onDoneListsChange,
  listOptions,
  onDrilldown,
  onExport,
  lastSyncedAt,
  onSync,
  syncing,
}: StandupSectionProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const person = useMemo(() => {
    if (selectedPerson === 'all') return standup.all;
    return standup.people.find((row) => row.name === selectedPerson) ?? standup.all;
  }, [standup, selectedPerson]);

  const breakdown = getMovedBreakdown(person.movedByList);
  const dueTodayInProgress = person.wip.filter((item) => item.dueToday).length;

  const doneListOptions = useMemo(() => {
    const map = new Map(listOptions.map((option) => [option.name, option.count]));
    doneLists.forEach((name) => {
      if (!map.has(name)) map.set(name, 0);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [listOptions, doneLists]);

  const drill = (title: string, items: StandupItem[]) => {
    const tasks = Array.from(new Map(items.map((item) => [item.task.id, item.task])).values());
    onDrilldown(title, tasks);
  };

  const handleCopy = async () => {
    const ok = await copyText(buildStandupSummary(standup, selectedPerson));
    setCopyStatus(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopyStatus('idle'), 1800);
  };

  const movedSub =
    person.moved.length > 0
      ? `Pushed ${breakdown.pushed} · Testing ${breakdown.testing} · Done ${breakdown.done}${
          breakdown.other > 0 ? ` · Other ${breakdown.other}` : ''
        }`
      : 'No tracked moves yet';

  const teamBreakdown = getMovedBreakdown(standup.all.movedByList);

  return (
    <SectionCard
      title="Daily Standup"
      subtitle={`${standup.date} · moves tracked from syncs · overdue / To Do as of today`}
      action={
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleCopy}
            style={{
              ...controlButtonStyle,
              color: copyStatus === 'copied' ? '#047857' : copyStatus === 'failed' ? '#b91c1c' : '#475569',
              borderColor: copyStatus === 'copied' ? '#a7f3d0' : copyStatus === 'failed' ? '#fecaca' : '#cbd5e1',
            }}
          >
            {copyStatus === 'copied' ? <Check size={14} /> : <Clipboard size={14} />}
            {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy summary'}
          </button>
          <button onClick={onExport} style={controlButtonStyle}>
            <Download size={14} /> Export
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
        <select
          value={selectedPerson}
          onChange={(event) => onSelectPerson(event.target.value)}
          style={{
            padding: '0.4rem 0.5rem',
            borderRadius: 5,
            border: '1px solid #cbd5e1',
            fontSize: '0.78rem',
            backgroundColor: '#fff',
            color: '#334155',
            maxWidth: 220,
          }}
        >
          <option value="all">All assignees</option>
          {standup.people.map((row) => (
            <option key={row.name} value={row.name}>
              {row.name}
            </option>
          ))}
        </select>

        <details style={{ position: 'relative' }}>
          <summary style={summaryStyle}>
            <span>Done lists ({doneLists.length})</span>
            <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>▾</span>
          </summary>
          <div style={panelStyle}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.35, marginBottom: '0.4rem' }}>
              A sync counts a task as moved when it enters one of these lists. Editing a task never counts.
            </div>
            {doneListOptions.map((option) => (
              <label
                key={option.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.2rem 0',
                  fontSize: '0.78rem',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={doneLists.includes(option.name)}
                  onChange={() =>
                    onDoneListsChange(
                      doneLists.includes(option.name)
                        ? doneLists.filter((name) => name !== option.name)
                        : [...doneLists, option.name]
                    )
                  }
                />
                <span style={{ flex: 1 }}>{option.name}</span>
                <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{option.count}</span>
              </label>
            ))}
            <button
              onClick={() => onDoneListsChange([...DEFAULT_DONE_LISTS])}
              style={{
                marginTop: '0.4rem',
                padding: '0.3rem 0.5rem',
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                backgroundColor: '#f8fafc',
                color: '#475569',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              Reset to defaults
            </button>
          </div>
        </details>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            {lastSyncedAt ? `Last sync ${formatDateTime(lastSyncedAt)}` : 'Not synced yet'}
          </span>
          <button onClick={onSync} disabled={syncing} style={{ ...controlButtonStyle, opacity: syncing ? 0.6 : 1 }}>
            <RefreshCw size={13} /> {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' }}>
        <StandupCard
          label="Moved forward"
          value={person.moved.length}
          sub={
            person.unverified.length > 0
              ? `${movedSub} · ${person.unverified.length} unverified update${person.unverified.length === 1 ? '' : 's'}`
              : movedSub
          }
          color="#059669"
          bg="#ecfdf5"
          onClick={() => drill(`Moved forward · ${standup.date}`, person.moved)}
          disabled={person.moved.length === 0}
        />
        <StandupCard
          label="Overdue — In Progress"
          value={person.overdue.length}
          sub={dueTodayInProgress > 0 ? `${dueTodayInProgress} in progress due today` : 'Due before today'}
          color="#dc2626"
          bg="#fef2f2"
          onClick={() => drill(`Overdue in progress · ${standup.date}`, person.overdue)}
          disabled={person.overdue.length === 0}
        />
        <StandupCard
          label="Due / Needs questioning"
          value={person.todo.length}
          sub="To Do, due today or earlier"
          color="#b45309"
          bg="#fffbeb"
          onClick={() => drill(`Needs questioning · ${standup.date}`, person.todo)}
          disabled={person.todo.length === 0}
        />
        <StandupCard
          label="Blocked"
          value={person.blocked.length}
          sub="Needs attention"
          color="#991b1b"
          bg="#fff1f2"
          onClick={() => drill(`Blocked · ${standup.date}`, person.blocked)}
          disabled={person.blocked.length === 0}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.4rem',
          marginTop: '0.55rem',
          fontSize: '0.71rem',
          color: '#64748b',
          lineHeight: 1.4,
        }}
      >
        <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          {standup.firstTrackedAt
            ? `Move history starts ${formatDateTime(standup.firstTrackedAt)}. Earlier list changes cannot be reconstructed reliably.`
            : 'Move history starts with the next sync. Only Completed tasks with a done_at timestamp can be backfilled.'}{' '}
          “Recent updates (unverified)” are tasks edited on this date; they are not counted as moved.
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '0.6rem',
          marginTop: '0.7rem',
        }}
      >
        <StandupList
          title="Needs questioning"
          items={person.todo}
          mode="todo"
          empty="No To Do tasks due today or earlier."
          onViewAll={() => drill(`Needs questioning · ${standup.date}`, person.todo)}
        />
        <StandupList
          title="Overdue — In Progress"
          items={person.overdue}
          mode="overdue"
          empty="Nothing overdue in progress."
          onViewAll={() => drill(`Overdue in progress · ${standup.date}`, person.overdue)}
        />
        <StandupList
          title="Moved forward"
          items={person.moved}
          mode="moved"
          empty="No tracked moves on this date."
          onViewAll={() => drill(`Moved forward · ${standup.date}`, person.moved)}
        />
        <StandupList
          title="Blocked"
          items={person.blocked}
          mode="blocked"
          empty="Nothing blocked."
          onViewAll={() => drill(`Blocked · ${standup.date}`, person.blocked)}
        />
        {person.unverified.length > 0 && (
          <StandupList
            title="Recent updates (unverified)"
            items={person.unverified}
            mode="unverified"
            empty=""
            onViewAll={() => drill(`Recent updates (unverified) · ${standup.date}`, person.unverified)}
          />
        )}
      </div>

      <div style={{ marginTop: '0.85rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={miniTh}>Assignee</th>
              <th style={miniTh}>Moved</th>
              <th style={miniTh}>Pushed</th>
              <th style={miniTh}>Testing</th>
              <th style={miniTh}>Done</th>
              <th style={miniTh}>Overdue</th>
              <th style={miniTh}>To Do due</th>
              <th style={miniTh}>Blocked</th>
              <th style={miniTh}>WIP</th>
              <th style={miniTh}>Unverified</th>
            </tr>
          </thead>
          <tbody>
            {standup.people.map((row) => {
              const rowBreakdown = getMovedBreakdown(row.movedByList);
              const active = selectedPerson === row.name;
              return (
                <tr
                  key={row.name}
                  onClick={() => onSelectPerson(row.name)}
                  style={{ cursor: 'pointer', backgroundColor: active ? '#f0fdfa' : undefined }}
                >
                  <td style={{ ...miniTd, fontWeight: active ? 700 : 500 }}>{row.name}</td>
                  <td style={miniTdNum}>{row.moved.length}</td>
                  <td style={miniTdNum}>{rowBreakdown.pushed}</td>
                  <td style={miniTdNum}>{rowBreakdown.testing}</td>
                  <td style={miniTdNum}>{rowBreakdown.done}</td>
                  <td style={{ ...miniTdNum, color: row.overdue.length > 0 ? '#b91c1c' : '#334155' }}>
                    {row.overdue.length}
                  </td>
                  <td style={{ ...miniTdNum, color: row.todo.length > 0 ? '#b45309' : '#334155' }}>{row.todo.length}</td>
                  <td style={{ ...miniTdNum, color: row.blocked.length > 0 ? '#b91c1c' : '#334155' }}>
                    {row.blocked.length}
                  </td>
                  <td style={miniTdNum}>{row.wip.length}</td>
                  <td style={{ ...miniTdNum, color: row.unverified.length > 0 ? '#b45309' : '#94a3b8' }}>
                    {row.unverified.length}
                  </td>
                </tr>
              );
            })}
            {standup.people.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...miniTd, color: '#94a3b8' }}>
                  No tasks.
                </td>
              </tr>
            )}
            <tr
              onClick={() => onSelectPerson('all')}
              style={{ cursor: 'pointer', backgroundColor: selectedPerson === 'all' ? '#f0fdfa' : '#f8fafc' }}
            >
              <td style={{ ...miniTd, fontWeight: 700 }}>All assignees</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{standup.all.moved.length}</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{teamBreakdown.pushed}</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{teamBreakdown.testing}</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{teamBreakdown.done}</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{standup.all.overdue.length}</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{standup.all.todo.length}</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{standup.all.blocked.length}</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{standup.all.wip.length}</td>
              <td style={{ ...miniTdNum, fontWeight: 700 }}>{standup.all.unverified.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ margin: '0.45rem 0 0', fontSize: '0.69rem', color: '#94a3b8' }}>
        Multi-assignee tasks count under each person in the rows; the All assignees row counts each task once. Overdue
        and To Do use the current board state.
      </p>
    </SectionCard>
  );
}
