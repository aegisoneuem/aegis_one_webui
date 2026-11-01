import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  listRows,
  notFound,
  zoneScope,
  type Db,
  type ListQuery,
  type TableSpec,
} from '@aegis/mock-core';
import {
  apiTokensSpec,
  auditSpec,
  configChecksSpec,
  deploymentsSpec,
  devicesSpec,
  enrollmentTokensSpec,
  groupsSpec,
  integrationsSpec,
  liveJobsSpec,
  logBundlesSpec,
  patchesSpec,
  peersSpec,
  reportsSpec,
  softwareSpec,
  usersSpec,
  vulnerabilitiesSpec,
  zonesSpec,
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
}

const RESOURCES: readonly ResourceDef[] = [
  { path: 'devices', spec: devicesSpec, zoneScoped: true },
  { path: 'software', spec: softwareSpec },
  { path: 'patches', spec: patchesSpec },
  { path: 'vulnerabilities', spec: vulnerabilitiesSpec },
  { path: 'deployments', spec: deploymentsSpec },
  { path: 'liveops/script-jobs', spec: liveJobsSpec },
  { path: 'groups', spec: groupsSpec },
  { path: 'profiles/checks', spec: configChecksSpec },
  { path: 'sites', spec: zonesSpec },
  { path: 'peercache/peers', spec: peersSpec, zoneScoped: true },
  { path: 'liveops/logs', spec: logBundlesSpec },
  { path: 'liveops/audit', spec: auditSpec },
  { path: 'reports', spec: reportsSpec },
  { path: 'integrations', spec: integrationsSpec },
  { path: 'admin/users', spec: usersSpec, jsonFields: ['zoneIds'] },
  { path: 'admin/tokens', spec: apiTokensSpec, jsonFields: ['scopes'] },
  { path: 'enrollment/tokens', spec: enrollmentTokensSpec },
];

/** SQLite has no boolean, so 0/1 columns come back as numbers. */
const BOOLEAN_FIELDS = new Set([
  'encrypted',
  'rebootPending',
  'exploited',
  'peerCache',
  'rebootRequired',
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

export function registerResourceRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  for (const resource of RESOURCES) {
    const { path, spec, zoneScoped, jsonFields } = resource;

    app.get(`${basePath}/${path}`, async (request) => {
      const scope = zoneScoped && request.auth ? zoneScope(request.auth) : undefined;
      const result = listRows<Record<string, unknown>>(
        db,
        spec,
        toListQuery(request),
        scope ? { scope } : {},
      );
      return { items: result.items.map((row) => shapeRow(row, jsonFields)), page: result.page };
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
      return shapeRow(row, jsonFields);
    });
  }
}
