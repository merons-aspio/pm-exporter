import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { X } from 'lucide-react';
import type { EnrichedTaskData } from '../../services/hubstaff';
import type { StatusMapping, StatusOverrides } from '../../lib/status';
import { BUCKET_META, getEffectiveBucket } from '../../lib/status';
import type { ArchiveDeepFile, ArchiveMember } from '../../lib/archive';
import { formatDuration } from '../../lib/archive';
import { formatDate, formatDateTime } from '../../lib/dates';

interface ArchiveTaskModalProps {
  task: EnrichedTaskData;
  deep: ArchiveDeepFile | null;
  deepLoading: boolean;
  deepError: string | null;
  members: ArchiveMember[];
  mapping: StatusMapping;
  overrides: StatusOverrides;
  onClose: () => void;
}

const sectionStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '0.85rem 0.95rem',
  backgroundColor: '#fff',
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 0.6rem',
  fontSize: '0.78rem',
  fontWeight: 800,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const labelStyle: CSSProperties = {
  fontSize: '0.68rem',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: 2,
};

const valueStyle: CSSProperties = {
  fontSize: '0.84rem',
  color: '#0f172a',
  wordBreak: 'break-word',
};

function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const colors =
    tone === 'danger'
      ? { backgroundColor: '#fee2e2', color: '#b91c1c' }
      : tone === 'success'
        ? { backgroundColor: '#dcfce7', color: '#15803d' }
        : { backgroundColor: '#f1f5f9', color: '#475569' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.16rem 0.5rem',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 600,
        ...colors,
      }}
    >
      {children}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

export default function ArchiveTaskModal({
  task,
  deep,
  deepLoading,
  deepError,
  members,
  mapping,
  overrides,
  onClose,
}: ArchiveTaskModalProps) {
  const memberNames = new Map(members.map((member) => [Number(member.id), member.name || member.email || `User #${member.id}`]));
  const effectiveBucket = getEffectiveBucket(task, mapping, overrides);
  const comments = deep?.comments[String(task.id)] || [];
  const checklists = deep?.checklists[String(task.id)] || [];
  const attachments = deep?.attachments[String(task.id)] || [];
  const timeEntries = deep?.timeEntries[String(task.id)] || [];
  const totalSeconds = timeEntries.reduce((total, entry) => total + (Number(entry.seconds) || 0), 0);
  const taskDeepCaptured = Boolean(deep?.taskIds?.includes(task.id));
  const deepErrorForTask = deep?.errors[String(task.id)];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(1000px, 100%)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#f8fafc',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(15, 23, 42, 0.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1rem 1.15rem',
            backgroundColor: '#fff',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              <Chip>#{task.id}</Chip>
              {task.project_name && <Chip>{task.project_name}</Chip>}
              <Chip>{task.board_status}</Chip>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.16rem 0.5rem',
                  borderRadius: 999,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backgroundColor: BUCKET_META[effectiveBucket].bg,
                  color: BUCKET_META[effectiveBucket].color,
                }}
              >
                {BUCKET_META[effectiveBucket].label}
              </span>
              {task.removed && <Chip tone="danger">Removed</Chip>}
              {task.done && <Chip tone="success">Done</Chip>}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', lineHeight: 1.35, color: '#0f172a' }}>{task.subject}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task details"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              flexShrink: 0,
              border: '1px solid #cbd5e1',
              borderRadius: 7,
              backgroundColor: '#fff',
              color: '#475569',
              cursor: 'pointer',
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1rem 1.15rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ ...sectionStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <Meta label="Project" value={task.project_name || '—'} />
            <Meta label="Folder" value={task.project_folder || '—'} />
            <Meta label="Board list" value={task.board_status} />
            <Meta label="System status" value={task.system_status} />
            <Meta label="Estimate" value={task.estimate_hours > 0 ? `${task.estimate_hours}h` : '—'} />
            <Meta label="Author" value={task.author_id ? memberNames.get(task.author_id) || `User #${task.author_id}` : '—'} />
            <Meta label="Created" value={formatDateTime(task.created_at)} />
            <Meta label="Updated" value={formatDateTime(task.updated_at)} />
            <Meta label="Start" value={formatDate(task.start_on)} />
            <Meta label="Due" value={formatDate(task.due_date)} />
            <Meta label="Done" value={formatDateTime(task.done_at)} />
            <Meta
              label="Removed"
              value={task.removed ? (task.removed_at ? formatDateTime(task.removed_at) : 'Yes') : 'No'}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Assignees</h3>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {task.assignee_names.length > 0 ? (
                  task.assignee_names.map((name) => <Chip key={name} tone="success">{name}</Chip>)
                ) : (
                  <span style={{ ...valueStyle, color: '#94a3b8' }}>Unassigned</span>
                )}
              </div>
              <h3 style={{ ...sectionTitleStyle, marginTop: '0.85rem' }}>Followers</h3>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {task.follower_ids.length > 0 ? (
                  task.follower_ids.map((id) => <Chip key={id}>{memberNames.get(id) || `User #${id}`}</Chip>)
                ) : (
                  <span style={{ ...valueStyle, color: '#94a3b8' }}>None</span>
                )}
              </div>
            </div>

            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Labels</h3>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {task.label_names.length > 0 ? (
                  task.label_names.map((name) => <Chip key={name}>{name}</Chip>)
                ) : (
                  <span style={{ ...valueStyle, color: '#94a3b8' }}>No labels</span>
                )}
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Description</h3>
            {task.description ? (
              <div style={{ ...valueStyle, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{task.description}</div>
            ) : (
              <span style={{ ...valueStyle, color: '#94a3b8' }}>No description.</span>
            )}
          </div>

          {deepLoading ? (
            <div style={{ ...sectionStyle, color: '#64748b', fontSize: '0.85rem' }}>
              Loading comments, checklists, attachments and time entries…
            </div>
          ) : deepError ? (
            <div style={{ ...sectionStyle, color: '#b91c1c', fontSize: '0.85rem' }}>
              Could not load deep data: {deepError}
            </div>
          ) : !deep ? (
            <div style={{ ...sectionStyle, color: '#64748b', fontSize: '0.85rem' }}>
              Deep data has not been captured for this project yet. Core task fields are complete; run the deep
              archive export to add comments, checklists, attachments and time entries.
            </div>
          ) : !taskDeepCaptured ? (
            <div style={{ ...sectionStyle, color: '#64748b', fontSize: '0.85rem' }}>
              Deep data for this task has not been captured yet.
            </div>
          ) : (
            <>
              {deepErrorForTask && (
                <div style={{ ...sectionStyle, color: '#b45309', fontSize: '0.8rem' }}>
                  Some deep fields could not be captured: {deepErrorForTask}
                </div>
              )}

              <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}>Comments ({comments.length})</h3>
                {comments.length === 0 ? (
                  <span style={{ ...valueStyle, color: '#94a3b8' }}>No comments.</span>
                ) : (
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: '0.55rem 0.65rem',
                          backgroundColor: '#f8fafc',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                          <strong style={{ fontSize: '0.8rem', color: '#334155' }}>
                            {memberNames.get(Number(comment.user_id)) || `User #${comment.user_id}`}
                          </strong>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{formatDateTime(comment.created_at)}</span>
                        </div>
                        <div style={{ fontSize: '0.84rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {comment.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}>
                  Checklists ({checklists.length}) · {checklists.reduce((total, list) => total + (list.items?.length || 0), 0)} items
                </h3>
                {checklists.length === 0 ? (
                  <span style={{ ...valueStyle, color: '#94a3b8' }}>No checklists.</span>
                ) : (
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {checklists.map((checklist) => (
                      <div key={checklist.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.55rem 0.65rem' }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                          {checklist.name}
                        </div>
                        {(checklist.items || []).length === 0 ? (
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No items.</span>
                        ) : (
                          <div style={{ display: 'grid', gap: '0.2rem' }}>
                            {(checklist.items || []).map((item) => {
                              const label = item.name || item.title || item.content || `Item #${item.id}`;
                              const done = Boolean(item.done ?? item.completed);
                              return (
                                <div key={item.id} style={{ display: 'flex', gap: '0.4rem', fontSize: '0.82rem', color: done ? '#64748b' : '#334155' }}>
                                  <span aria-hidden style={{ color: done ? '#059669' : '#94a3b8' }}>{done ? '✓' : '○'}</span>
                                  <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{label}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}>Attachments ({attachments.length})</h3>
                {attachments.length === 0 ? (
                  <span style={{ ...valueStyle, color: '#94a3b8' }}>No attachments.</span>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#64748b', padding: '0.25rem 0.35rem' }}>File</th>
                        <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#64748b', padding: '0.25rem 0.35rem' }}>Uploaded by</th>
                        <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#64748b', padding: '0.25rem 0.35rem' }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachments.map((attachment) => (
                        <tr key={attachment.id}>
                          <td style={{ fontSize: '0.82rem', color: '#334155', padding: '0.3rem 0.35rem', borderTop: '1px solid #f1f5f9' }}>
                            {attachment.file_name}
                          </td>
                          <td style={{ fontSize: '0.82rem', color: '#475569', padding: '0.3rem 0.35rem', borderTop: '1px solid #f1f5f9' }}>
                            {memberNames.get(Number(attachment.user_id)) || `User #${attachment.user_id}`}
                          </td>
                          <td style={{ fontSize: '0.82rem', color: '#475569', padding: '0.3rem 0.35rem', borderTop: '1px solid #f1f5f9' }}>
                            {formatDateTime(attachment.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                  The Hubstaff API exposes attachment metadata only; file contents are not included in this archive.
                </p>
              </div>

              <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}>Time entries ({timeEntries.length}) · {formatDuration(totalSeconds)}</h3>
                {timeEntries.length === 0 ? (
                  <span style={{ ...valueStyle, color: '#94a3b8' }}>No time entries.</span>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#64748b', padding: '0.25rem 0.35rem' }}>Member</th>
                        <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#64748b', padding: '0.25rem 0.35rem' }}>Started</th>
                        <th style={{ textAlign: 'right', fontSize: '0.7rem', color: '#64748b', padding: '0.25rem 0.35rem' }}>Duration</th>
                        <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#64748b', padding: '0.25rem 0.35rem' }}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td style={{ fontSize: '0.82rem', color: '#334155', padding: '0.3rem 0.35rem', borderTop: '1px solid #f1f5f9' }}>
                            {memberNames.get(Number(entry.user_id)) || `User #${entry.user_id}`}
                          </td>
                          <td style={{ fontSize: '0.82rem', color: '#475569', padding: '0.3rem 0.35rem', borderTop: '1px solid #f1f5f9' }}>
                            {formatDateTime(entry.started_at)}
                          </td>
                          <td style={{ fontSize: '0.82rem', color: '#475569', padding: '0.3rem 0.35rem', borderTop: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {formatDuration(Number(entry.seconds) || 0)}
                          </td>
                          <td style={{ fontSize: '0.82rem', color: '#475569', padding: '0.3rem 0.35rem', borderTop: '1px solid #f1f5f9' }}>
                            {entry.comments || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
