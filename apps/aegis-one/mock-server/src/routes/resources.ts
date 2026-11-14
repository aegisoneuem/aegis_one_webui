import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  badRequest,
  clauseFor,
  listRows,
  notFound,
  zoneScope,
  type Db,
  type FilterOp,
  type ListQuery,
  type TableSpec,
  type WhereClause,
} from '@aegis/mock-core';
import { shapeFinding } from './vulnerabilities';
import {
  apiTokensSpec,
  auditSpec,
  deploymentsSpec,
  devicesSpec,
  findingsSpec,
  liveJobsSpec,
  logBundlesSpec,
  patchesSpec,
  softwareSpec,
  scansSpec,
} from '../specs';

/**
 * List and detail endpoints for every resource that is just rows.
 *
 * They all go through the same `listRows`, so pagination, projection, filter
 * handling and the column allowlist behave identically everywhere — a filter
 * that works on Devices works the same way on Patches, and a column nobody
 * declared is rejected on both.
 */

const RESERVED = new Set(['cursor', 'limit', 'sort', 'order', 'q', 'fields']);

/** Splits the query string into paging controls and everything else, which is filters. */
export function toListQuery(request: FastifyRequest): ListQuery {
  const raw = request.query as Record<string, string | undefined>;
  const filters: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) if (!RESERVED.has(key)) filters[key] = value;
  return {
    cursor: raw['cursor'],
    limit: raw['limit'] ? Number(raw['limit']) : undefined,
    sort: raw['sort'],
    order: raw['order'],
    q: raw['q'],
    fields: raw['fields'],
    filters,
  };
}

interface ResourceDef {
  path: string;
  spec: TableSpec;
  /** Restricted to the caller's zones when their role is scoped. */
  zoneScoped?: boolean;
  /** Fields parsed back from JSON text columns before they go out. */
  jsonFields?: readonly string[];
  /**
   * Rewrites query parameters the contract declares in the caller's words into
   * the filters the column allowlist understands. It runs before `listRows`,
   * so a parameter it does not produce still cannot reach SQL.
   */
  derive?: (db: Db, filters: ListQuery['filters'] & object) => void;
  /**
   * A constraint this resource builds from its own query parameters, ANDed
   * with whatever scope the caller's role already imposes. It exists for a
   * filter that is a join rather than a column — group membership, where
   * resolving to a list of ids would mean a thirty-thousand-element IN.
   */
  scopeFrom?: (db: Db, filters: ListQuery['filters'] & object) => WhereClause | undefined;
  /**
   * Extra top-level fields the contract's page envelope carries beside
   * `items` and `page` — the catalogue counters, for instance, which describe
   * the whole catalogue rather than the page in hand.
   */
  envelope?: (db: Db) => Record<string, unknown>;
  /**
   * Last word on a row's shape, for a contract that nests what the table
   * keeps flat. It runs after the boolean and JSON handling, so it sees the
   * row as it would otherwise have gone out.
   */
  shape?: (row: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * The five counters above the software catalogue.
 *
 * They describe the catalogue, not the filtered page: the reference shows
 * them as a fixed row that the search and the filters do not move, because
 * they are what an administrator is working through.
 */
function softwareCounts(db: Db): Record<string, unknown> {
  return {
    counts: db
      .prepare(
        `SELECT COUNT(*) AS "all",
                SUM(installer = 'added') AS installerAdded,
                SUM(installer = 'missing') AS installerMissing,
                SUM(state = 'draft') AS draft,
                COUNT(DISTINCT publisher) AS publishers
         FROM software`,
      )
      .get(),
  };
}

/**
 * The Patches grid's own parameters.
 *
 * `vendor` is the contract's name for `source`; `releasedAfter` is a lower
 * bound on a date; `osVersion` is the only one that is not a column at all —
 * it asks for the updates outstanding on endpoints running that version, which
 * is a join, so it is resolved to a list of ids first.
 */
/**
 * The contract keeps a deployment's three result figures in one `counts`
 * object and its target sample as a list; the table keeps both flat, because
 * a column is what a filter and a sort can reach.
 */
function shapeDeployment(row: Record<string, unknown>): Record<string, unknown> {
  const { done, failed, pending, targetPreview, ...rest } = row;
  return {
    ...rest,
    ...(targetPreview === undefined
      ? {}
      : { targetPreview: String(targetPreview).split(',').filter(Boolean) }),
    ...(done === undefined && failed === undefined && pending === undefined
      ? {}
      : { counts: { done, failed, pending } }),
  };
}

/**
 * The contract keeps a job's seven per-endpoint figures in one `counts`
 * object. The table keeps them as columns, because a column is what a sort
 * can reach and what a counter can be totalled from in SQL.
 */
function shapeLiveJob(row: Record<string, unknown>): Record<string, unknown> {
  const { queued, running, succeeded, failed, timedOut, offline, cancelled, ...rest } = row;
  const counts = { queued, running, succeeded, failed, timedOut, offline, cancelled };
  const present = Object.values(counts).some((v) => v !== undefined);
  return present ? { ...rest, counts } : rest;
}

/** The five counters above the Log Collection grid, over every bundle stored. */
function logStats(db: Db): Record<string, unknown> {
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS bundlesStored,
              COUNT(DISTINCT device_id) AS hostsCovered,
              SUM(status IN ('failed', 'waiting')) AS failedOrWaiting,
              CAST(COALESCE(SUM(size_bytes), 0) / 1048576 AS INTEGER) AS storageUsedMb
         FROM log_bundles`,
    )
    .get() as Record<string, unknown>;

  const next = db
    .prepare(`SELECT MIN(next_run_at) AS nextScheduled FROM log_schedules WHERE enabled = 1`)
    .get() as { nextScheduled: string | null };

  return { stats: { ...stats, nextScheduled: next.nextScheduled } };
}

/**
 * The Log Collection grid's own parameters: an age bucket rather than a date,
 * and a log type that lives inside a JSON array rather than in a column.
 */
function deriveLogFilters(_db: Db, filters: ListQuery['filters'] & object): void {
  const first = (key: string): string | undefined => {
    const raw = filters[key];
    filters[key] = undefined;
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const collected = first('collected');
  const logType = first('logType');

  const days = collected === '24h' ? 1 : collected === '7d' ? 7 : collected === '30d' ? 30 : 0;
  if (days > 0) {
    filters['collectedAt.gte'] = new Date(Date.now() - days * 86_400_000).toISOString();
  }
  // Quoted, so "agent" cannot also match "agent-extra" were one added later.
  if (logType) filters['fileTypes.like'] = `"${logType}"`;
}

/**
 * `/liveops/audit` is the Live Activity trail, not the whole console's: the
 * contract calls it "audit trail of Live Activity submissions", and the
 * Administration page serves the rest from `/audit` over the same table.
 */
function deriveLiveAuditFilters(_db: Db, filters: ListQuery['filters'] & object): void {
  filters['action.like'] = 'liveops.';
}

/**
 * The findings grid's own parameters.
 *
 * Three of them are not columns. `threat` is one of eight indicators inside a
 * JSON array; `sla` is a comparison against now, not a stored state; and
 * `platform` asks for the findings open on devices of that family, which is a
 * join, so it is resolved to a list of ids first.
 */
function deriveFindingFilters(db: Db, filters: ListQuery['filters'] & object): void {
  const first = (key: string): string | undefined => {
    const raw = filters[key];
    filters[key] = undefined;
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const threat = first('threat');
  const sla = first('sla');
  const platform = first('platform');

  // Quoted, so "remote" cannot also match a longer indicator were one added.
  if (threat && threat !== 'none') filters['threats.like'] = `"${threat}"`;

  if (sla) {
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const now = new Date().toISOString();
    if (sla === 'overdue') filters['slaDueAt.lte'] = now;
    if (sla === 'due-soon') {
      filters['slaDueAt.gte'] = now;
      filters['slaDueAt.lte'] = soon;
    }
    if (sla === 'within') filters['slaDueAt.gte'] = soon;
  }

  if (!platform) return;
  const family =
    platform === 'windows'
      ? 'Windows%'
      : platform === 'macos'
        ? 'macOS%'
        : platform === 'aix'
          ? 'AIX%'
          : 'Linux%';
  const ids = db
    .prepare(
      `SELECT DISTINCT dv.vulnerability_id AS id
         FROM device_vulnerabilities dv JOIN devices d ON d.id = dv.device_id
        WHERE dv.state = 'open' AND d.os_family LIKE ?`,
    )
    .all(family) as { id: string }[];

  // An empty list stays a filter that matches nothing; leaving it off would
  // quietly widen the grid back to every platform.
  filters['id'] = ids.length ? ids.map((row) => row.id).join(',') : '\u0000none';
}

function derivePatchFilters(db: Db, filters: ListQuery['filters'] & object): void {
  // A repeated parameter arrives as an array; these three each name one value.
  const first = (key: string): string | undefined => {
    const raw = filters[key];
    // Cleared rather than deleted: the allowlist ignores an unknown key, and
    // an empty value is already treated as "not filtered".
    filters[key] = undefined;
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const vendor = first('vendor');
  const releasedAfter = first('releasedAfter');
  const osVersion = first('osVersion');

  if (vendor) filters['source'] = vendor;
  if (releasedAfter) filters['releasedAt.gte'] = releasedAfter;
  if (!osVersion) return;

  const ids = db
    .prepare(
      `SELECT DISTINCT dp.patch_id AS id
         FROM device_patches dp JOIN devices d ON d.id = dp.device_id
        WHERE d.os_name || ' ' || d.os_version = ? AND dp.state IN ('pending', 'failed')`,
    )
    .all(osVersion) as { id: string }[];

  // An empty list has to stay a filter that matches nothing. Leaving it off
  // would quietly widen the result to the whole catalogue.
  filters['id'] = ids.length ? ids.map((row) => row.id).join(',') : '\u0000none';
}

/**
 * `?group=` on the device list, which the contract has always declared and
 * no server answered: the parameter was accepted and ignored, so a filtered
 * grid quietly showed the whole estate.
 *
 * A membership test rather than an id list. The largest group here holds
 * 32,710 devices, and resolving it would put all of them in the query.
 */
/**
 * The contract's `?filter=`: a JSON array of {field, op, value}, all of which
 * must match. Declared since the first version of the spec and, until now,
 * accepted and ignored — a console could send a rule and get the whole
 * estate back believing it had filtered.
 *
 * Built as one ANDed clause rather than written into the filter map, because
 * the map is keyed by `field.op` and two rules on the same field would
 * overwrite each other. Every rule still goes through `clauseFor`, so the
 * column allowlist, the operator allowlist and the parameter binding are the
 * same ones the ordinary query parameters use. Nothing here reaches SQL by
 * another route.
 */
function advancedFilter(spec: TableSpec, raw: unknown): WhereClause | undefined {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== 'string' || text.trim() === '') return undefined;
  if (text.length > 4096) throw badRequest('That filter is too long.', { filter: 'too-long' });

  let rules: unknown;
  try {
    rules = JSON.parse(text);
  } catch {
    throw badRequest('That filter is not valid JSON.', { filter: 'malformed' });
  }
  if (!Array.isArray(rules)) {
    throw badRequest('A filter is a list of rules.', { filter: 'not-a-list' });
  }
  if (rules.length > 20) {
    throw badRequest('A filter may hold at most twenty rules.', { filter: 'too-many' });
  }

  const parts: string[] = [];
  const params: unknown[] = [];
  for (const rule of rules) {
    if (typeof rule !== 'object' || rule === null) {
      throw badRequest('Each rule is an object.', { filter: 'bad-rule' });
    }
    const { field, op, value } = rule as { field?: unknown; op?: unknown; value?: unknown };
    if (typeof field !== 'string' || typeof op !== 'string') {
      throw badRequest('Each rule names a field and an operator.', { filter: 'bad-rule' });
    }
    // An unknown field is a mistake worth reporting rather than ignoring:
    // silence here is what made the old behaviour so misleading.
    if (!spec.columns[field]) {
      throw badRequest(`There is no field called ${field}.`, { filter: 'unknown-field' });
    }
    const values = value === undefined || value === null ? [] : [value];
    const clause = clauseFor(spec, field, op as FilterOp, values);
    if (!clause) continue;
    parts.push(`(${clause.sql})`);
    params.push(...clause.params);
  }

  return parts.length > 0 ? { sql: parts.join(' AND '), params } : undefined;
}

function deviceGroupScope(
  _db: Db,
  filters: ListQuery['filters'] & object,
): WhereClause | undefined {
  const raw = filters['group'];
  filters['group'] = undefined;
  const group = Array.isArray(raw) ? raw[0] : raw;
  if (!group) return undefined;
  return {
    sql: `EXISTS (SELECT 1 FROM group_members gm
                   WHERE gm.device_id = devices.id AND gm.group_id = ?)`,
    params: [group],
  };
}

/** The device list's own two: its group, and its advanced rules. */
function deviceScope(db: Db, filters: ListQuery['filters'] & object): WhereClause | undefined {
  const rules = filters['filter'];
  filters['filter'] = undefined;
  return both(deviceGroupScope(db, filters), advancedFilter(devicesSpec, rules));
}

const RESOURCES: readonly ResourceDef[] = [
  { path: 'devices', spec: devicesSpec, zoneScoped: true, scopeFrom: deviceScope },
  { path: 'software', spec: softwareSpec, envelope: softwareCounts },
  { path: 'patches', spec: patchesSpec, derive: derivePatchFilters },
  {
    path: 'vulnerabilities/findings',
    spec: findingsSpec,
    jsonFields: ['threats'],
    derive: deriveFindingFilters,
    shape: shapeFinding,
  },
  { path: 'vulnerabilities/scans', spec: scansSpec },
  { path: 'deployments', spec: deploymentsSpec, shape: shapeDeployment },
  { path: 'liveops/script-jobs', spec: liveJobsSpec, shape: shapeLiveJob },
  {
    path: 'liveops/logs',
    spec: logBundlesSpec,
    jsonFields: ['fileTypes'],
    derive: deriveLogFilters,
    envelope: logStats,
  },
  { path: 'liveops/audit', spec: auditSpec, derive: deriveLiveAuditFilters },
  { path: 'admin/api-tokens', spec: apiTokensSpec, jsonFields: ['scopes'] },
];

/** SQLite has no boolean, so 0/1 columns come back as numbers. */
const BOOLEAN_FIELDS = new Set([
  'encrypted',
  'rebootPending',
  'exploited',
  'peerCache',
  'rebootRequired',
  'zeroDay',
  'wakeOfflineFirst',
  'emailed',
  'custom',
  'system',
]);

export function shapeRow(
  row: Record<string, unknown>,
  jsonFields: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (BOOLEAN_FIELDS.has(key) && typeof value === 'number') out[key] = value === 1;
    else if (jsonFields.includes(key) && typeof value === 'string') out[key] = safeParse(value);
    else out[key] = value;
  }
  return out;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Two constraints, both of which must hold. Either may be absent. */
function both(a?: WhereClause, b?: WhereClause): WhereClause | undefined {
  if (!a) return b;
  if (!b) return a;
  return { sql: `(${a.sql}) AND (${b.sql})`, params: [...a.params, ...b.params] };
}

export function registerResourceRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  for (const resource of RESOURCES) {
    const { path, spec, zoneScoped, jsonFields, derive, scopeFrom, envelope, shape } = resource;
    const dress = (row: Record<string, unknown>): Record<string, unknown> => {
      const shaped = shapeRow(row, jsonFields);
      return shape ? shape(shaped) : shaped;
    };

    app.get(`${basePath}/${path}`, async (request) => {
      const roleScope = zoneScoped && request.auth ? zoneScope(request.auth) : undefined;
      const query = toListQuery(request);
      if (derive) derive(db, query.filters ?? {});
      const own = scopeFrom ? scopeFrom(db, query.filters ?? {}) : undefined;
      const scope = both(roleScope, own);
      const result = listRows<Record<string, unknown>>(db, spec, query, scope ? { scope } : {});
      return {
        items: result.items.map(dress),
        page: result.page,
        ...(envelope ? envelope(db) : {}),
      };
    });

    // One detail route per resource, reading through the same spec so a
    // projection or a zone scope cannot be bypassed by asking for the id.
    const idParam = `${path.split('/').pop() ?? 'item'}Id`.replace(/s(Id)$/, '$1');
    app.get(`${basePath}/${path}/:${idParam}`, async (request) => {
      const params = request.params as Record<string, string>;
      const id = params[idParam];
      const scope = zoneScoped && request.auth ? zoneScope(request.auth) : undefined;

      const result = listRows<Record<string, unknown>>(
        db,
        spec,
        { limit: 1, filters: { id } },
        scope ? { scope } : {},
      );
      const row = result.items[0];
      // Outside the caller's zones is 404, not 403: a 403 would confirm the id exists.
      if (!row) throw notFound();
      return dress(row);
    });
  }
}
