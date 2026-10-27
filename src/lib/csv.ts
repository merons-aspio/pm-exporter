import Papa from 'papaparse';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;

  const csv = Papa.unparse(rows);
  // UTF-8 BOM so Excel renders accented names correctly
  triggerDownload(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }),
    filename
  );
}

export function downloadJson(value: unknown, filename: string) {
  triggerDownload(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename);
}

export function downloadText(text: string, filename: string) {
  if (!text) return;
  triggerDownload(new Blob([text], { type: 'text/plain;charset=utf-8;' }), filename);
}
