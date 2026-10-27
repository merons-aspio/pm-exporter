import type { CSSProperties, ReactNode } from 'react';
import { BUCKET_META } from '../lib/status';
import type { Bucket } from '../lib/status';
import type { BoardSource } from '../lib/snapshots';

export interface Option {
  value: string;
  label: string;
  count: number;
}

export const cardStyle: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: 8,
  border: '1px solid #eef2f7',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  padding: '1rem 1.1rem',
};

export const thStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  padding: '0.65rem 0.85rem',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  backgroundColor: '#f1f5f9',
  borderBottom: '1px solid #e2e8f0',
  fontSize: '0.72rem',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: '#475569',
  userSelect: 'none',
};

export const tdStyle: CSSProperties = {
  padding: '0.6rem 0.85rem',
  verticalAlign: 'top',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '0.84rem',
  color: '#334155',
};

export const selectStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.55rem',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.84rem',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.48rem 0.55rem',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.84rem',
  boxSizing: 'border-box',
};

const summaryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.5rem 0.55rem',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.84rem',
  backgroundColor: '#fff',
  color: '#334155',
  cursor: 'pointer',
};

const panelStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 30,
  marginTop: 4,
  minWidth: 240,
  maxHeight: 300,
  overflowY: 'auto',
  padding: '0.5rem',
  background: '#fff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
};

export const pagerButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#fff',
  cursor: 'pointer',
  color: '#475569',
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '0.68rem',
          fontWeight: 700,
          color: '#64748b',
          marginBottom: '0.3rem',
          letterSpacing: '0.03em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <details style={{ position: 'relative' }}>
      <summary style={summaryStyle}>
        <span>{selected.length > 0 ? `${label} (${selected.length})` : label}</span>
        <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>▾</span>
      </summary>
      <div style={panelStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.25rem',
          }}
        >
          <span
            style={{
              fontSize: '0.66rem',
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {label}
          </span>
          <button
            type="button"
            onClick={() => onChange([])}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              cursor: 'pointer',
              fontSize: '0.72rem',
              padding: 0,
            }}
          >
            Clear
          </button>
        </div>

        {options.length === 0 && <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>No values</div>}

        {options.map((option) => (
          <label
            key={option.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.22rem 0',
              fontSize: '0.82rem',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() =>
                onChange(
                  selected.includes(option.value)
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value]
                )
              }
            />
            <span style={{ flex: 1 }}>{option.label}</span>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{option.count}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export function StatusBadge({ bucket }: { bucket: Bucket }) {
  const meta = BUCKET_META[bucket];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.5rem',
        borderRadius: 10,
        fontSize: '0.72rem',
        fontWeight: 600,
        backgroundColor: meta.bg,
        color: meta.color,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

export function SourceBadge({ source }: { source: BoardSource }) {
  const meta =
    source === 'live'
      ? { label: 'Live', bg: '#dcfce7', color: '#15803d' }
      : source === 'snapshot'
        ? { label: 'Snapshot', bg: '#e0f2fe', color: '#0369a1' }
        : { label: '≈ Approximate', bg: '#fef3c7', color: '#b45309' };

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.12rem 0.45rem',
        borderRadius: 10,
        fontSize: '0.68rem',
        fontWeight: 600,
        backgroundColor: meta.bg,
        color: meta.color,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

export function Bar({
  value,
  max,
  color,
  height = 6,
}: {
  value: number;
  max: number;
  color: string;
  height?: number;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ height, backgroundColor: '#f1f5f9', borderRadius: height, overflow: 'hidden' }}>
      <div style={{ width: `${percent}%`, height: '100%', backgroundColor: color }} />
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section style={{ ...cardStyle, ...style }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a' }}>{title}</h2>
          {subtitle && (
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
