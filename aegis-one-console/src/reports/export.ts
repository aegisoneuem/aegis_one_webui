import type { ExportFormat } from './data';
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const xml = (s: string) => s.replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
})[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function zip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder(),
    chunks: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const n = enc.encode(name),
      body = enc.encode(content);
    let crc = 0xffffffff;
    for (const b of body) {
      crc ^= b;
      for (let k = 0; k < 8; k++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + n.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true);
    h.setUint32(22, body.length, true);
    h.setUint16(26, n.length, true);
    header.set(n, 30);
    const central = new Uint8Array(46 + n.length),
      c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, body.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    central.set(n, 46);
    chunks.push(header, body);
    directory.push(central);
    offset += header.length + body.length;
  }
  const size = directory.reduce((n, x) => n + x.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, directory.length, true);
  e.setUint16(10, directory.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + 22);
  let pos = 0;
  for (const x of [...chunks, ...directory, end]) {
    result.set(x, pos);
    pos += x.length;
  }
  return result;
}
function column(n: number): string {
  return n < 26 ? String.fromCharCode(65 + n) : column(Math.floor(n / 26) - 1) + column(n % 26);
}
export function exportReport(title: string, columns: string[], rows: string[][], format: ExportFormat) {
  const name = title.replace(/[^a-z0-9]+/gi, '-');
  if (format === 'PDF') {
    const popup = window.open('', '_blank');
    if (!popup) throw new Error('Allow popups to open the print / Save as PDF view.');
    popup.document.write(`<html><head><title>${xml(title)}</title><style>body{font:13px system-ui;padding:24px;color:#172334}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f3f5f7}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>${xml(title)}</h1><p>Demo snapshot · ${rows.length} exported rows · ${xml(new Date().toLocaleString())}</p><table><thead><tr>${columns.map(c => `<th>${xml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${xml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
    return;
  }
  if (format === 'CSV') {
    const csv = [columns, ...rows].map(r => r.map(c => '"' + (/^[=+@\-\t\r]/.test(c) ? "'" : '') + c.replaceAll('"', '""') + '"').join(',')).join('\r\n');
    download(new Blob(['\ufeff', csv], {
      type: 'text/csv;charset=utf-8'
    }), name + '.csv');
    return;
  }
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetData>${[columns, ...rows].map((r, i) => `<row r="${i + 1}">${r.map((c, j) => `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(c)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const bytes = zip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet
  });
  download(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }), name + '.xlsx');
}
