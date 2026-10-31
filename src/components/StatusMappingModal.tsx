import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Settings2, X } from 'lucide-react';
import { BUCKET_META, BUCKET_ORDER } from '../lib/status';
import type { Bucket } from '../lib/status';
import { selectStyle } from './ui';

interface StatusMappingModalProps {
  open: boolean;
  onClose: () => void;
  listRows: Array<{ name: string; count: number; bucket: Bucket | null }>;
  onMappingChange: (list: string, bucket: Bucket) => void;
  onSetAsDefault: () => void;
  onResetToDefault: () => void;
  onResetToBuiltIn: () => void;
  hasSavedDefault: boolean;
}

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.45rem 0.7rem',
  borderRadius: 5,
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
};

export default function StatusMappingModal({
  open,
  onClose,
  listRows,
  onMappingChange,
  onSetAsDefault,
  onResetToDefault,
  onResetToBuiltIn,
  hasSavedDefault,
}: StatusMappingModalProps) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) {
      setSaved(false);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  if (!open) return null;

  const unmappedCount = listRows.filter((row) => row.bucket === null).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
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
          borderRadius: 9,
          width: 'min(760px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(15, 23, 42, 0.28)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.9rem 1rem',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Settings2 size={16} /> Status Mapping
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              Board lists → dashboard buckets. Only explicitly mapped lists count on the dashboard;
              unmapped lists are excluded. Changes apply immediately.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close status mapping"
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
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '0.9rem 1rem', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem' }}>
            {listRows.map((row) => {
              const unmapped = row.bucket === null;

              return (
                <div
                  key={row.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 0.5rem',
                    border: `1px solid ${unmapped ? '#fde68a' : '#f1f5f9'}`,
                    backgroundColor: unmapped ? '#fffbeb' : undefined,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        color: '#334155',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={row.name}
                    >
                      {row.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: unmapped ? '#b45309' : '#94a3b8' }}>
                      {row.count} tasks{unmapped ? ' · unmapped, excluded' : ''}
                    </div>
                  </div>
                  <select
                    value={row.bucket ?? ''}
                    onChange={(event) => onMappingChange(row.name, event.target.value as Bucket)}
                    style={{ ...selectStyle, width: 'auto', fontSize: '0.78rem', padding: '0.3rem 0.35rem' }}
                  >
                    {unmapped && (
                      <option value="" disabled>
                        Unmapped (excluded)
                      </option>
                    )}
                    {BUCKET_ORDER.map((bucket) => (
                      <option key={bucket} value={bucket}>
                        {BUCKET_META[bucket].label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {unmappedCount > 0 && (
            <p
              style={{
                margin: '0.75rem 0 0',
                padding: '0.45rem 0.6rem',
                borderRadius: 5,
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                fontSize: '0.75rem',
                color: '#b45309',
              }}
            >
              {unmappedCount} board list{unmappedCount === 1 ? '' : 's'} not mapped. Their tasks are
              excluded from the dashboard cards until you choose a bucket.
            </p>
          )}

          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
            Completed lists feed the detailed breakdown and standup, but only Icebox through
            Pushed/Live appear as the seven dashboard cards.
          </p>

          <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
            {hasSavedDefault
              ? 'A saved default exists. “Reset to saved default” restores it.'
              : 'No saved default yet — “Reset to saved default” uses the built-in defaults.'}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            padding: '0.8rem 1rem',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                onSetAsDefault();
                setSaved(true);
              }}
              style={{ ...buttonStyle, border: 'none', backgroundColor: '#0f766e', color: '#fff' }}
            >
              {saved ? 'Saved as default' : 'Set current as default'}
            </button>
            <button
              onClick={onResetToDefault}
              style={{
                ...buttonStyle,
                border: '1px solid #cbd5e1',
                backgroundColor: '#fff',
                color: '#475569',
              }}
            >
              Reset to saved default
            </button>
            <button
              onClick={onResetToBuiltIn}
              style={{
                ...buttonStyle,
                border: '1px solid #fecaca',
                backgroundColor: '#fff',
                color: '#b91c1c',
              }}
            >
              Reset to built-in
            </button>
          </div>

          <button
            onClick={onClose}
            style={{ ...buttonStyle, border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
