import type { Db } from './sqlite';
import { badRequest } from '../errors';

/**
 * List-endpoint machinery: cursor pagination, server-side filter and sort, and
 * `?fields=` projection.
 *
 * Every identifier that reaches SQL is checked against a declared allowlist.
 * Column names cannot be parameterised, so an allowlist is the only safe way
 * to let a client choose a sort column — string interpolation of a query
 * parameter into ORDER BY is a SQL injection, however harmless the value looks.
 */

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export type FilterOp = 'eq' | 'in' | 'like' | 'gte' | 'lte' | 'ne';

export interface ColumnSpec {
  /** Physical column. */
  column: string;
  /** Allowed as a sort key. */
  sortable?: boolean;
  /** Operators this column accepts as a filter. */
  filters?: readonly FilterOp[];
}

export interface TableSpec {
  table: string;
  /** Primary key; also the pagination tiebreaker, so ordering is total. */
  idColumn: string;
  /** Exposed field name -> column spec. Anything absent is rejected. */
  columns: Record<string, ColumnSpec>;
  /** Columns searched by `?q=`. */
  searchColumns?: readonly string[];
  /** Fields always returned, whatever `?fields=` says. */
  alwaysFields?: readonly string[];
  defaultSort?: { field: string; desc?: boolean };
}

export interface ListQuery {
  cursor?: string | undefined;
  limit?: number | undefined;
  sort?: string | undefined;
  /** 'asc' | 'desc' */
  order?: string | undefined;
  q?: string | undefined;
  fields?: string | undefined;
  /** Remaining query parameters, treated as filters. */
  filters?: Record<string, string | string[] | undefined>;
}

export interface PageInfo {
  nextCursor: string | null;
  total: number;
}

export interface PageResult<T> {
  items: T[];
  page: PageInfo;
}

interface Cursor {
  /** Last row's sort value. */
  v: string | number | null;
  /** Last row's id, breaking ties. */
  i: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'i' in parsed &&
      typeof (parsed as { i: unknown }).i === 'string'
    ) {
      return parsed as Cursor;
    }
  } catch {
    // fall through to the same error either way; the reason is not the client's business
  }
  throw badRequest('That cursor is not valid. Start from the first page.', { cursor: 'invalid' });
}

/** SQLite identifier quoting, applied only to names that came from a spec. */
const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

function resolveFields(spec: TableSpec, requested: string | undefined): string[] {
  const all = Object.keys(spec.columns);
  if (!requested) return all;

  const asked = requested
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  const unknown = asked.filter((f) => !(f in spec.columns));
  if (unknown.length > 0) {
    throw badRequest(`Unknown field: ${unknown.join(', ')}`, { fields: 'unknown' });
  }

  const always = spec.alwaysFields ?? [spec.idColumn];
  return [...new Set([...always.filter((f) => f in spec.columns), ...asked])];
}

/** A constraint and its bound values, kept together so neither drifts. */
export interface WhereClause {
  sql: string;
  params: unknown[];
}

function buildWhere(spec: TableSpec, query: ListQuery, extra?: WhereClause): WhereClause {
  const parts: string[] = [];
  const params: unknown[] = [];

  if (extra?.sql) {
    parts.push(`(${extra.sql})`);
    params.push(...extra.params);
  }

  if (query.q && spec.searchColumns?.length) {
    const term = `%${query.q.trim().toLowerCase()}%`;
    const ors = spec.searchColumns.map((c) => `LOWER(${quote(c)}) LIKE ?`);
    parts.push(`(${ors.join(' OR ')})`);
    for (let i = 0; i < spec.searchColumns.length; i++) params.push(term);
  }

  for (const [key, raw] of Object.entries(query.filters ?? {})) {
    if (raw === undefined || raw === '') continue;

    // `status` filters `status`; `compliance.gte` filters with >=.
    const [field, opRaw] = key.split('.', 2);
    if (!field) continue;
    const spec_ = spec.columns[field];
    if (!spec_) continue; // unknown parameters are ignored, not echoed back

    const op = (opRaw ?? (Array.isArray(raw) ? 'in' : 'eq')) as FilterOp;
    const allowed = spec_.filters ?? ['eq', 'in'];
    if (!allowed.includes(op)) {
      throw badRequest(`Cannot filter ${field} with ${op}.`, { [key]: 'unsupported' });
    }

    const column = quote(spec_.column);
    const values = Array.isArray(raw) ? raw : raw.split(',').filter(Boolean);

    switch (op) {
      case 'eq':
      case 'in': {
        if (values.length === 0) continue;
        parts.push(`${column} IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
        break;
      }
      case 'ne': {
        parts.push(`${column} <> ?`);
        params.push(values[0]);
        break;
      }
      case 'like': {
        parts.push(`LOWER(${column}) LIKE ?`);
        params.push(`%${String(values[0]).toLowerCase()}%`);
        break;
      }
      case 'gte': {
        parts.push(`${column} >= ?`);
        params.push(values[0]);
        break;
      }
      case 'lte': {
        parts.push(`${column} <= ?`);
        params.push(values[0]);
        break;
      }
    }
  }

  return { sql: parts.join(' AND '), params };
}

export interface ListOptions {
  /** Extra constraint the caller controls, e.g. a zone scope from RBAC. */
  scope?: WhereClause;
}

export function listRows<T extends Record<string, unknown>>(
  db: Db,
  spec: TableSpec,
  query: ListQuery,
  options: ListOptions = {},
): PageResult<T> {
  const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  /*
   * The contract states the descending form as a `-` prefix on `sort`
   * ("Column id, prefix with - for descending. Example: -lastSeen."), while
   * this builder only ever read a separate `order` parameter. Both are
   * honoured: the declared prefix, because the contract is the source of
   * truth, and `order`, because every page in the console already sends it.
   */
  const rawSort = query.sort ?? spec.defaultSort?.field ?? spec.idColumn;
  const descPrefixed = rawSort.startsWith('-');
  const sortField = descPrefixed ? rawSort.slice(1) : rawSort;
  const sortSpec = spec.columns[sortField];
  if (!sortSpec?.sortable && sortField !== spec.idColumn) {
    throw badRequest(`Cannot sort by ${sortField}.`, { sort: 'unsupported' });
  }
  const sortColumn = sortSpec?.column ?? spec.idColumn;
  const desc = descPrefixed
    ? true
    : query.order
      ? query.order.toLowerCase() === 'desc'
      : Boolean(spec.defaultSort?.desc);

  const fields = resolveFields(spec, query.fields);
  const select = fields.map((f) => {
    const column = spec.columns[f];
    if (!column) throw badRequest(`Unknown field: ${f}`, { fields: 'unknown' });
    return `${quote(column.column)} AS ${quote(f)}`;
  });
  // The cursor needs the sort value and the id even when the client did not ask for them.
  const internalSelect = [
    ...select,
    `${quote(sortColumn)} AS "__sort"`,
    `${quote(spec.idColumn)} AS "__id"`,
  ];

  const where = buildWhere(spec, query, options.scope);
  const whereSql = where.sql ? `WHERE ${where.sql}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM ${quote(spec.table)} ${whereSql}`)
    .get(...where.params) as {
    n: number;
  };

  // Keyset pagination: (sort, id) > (lastSort, lastId). Stable under inserts,
  // and does not degrade the way OFFSET does at row 40,000.
  const keyParams: unknown[] = [];
  const conditions: string[] = [];
  if (where.sql) conditions.push(where.sql);

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    const cmp = desc ? '<' : '>';
    conditions.push(
      `(${quote(sortColumn)} ${cmp} ? OR (${quote(sortColumn)} = ? AND ${quote(spec.idColumn)} ${cmp} ?))`,
    );
    keyParams.push(cursor.v, cursor.v, cursor.i);
  }

  const direction = desc ? 'DESC' : 'ASC';
  const sql = [
    `SELECT ${internalSelect.join(', ')}`,
    `FROM ${quote(spec.table)}`,
    conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    `ORDER BY ${quote(sortColumn)} ${direction}, ${quote(spec.idColumn)} ${direction}`,
    `LIMIT ?`,
  ]
    .filter(Boolean)
    .join(' ');

  const rows = db.prepare(sql).all(...where.params, ...keyParams, limit + 1) as (T & {
    __sort: string | number | null;
    __id: string;
  })[];

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  const items = page.map((row) => {
    const rest = { ...row } as Record<string, unknown>;
    // Cursor bookkeeping, not part of the resource.
    delete rest['__sort'];
    delete rest['__id'];
    return rest as unknown as T;
  });

  return {
    items,
    page: {
      nextCursor: hasMore && last ? encodeCursor({ v: last.__sort, i: last.__id }) : null,
      total: total.n,
    },
  };
}

/** Counts rows per value of one column; the aggregate behind filter facets. */
export function countBy(
  db: Db,
  spec: TableSpec,
  field: string,
  query: ListQuery = {},
  options: ListOptions = {},
): Record<string, number> {
  const column = spec.columns[field];
  if (!column) throw badRequest(`Unknown field: ${field}`, { field: 'unknown' });
  const where = buildWhere(spec, query, options.scope);
  const whereSql = where.sql ? `WHERE ${where.sql}` : '';
  const rows = db
    .prepare(
      `SELECT ${quote(column.column)} AS k, COUNT(*) AS n FROM ${quote(spec.table)} ${whereSql} GROUP BY 1 ORDER BY 2 DESC`,
    )
    .all(...where.params) as { k: string | null; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.k ?? 'unknown', r.n]));
}
