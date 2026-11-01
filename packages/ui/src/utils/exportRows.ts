/**
 * Export helpers for DataTable.
 *
 * Both writers run every cell through `neutralizeFormula`. A spreadsheet
 * treats a leading =, +, -, @, tab or CR as the start of a formula, so a
 * device named `=cmd|'/c calc'!A1` becomes executable the moment someone
 * opens the export. Device names, software titles and script output in this
 * console are all attacker-influenced, so the guard is not optional.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export type CellValue = string | number | boolean | null | undefined;

export interface ExportColumn<T> {
  id: string;
  header: string;
  value: (row: T) => CellValue;
}

const toText = (v: CellValue): string => (v === null || v === undefined ? '' : String(v));

/** RFC 4180 quoting, plus the formula guard. */
function csvCell(v: CellValue): string {
  const text = neutralizeFormula(toText(v));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: readonly ExportColumn<T>[], rows: readonly T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  // BOM so Excel reads UTF-8 rather than the system codepage.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Only the characters a filesystem objects to; the rest of the name is the caller's. */
function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'export';
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(fileName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next frame; revoking synchronously cancels the download in Safari.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

export function exportCsv<T>(
  columns: readonly ExportColumn<T>[],
  rows: readonly T[],
  fileName: string,
): void {
  downloadBlob(
    new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }),
    `${fileName}.csv`,
  );
}

/**
 * XLSX writer. ExcelJS is pulled in on demand: it is far larger than the rest
 * of the console put together, and nobody pays for it until they click Export.
 */
export async function exportXlsx<T>(
  columns: readonly ExportColumn<T>[],
  rows: readonly T[],
  fileName: string,
  sheetName = 'Export',
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName.slice(0, 31));

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.id,
    width: Math.min(40, Math.max(12, c.header.length + 4)),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    const record: Record<string, CellValue> = {};
    for (const c of columns) {
      const v = c.value(row);
      record[c.id] = typeof v === 'string' ? neutralizeFormula(v) : v;
    }
    sheet.addRow(record);
  }

  const buffer = await book.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${fileName}.xlsx`,
  );
}
