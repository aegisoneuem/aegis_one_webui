import type { FastifyInstance } from 'fastify';
import { badRequest, type Db } from '@aegis/mock-core';

/**
 * The series behind one custom widget.
 *
 * Nothing in the contract could answer "count of devices by department where
 * encryption is off": the list endpoints are row-oriented and
 * `CustomReportInput` is columns, filter and sort. So this is a new endpoint,
 * proposed in docs/custom-widget-proposal.md before it was written.
 *
 * The same endpoint serves the wizard's live preview and the widget on the
 * page. That is deliberate — a preview computed one way and a widget computed
 * another is a preview that lies, which is exactly what the reference's own
 * "LIVE PREVIEW · SAME AS ON OVERVIEW" label is promising against.
 *
 * **No caller string ever reaches SQL.** A dimension, a number and a filter
 * field are looked up in the catalogue below and only ever contribute the
 * column text this file holds; an operator is looked up in a fixed map; a
 * value is always a bound parameter. A field the catalogue does not have is a
 * 400 that names it, not a silently dropped clause.
 */

interface Field {
  column: string;
  label: string;
}

interface Source {
  label: string;
  /** What one row is, for the middle of a donut. */
  unit: string;
  from: string;
  dimensions: Record<string, Field>;
  numbers: Record<string, Field>;
  /** Columns the Overview's own scope bar narrows by, where the source has them. */
  scope?: { zone?: string; platform?: string; department?: string };
}

const SOURCES: Record<string, Source> = {
  devices: {
    label: 'Devices',
    unit: 'devices',
    from: 'devices d',
    scope: { zone: 'd.zone_id', platform: 'd.os_family', department: 'd.department' },
    dimensions: {
      osName: { column: 'd.os_name', label: 'Operating System' },
      osFamily: { column: 'd.os_family', label: 'Platform' },
      zoneName: { column: 'd.zone_name', label: 'Location' },
      department: { column: 'd.department', label: 'Department' },
      kind: { column: 'd.kind', label: 'Device Type' },
      status: { column: 'd.status', label: 'Connection' },
      manufacturer: { column: 'd.manufacturer', label: 'Manufacturer' },
      model: { column: 'd.model', label: 'Model' },
      architecture: { column: 'd.architecture', label: 'Architecture' },
      agentVersion: { column: 'd.agent_version', label: 'Agent Version' },
      encrypted: { column: 'd.encrypted', label: 'Disk Encryption' },
      antivirusOk: { column: 'd.antivirus_ok', label: 'Antivirus' },
      firewallOk: { column: 'd.firewall_ok', label: 'Firewall' },
      rebootPending: { column: 'd.reboot_pending', label: 'Reboot Pending' },
      primaryUserName: { column: 'd.primary_user_name', label: 'User' },
    },
    numbers: {
      compliancePct: { column: 'd.compliance_pct', label: 'Compliance %' },
      dexScore: { column: 'd.dex_score', label: 'DEX Score' },
      diskFreePct: { column: 'd.disk_free_pct', label: 'Free Disk %' },
      pendingPatches: { column: 'd.pending_patches', label: 'Missing Patches' },
      criticalVulns: { column: 'd.critical_vulns', label: 'Open Vulnerabilities' },
      ramGb: { column: 'd.ram_gb', label: 'RAM (GB)' },
      configPassPct: { column: 'd.config_pass_pct', label: 'Config Pass %' },
    },
  },
  patches: {
    label: 'Patches',
    unit: 'patches',
    from: 'patches p',
    dimensions: {
      platform: { column: 'p.platform', label: 'Platform' },
      severity: { column: 'p.severity', label: 'Severity' },
      category: { column: 'p.category', label: 'Category' },
      source: { column: 'p.source', label: 'Source' },
      approval: { column: 'p.approval', label: 'Approval' },
      ring: { column: 'p.ring', label: 'Patch Ring' },
    },
    numbers: {
      endpointsMissing: { column: 'p.missing_count', label: 'Endpoints Missing' },
      installedCount: { column: 'p.installed_count', label: 'Installed' },
      failedCount: { column: 'p.failed_count', label: 'Failed' },
    },
  },
  deployments: {
    label: 'Deployments',
    unit: 'deployments',
    from: 'deployments dp',
    dimensions: {
      type: { column: 'dp.type', label: 'Action Type' },
      status: { column: 'dp.status', label: 'Status' },
      triggeredBy: { column: 'dp.triggered_by', label: 'Triggered By' },
    },
    numbers: {
      targetCount: { column: 'dp.target_count', label: 'Targets' },
      done: { column: 'dp.done', label: 'Completed' },
      failed: { column: 'dp.failed', label: 'Failed' },
    },
  },
  software: {
    label: 'Software Catalog',
    unit: 'titles',
    from: 'software s',
    dimensions: {
      category: { column: 's.category', label: 'Category' },
      publisher: { column: 's.publisher', label: 'Publisher' },
      platform: { column: 's.platform', label: 'Platform' },
      state: { column: 's.state', label: 'State' },
    },
    numbers: {
      installCount: { column: 's.install_count', label: 'Installs' },
      outdatedCount: { column: 's.outdated_count', label: 'Outdated Installs' },
      seats: { column: 's.seats', label: 'Seats' },
    },
  },
  checks: {
    label: 'Compliance Checks',
    unit: 'checks',
    from: 'config_checks c',
    dimensions: {
      category: { column: 'c.category', label: 'Category' },
      platform: { column: 'c.platform', label: 'Platform' },
      severity: { column: 'c.severity', label: 'Severity' },
    },
    numbers: {
      passCount: { column: 'c.pass_count', label: 'Passing Devices' },
      failCount: { column: 'c.fail_count', label: 'Failing Devices' },
      compliancePct: { column: 'c.compliance_pct', label: 'Compliance %' },
    },
  },
  'software-installs': {
    label: 'Software Installs',
    unit: 'installs',
    // One row is one installation, so the title has to come from the catalogue
    // beside it; grouping by application is the whole point of this source.
    from: 'device_software ds JOIN software s ON s.id = ds.software_id JOIN devices d ON d.id = ds.device_id',
    scope: { zone: 'd.zone_id', platform: 'd.os_family', department: 'd.department' },
    dimensions: {
      title: { column: 's.title', label: 'Application' },
      publisher: { column: 's.publisher', label: 'Publisher' },
      category: { column: 's.category', label: 'Category' },
      outdated: { column: 'ds.outdated', label: 'Version Status' },
      zoneName: { column: 'd.zone_name', label: 'Location' },
      department: { column: 'd.department', label: 'Department' },
    },
    numbers: {},
  },
};

/** The nine the reference offers, and the SQL each one means. */
const OPS: Record<string, (column: string, value: string) => { sql: string; params: unknown[] }> = {
  eq: (c, v) => ({ sql: `${c} = ?`, params: [v] }),
  ne: (c, v) => ({ sql: `${c} != ?`, params: [v] }),
  in: (c, v) => {
    const parts = v
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length === 0) throw badRequest('"is any of" needs at least one value.');
    return { sql: `${c} IN (${parts.map(() => '?').join(', ')})`, params: parts };
  },
  like: (c, v) => ({ sql: `${c} LIKE ?`, params: [`%${v}%`] }),
  nlike: (c, v) => ({ sql: `(${c} IS NULL OR ${c} NOT LIKE ?)`, params: [`%${v}%`] }),
  gt: (c, v) => ({ sql: `${c} > ?`, params: [numberOf(v)] }),
  lt: (c, v) => ({ sql: `${c} < ?`, params: [numberOf(v)] }),
  empty: (c) => ({ sql: `(${c} IS NULL OR ${c} = '')`, params: [] }),
  notEmpty: (c) => ({ sql: `(${c} IS NOT NULL AND ${c} != '')`, params: [] }),
};

function numberOf(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`"${value}" is not a number to compare against.`);
  return n;
}

export interface WidgetScope {
  zone?: string | undefined;
  platform?: string | undefined;
  department?: string | undefined;
}

interface Definition {
  source: string;
  measure: { agg: string; field?: string };
  views: { groupBy?: string; chart: string; sort?: string; limit?: number }[];
  hideNotSet?: boolean;
  filter?: { match: string; rules: { field: string; op: string; value?: string }[] };
}

function fieldOf(source: Source, id: string, kind: 'dimension' | 'number'): Field {
  const found = kind === 'dimension' ? source.dimensions[id] : source.numbers[id];
  if (!found) {
    throw badRequest(`${source.label} has no ${kind} called "${id}".`);
  }
  return found;
}

/** A filter field may be either, because both are columns on the same row. */
function filterField(source: Source, id: string): Field {
  const found = source.dimensions[id] ?? source.numbers[id];
  if (!found) throw badRequest(`${source.label} has no field called "${id}".`);
  return found;
}

export function runWidget(
  db: Db,
  definition: Definition,
  scope: WidgetScope,
): { total: number; matched: number; unit: string; series: unknown[] } {
  const source = SOURCES[definition.source];
  if (!source)
    throw badRequest(`"${definition.source}" is not a subject a widget can be built on.`);

  const where: string[] = [];
  const params: unknown[] = [];

  // The Overview's own scope bar, where this source carries those columns.
  // Where it does not, the widget is estate-wide and the console says so
  // rather than pretending the bar narrowed it.
  if (source.scope) {
    for (const [key, column] of [
      ['zone', source.scope.zone],
      ['platform', source.scope.platform],
      ['department', source.scope.department],
    ] as const) {
      const value = scope[key];
      if (value && column) {
        where.push(`${column} = ?`);
        params.push(value);
      }
    }
  }
  const scopeSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM ${source.from}${scopeSql}`).get(...params) as {
      n: number;
    }
  ).n;

  // The widget's own rules, ANDed or ORed as the definition says and always
  // bracketed, so one OR cannot swallow the scope above it.
  const rules = definition.filter?.rules ?? [];
  if (rules.length > 20) throw badRequest('A widget may have at most twenty filter rules.');
  const ruleSql: string[] = [];
  for (const rule of rules) {
    const column = filterField(source, rule.field).column;
    const build = OPS[rule.op];
    if (!build) throw badRequest(`"${rule.op}" is not a filter operator.`);
    const clause = build(column, rule.value ?? '');
    ruleSql.push(clause.sql);
    params.push(...clause.params);
  }
  const joiner = definition.filter?.match === 'any' ? ' OR ' : ' AND ';
  const allWhere = [...where, ...(ruleSql.length ? [`(${ruleSql.join(joiner)})`] : [])];
  const fullWhere = allWhere.length ? ` WHERE ${allWhere.join(' AND ')}` : '';

  const matched = (
    db.prepare(`SELECT COUNT(*) AS n FROM ${source.from}${fullWhere}`).get(...params) as {
      n: number;
    }
  ).n;

  const view = definition.views[0];
  if (!view) throw badRequest('A widget needs at least one view.');

  const agg = definition.measure.agg;
  let valueSql: string;
  if (agg === 'count' || agg === 'pct') {
    valueSql = 'COUNT(*)';
  } else {
    if (!definition.measure.field) {
      throw badRequest(`The ${agg} measure needs a field to measure.`);
    }
    const number = fieldOf(source, definition.measure.field, 'number');
    const fn = { avg: 'AVG', sum: 'SUM', min: 'MIN', max: 'MAX' }[agg];
    if (!fn) throw badRequest(`"${agg}" is not a measure.`);
    valueSql = `${fn}(${number.column})`;
  }

  // No group-by is the reference's "None (KPI number)": one figure, not a
  // series.
  if (!view.groupBy) {
    const row = db
      .prepare(`SELECT ${valueSql} AS v FROM ${source.from}${fullWhere}`)
      .get(...params) as {
      v: number | null;
    };
    const value = agg === 'pct' ? (total ? (matched / total) * 100 : 0) : (row.v ?? 0);
    return {
      total,
      matched,
      unit: source.unit,
      series: [{ key: 'total', label: source.label, value: round(value), pct: 100 }],
    };
  }

  const dimension = fieldOf(source, view.groupBy, 'dimension');
  const notSet = definition.hideNotSet
    ? ` AND ${dimension.column} IS NOT NULL AND ${dimension.column} != ''`
    : '';
  const grouped = `${fullWhere}${fullWhere ? notSet : notSet ? ` WHERE 1 = 1${notSet}` : ''}`;
  const order = view.sort === 'name' ? 'k ASC' : 'v DESC';
  // The limit is one of four values the contract allows, so it is a literal
  // from a closed set rather than anything a caller typed.
  const limit = [0, 5, 10, 15].includes(view.limit ?? 0) ? (view.limit ?? 0) : 0;
  const limitSql = limit > 0 ? ` LIMIT ${limit}` : ' LIMIT 200';

  const rows = db
    .prepare(
      `SELECT ${dimension.column} AS k, ${valueSql} AS v
       FROM ${source.from}${grouped}
       GROUP BY ${dimension.column}
       ORDER BY ${order}${limitSql}`,
    )
    .all(...params) as { k: unknown; v: number | null }[];

  const sum = rows.reduce((acc, r) => acc + (r.v ?? 0), 0);
  /*
   * A share only means something when the parts add up to the whole. Counts
   * do; an average, a minimum and a maximum do not, so those carry no pct
   * rather than one that would read as a fifth each across five groups.
   */
  const shareable = agg === 'count' || agg === 'pct' || agg === 'sum';
  const series = rows.map((r) => {
    const value = agg === 'pct' ? (matched ? ((r.v ?? 0) / matched) * 100 : 0) : (r.v ?? 0);
    return {
      key: String(r.k ?? ''),
      label: labelOf(r.k),
      value: round(value),
      ...(shareable ? { pct: round(sum ? ((r.v ?? 0) / sum) * 100 : 0) } : {}),
    };
  });

  return { total, matched, unit: source.unit, series };
}

/** SQLite has no booleans; a 0/1 column reads as Yes and No, not as 0 and 1. */
function labelOf(key: unknown): string {
  if (key === null || key === undefined || key === '') return 'Not set';
  if (key === 0 || key === 1) return key === 1 ? 'Yes' : 'No';
  return String(key);
}

const round = (n: number): number => Math.round(n * 10) / 10;

export function registerWidgetDataRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.get(`${basePath}/overview/widget-fields`, async () => ({
    sources: Object.entries(SOURCES).map(([id, source]) => ({
      id,
      label: source.label,
      unit: source.unit,
      dimensions: Object.entries(source.dimensions).map(([fid, f]) => ({
        id: fid,
        label: f.label,
      })),
      numbers: Object.entries(source.numbers).map(([fid, f]) => ({ id: fid, label: f.label })),
    })),
  }));

  app.post(`${basePath}/overview/widget-data`, async (request) => {
    const body = request.body as {
      definition: Definition;
      zone?: string;
      platform?: string;
      department?: string;
    };
    if (!body?.definition) throw badRequest('A widget definition is required.');
    return runWidget(db, body.definition, {
      zone: body.zone,
      platform: body.platform,
      department: body.department,
    });
  });
}
