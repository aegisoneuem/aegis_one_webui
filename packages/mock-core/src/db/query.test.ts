import { describe, expect, it, beforeEach } from 'vitest';
import { openDb, type Db } from './sqlite';
import { listRows, MAX_PAGE_SIZE, type TableSpec } from './query';
import { ApiError } from '../errors';

/**
 * The list layer is the one place a client's own strings reach SQL, so these
 * tests are about what it refuses as much as what it returns.
 */

const spec: TableSpec = {
  table: 'widgets',
  idColumn: 'id',
  searchColumns: ['name'],
  alwaysFields: ['id'],
  defaultSort: { field: 'name' },
  columns: {
    id: { column: 'id' },
    name: { column: 'name', sortable: true, filters: ['eq', 'in', 'like'] },
    size: { column: 'size', sortable: true, filters: ['gte', 'lte'] },
    colour: { column: 'colour', filters: ['eq', 'in'] },
    secret: { column: 'secret' },
  },
};

let db: Db;

beforeEach(() => {
  db = openDb({ file: ':memory:' });
  db.exec(
    `CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT, size INTEGER, colour TEXT, secret TEXT)`,
  );
  const insert = db.prepare(`INSERT INTO widgets VALUES (?,?,?,?,?)`);
  const colours = ['red', 'green', 'blue'];
  db.transaction(() => {
    for (let i = 0; i < 120; i++) {
      insert.run(
        `w-${String(i).padStart(3, '0')}`,
        `Widget ${String(i).padStart(3, '0')}`,
        i,
        colours[i % 3],
        `secret-${i}`,
      );
    }
  })();
});

describe('listRows', () => {
  it('returns a page with the total of the whole filtered set', () => {
    const result = listRows(db, spec, { limit: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.page.total).toBe(120);
    expect(result.page.nextCursor).toBeTypeOf('string');
  });

  it('walks the whole set exactly once through the cursor', () => {
    const seen: string[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 20; page++) {
      const result = listRows<{ id: string }>(db, spec, {
        limit: 25,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...result.items.map((r) => r.id));
      if (!result.page.nextCursor) break;
      cursor = result.page.nextCursor;
    }

    expect(seen).toHaveLength(120);
    // No row appears twice and none is skipped — the thing OFFSET gets wrong
    // when rows are inserted mid-walk.
    expect(new Set(seen).size).toBe(120);
  });

  it('pages correctly with no WHERE clause', () => {
    // Regression: the keyset predicate once lost its AND when nothing else
    // filtered, producing invalid SQL on page two.
    const first = listRows<{ id: string }>(db, spec, { limit: 5 });
    const second = listRows<{ id: string }>(db, spec, {
      limit: 5,
      cursor: first.page.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(5);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('pages correctly in descending order', () => {
    const first = listRows<{ id: string }>(db, spec, { limit: 5, sort: 'size', order: 'desc' });
    expect(first.items[0]?.id).toBe('w-119');

    const second = listRows<{ id: string }>(db, spec, {
      limit: 5,
      sort: 'size',
      order: 'desc',
      cursor: first.page.nextCursor ?? undefined,
    });
    expect(second.items[0]?.id).toBe('w-114');
  });

  it('clamps the page size to the contract maximum', () => {
    const result = listRows(db, spec, { limit: 5000 });
    expect(result.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('projects only the requested fields, plus the ones always returned', () => {
    const result = listRows<Record<string, unknown>>(db, spec, { limit: 1, fields: 'name,size' });
    expect(Object.keys(result.items[0] ?? {}).sort()).toEqual(['id', 'name', 'size']);
  });

  it('never leaks the cursor bookkeeping columns', () => {
    const result = listRows<Record<string, unknown>>(db, spec, { limit: 1 });
    expect(result.items[0]).not.toHaveProperty('__sort');
    expect(result.items[0]).not.toHaveProperty('__id');
  });

  describe('refuses anything outside the declared allowlist', () => {
    it('rejects an unknown sort column rather than interpolating it', () => {
      expect(() => listRows(db, spec, { sort: 'name); DROP TABLE widgets; --' })).toThrow(ApiError);
      // The table is still there, which is the point.
      expect(db.prepare('SELECT COUNT(*) AS n FROM widgets').get()).toEqual({ n: 120 });
    });

    it('rejects a sort column that exists but is not sortable', () => {
      expect(() => listRows(db, spec, { sort: 'secret' })).toThrow(/Cannot sort/);
    });

    it('rejects an unknown projected field', () => {
      expect(() => listRows(db, spec, { fields: 'name,sqlite_master' })).toThrow(/Unknown field/);
    });

    it('rejects an operator the column does not allow', () => {
      expect(() => listRows(db, spec, { filters: { 'colour.gte': 'red' } })).toThrow(
        /Cannot filter/,
      );
    });

    it('ignores an unknown filter instead of echoing it back', () => {
      const result = listRows(db, spec, { limit: 5, filters: { nonsense: 'x' } });
      expect(result.page.total).toBe(120);
    });

    it('rejects a malformed cursor', () => {
      expect(() => listRows(db, spec, { cursor: 'not-a-cursor' })).toThrow(/cursor/i);
    });
  });

  describe('filtering', () => {
    it('matches an exact value', () => {
      const result = listRows(db, spec, { filters: { colour: 'red' } });
      expect(result.page.total).toBe(40);
    });

    it('matches any of several values', () => {
      const result = listRows(db, spec, { filters: { colour: 'red,blue' } });
      expect(result.page.total).toBe(80);
    });

    it('applies a numeric range', () => {
      const result = listRows(db, spec, { filters: { 'size.gte': '100', 'size.lte': '109' } });
      expect(result.page.total).toBe(10);
    });

    it('searches the declared search columns', () => {
      const result = listRows(db, spec, { q: 'widget 01' });
      expect(result.page.total).toBe(10);
    });

    it('treats a search term as data, not as a pattern', () => {
      const result = listRows(db, spec, { q: "'; DROP TABLE widgets; --" });
      expect(result.page.total).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS n FROM widgets').get()).toEqual({ n: 120 });
    });

    it('applies a caller scope on top of the client filters', () => {
      const result = listRows(
        db,
        spec,
        { filters: { colour: 'red' } },
        {
          scope: { sql: 'size < ?', params: [30] },
        },
      );
      expect(result.page.total).toBe(10);
    });
  });
});
