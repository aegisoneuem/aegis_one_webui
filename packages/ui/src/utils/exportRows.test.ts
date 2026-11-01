import { describe, expect, it } from 'vitest';
import { neutralizeFormula, toCsv } from './exportRows';

/**
 * Export is where attacker-influenced data leaves the console and lands in a
 * program that executes things. Device names, software titles and script
 * output all come from endpoints, so these are the tests that matter most in
 * this package.
 */

type Row = { name: string; count: number };
const columns = [
  { id: 'name', header: 'Name', value: (r: Row) => r.name },
  { id: 'count', header: 'Count', value: (r: Row) => r.count },
];

describe('neutralizeFormula', () => {
  it.each(['=cmd|\'/c calc\'!A1', '+1+1', '-1+1', '@SUM(A1)', '\tSUM(A1)', '\rSUM(A1)'])(
    'prefixes %j so a spreadsheet treats it as text',
    (value) => {
      expect(neutralizeFormula(value)).toBe(`'${value}`);
    },
  );

  it('leaves ordinary values alone', () => {
    expect(neutralizeFormula('MUM-WS-0421')).toBe('MUM-WS-0421');
    expect(neutralizeFormula('Google Chrome 142.0')).toBe('Google Chrome 142.0');
    expect(neutralizeFormula('')).toBe('');
  });

  it('does not neutralise a formula character that is not leading', () => {
    expect(neutralizeFormula('Backup=Daily')).toBe('Backup=Daily');
  });
});

describe('toCsv', () => {
  it('writes a header row and the values', () => {
    const csv = toCsv(columns, [{ name: 'MUM-WS-0421', count: 7 }]);
    expect(csv).toContain('Name,Count');
    expect(csv).toContain('MUM-WS-0421,7');
  });

  it('starts with a BOM so Excel reads it as UTF-8', () => {
    // Written as an escape; a literal BOM in source is invisible and confusing.
    expect(toCsv(columns, []).codePointAt(0)).toBe(0xfeff);
  });

  it('neutralises a formula in a cell', () => {
    const csv = toCsv(columns, [{ name: '=HYPERLINK("http://evil.example","click")', count: 1 }]);
    // Quoted because it contains a comma, and prefixed because it starts with =.
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/);
  });

  it('quotes and escapes commas, quotes and newlines', () => {
    const csv = toCsv(columns, [{ name: 'Acme, "Ltd"\nBranch', count: 2 }]);
    expect(csv).toContain('"Acme, ""Ltd""\nBranch"');
  });

  it('writes an empty cell for null and undefined', () => {
    const nullable = [
      { id: 'a', header: 'A', value: () => null },
      { id: 'b', header: 'B', value: () => undefined },
    ];
    expect(toCsv(nullable, [{ name: '', count: 0 }])).toContain('\r\n,\r\n');
  });

  it('uses CRLF line endings, as RFC 4180 asks', () => {
    const csv = toCsv(columns, [{ name: 'a', count: 1 }]);
    expect(csv.split('\r\n')).toHaveLength(3);
  });
});
