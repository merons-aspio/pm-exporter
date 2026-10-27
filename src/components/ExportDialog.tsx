import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Download, X } from 'lucide-react';
import { downloadCsv, downloadJson, downloadText } from '../lib/csv';

type ExportScope = 'filtered' | 'all';
type ExportFormat = 'csv' | 'json' | 'txt';
type ExportPreset = 'titles' | 'everything' | 'custom';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  rows: Record<string, unknown>[];
  allRows: Record<string, unknown>[];
  filteredLabel: string;
  allLabel: string;
  baseName: string;
  titleKey?: string;
  defaultPreset?: ExportPreset;
  allowAll?: boolean;
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.7rem',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '0.4rem',
};

const optionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.45rem',
  fontSize: '0.82rem',
  color: '#334155',
  cursor: 'pointer',
  padding: '0.25rem 0',
};

const sectionStyle: CSSProperties = {
  padding: '0.75rem',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  backgroundColor: '#f8fafc',
  marginBottom: '0.65rem',
};

export default function ExportDialog({
  open,
  onClose,
  title,
  description,
  rows,
  allRows,
  filteredLabel,
  allLabel,
  baseName,
  titleKey = 'Title',
  defaultPreset = 'everything',
  allowAll = true,
}: ExportDialogProps) {
  const [scope, setScope] = useState<ExportScope>('filtered');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [preset, setPreset] = useState<ExportPreset>(defaultPreset);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  const fields = useMemo(() => {
    const source = rows[0] ?? allRows[0];
    return source ? Object.keys(source) : [];
  }, [rows, allRows]);
  const fieldsKey = fields.join('|');
  const effectiveTitleKey = fields.includes(titleKey) ? titleKey : fields[0];

  useEffect(() => {
    if (!open) return;
    setScope('filtered');
    setFormat('csv');
    setPreset(defaultPreset);
    setSelectedFields(fields);
  }, [open, defaultPreset, fieldsKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selectedRows = allowAll && scope === 'all' ? allRows : rows;
  const activeFields =
    preset === 'titles'
      ? effectiveTitleKey
        ? [effectiveTitleKey]
        : []
      : preset === 'everything'
        ? fields
        : selectedFields;

  const exportRows = selectedRows.map((row) => {
    const output: Record<string, unknown> = {};
    activeFields.forEach((field) => {
      output[field] = row[field];
    });
    return output;
  });

  const canExport = selectedRows.length > 0 && activeFields.length > 0;

  const handleExport = () => {
    if (!canExport) return;

    if (format === 'csv') {
      downloadCsv(exportRows, `${baseName}.csv`);
    } else if (format === 'json') {
      if (preset === 'titles') {
        downloadJson(
          selectedRows.map((row) => row[effectiveTitleKey] ?? ''),
          `${baseName}.json`
        );
      } else {
        downloadJson(exportRows, `${baseName}.json`);
      }
    } else {
      const text =
        preset === 'titles'
          ? selectedRows.map((row) => String(row[effectiveTitleKey] ?? '')).join('\n')
          : exportRows
              .map((row) => activeFields.map((field) => `${field}: ${row[field] ?? ''}`).join('\n'))
              .join('\n\n---\n\n');
      downloadText(text, `${baseName}.txt`);
    }

    onClose();
  };

  const toggleField = (field: string) => {
    setSelectedFields((current) =>
      current.includes(field) ? current.filter((value) => value !== field) : [...current, field]
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
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
          width: 'min(680px, 100%)',
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
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{title}</h3>
            {description && <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close export dialog"
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
          {allowAll && (
            <div style={sectionStyle}>
              <span style={labelStyle}>Rows</span>
              <label style={optionStyle}>
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === 'filtered'}
                  onChange={() => setScope('filtered')}
                  disabled={rows.length === 0}
                />
                <span>
                  <strong>{filteredLabel}</strong> <span style={{ color: '#64748b' }}>({rows.length})</span>
                </span>
              </label>
              <label style={optionStyle}>
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                  disabled={allRows.length === 0}
                />
                <span>
                  <strong>{allLabel}</strong> <span style={{ color: '#64748b' }}>({allRows.length})</span>
                </span>
              </label>
            </div>
          )}

          <div style={sectionStyle}>
            <span style={labelStyle}>Format</span>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {(['csv', 'json', 'txt'] as const).map((value) => (
                <label key={value} style={{ ...optionStyle, padding: '0.1rem 0' }}>
                  <input
                    type="radio"
                    name="export-format"
                    checked={format === value}
                    onChange={() => setFormat(value)}
                  />
                  <span>{value === 'csv' ? 'CSV' : value === 'json' ? 'JSON' : 'Text (.txt)'}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={sectionStyle}>
            <span style={labelStyle}>Fields</span>
            <label style={optionStyle}>
              <input
                type="radio"
                name="export-preset"
                checked={preset === 'titles'}
                onChange={() => setPreset('titles')}
              />
              <span>
                <strong>Titles only</strong>
                <span style={{ color: '#64748b' }}> — one title per row/line</span>
              </span>
            </label>
            <label style={optionStyle}>
              <input
                type="radio"
                name="export-preset"
                checked={preset === 'everything'}
                onChange={() => setPreset('everything')}
              />
              <span>
                <strong>Everything</strong>
                <span style={{ color: '#64748b' }}> — all {fields.length} fields</span>
              </span>
            </label>
            <label style={optionStyle}>
              <input
                type="radio"
                name="export-preset"
                checked={preset === 'custom'}
                onChange={() => setPreset('custom')}
              />
              <span>
                <strong>Custom</strong>
                <span style={{ color: '#64748b' }}> — pick the columns</span>
              </span>
            </label>

            {preset === 'custom' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: '0.15rem 0.75rem',
                  marginTop: '0.55rem',
                  maxHeight: 220,
                  overflowY: 'auto',
                  padding: '0.5rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                }}
              >
                {fields.map((field) => (
                  <label key={field} style={{ ...optionStyle, padding: '0.15rem 0' }}>
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field)}
                      onChange={() => toggleField(field)}
                    />
                    <span>{field}</span>
                  </label>
                ))}
              </div>
            )}

            {preset === 'titles' && selectedRows.length > 0 && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.6rem',
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  color: '#475569',
                }}
              >
                {selectedRows.slice(0, 3).map((row, index) => (
                  <div
                    key={index}
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {String(row[effectiveTitleKey] ?? '')}
                  </div>
                ))}
                {selectedRows.length > 3 && (
                  <div style={{ color: '#94a3b8', marginTop: '0.15rem' }}>…and {selectedRows.length - 3} more</div>
                )}
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
            Exporting <strong>{selectedRows.length}</strong> row{selectedRows.length === 1 ? '' : 's'} ·{' '}
            <strong>{activeFields.length}</strong> field{activeFields.length === 1 ? '' : 's'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            padding: '0.8rem 1rem',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 0.8rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#475569',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0.9rem',
              borderRadius: 6,
              border: 'none',
              backgroundColor: canExport ? '#0f766e' : '#94a3b8',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: canExport ? 'pointer' : 'not-allowed',
            }}
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>
    </div>
  );
}
