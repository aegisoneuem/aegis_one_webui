import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { notFound, TtlCache, type Db } from '@aegis/mock-core';
import { REPORTS, type ReportDef, type ReportSource } from '../seed/report-catalog';

/**
 * Reports: the library of twenty standard reports and the engine that runs
 * them.
 *
 * A report is a row source, an ordered column list and a handful of group-by
 * charts. That is how the reference models one, and it is why twenty reports
 * need one engine here rather than twenty handlers: the only thing that
 * varies between them is which rows they list and which fields they group by.
 *
 * Every report lists computers joined to whatever the report is about — an
 * installation, a missing update, an open finding, a USB connection — so
 * every report carries the full device column set, which is what makes the
 * grid worth exporting.
 */

/**
 * Each of the reference's field names, as SQL over the joined row.
 *
 * Keeping this in one place is the point: a report definition names fields,
 * never columns, so adding a report cannot invent a column that does not
 * exist, and renaming an estate column is one edit here.
 */
const DEVICE_FIELDS: Readonly<Record<string, string>> = {
  name: 'd.hostname',
  hostname: 'LOWER(d.hostname)',
  os: 'd.os_name',
  osVersion: 'd.os_version',
  osBuild: 'd.os_build',
  ip: 'd.ip',
  mac: 'd.mac',
  dns: 'd.dns_name',
  dnsServer: 'd.dns_server',
  location: 'd.zone_name',
  user: 'd.primary_user_name',
  lastLogon: 'd.primary_user_name',
  department: 'd.department',
  status: `CASE d.status WHEN 'online' THEN 'Online' WHEN 'offline' THEN 'Offline'
                         ELSE 'Pending restart' END`,
  lastSeen: 'd.last_seen_at',
  type: `CASE d.kind WHEN 'server' THEN 'Server' WHEN 'laptop' THEN 'Laptop' ELSE 'Desktop' END`,
  manufacturer: 'd.manufacturer',
  model: 'd.model',
  serial: 'd.serial',
  ramGB: 'd.ram_gb',
  lastBoot: 'd.last_boot_at',
  agent: 'd.agent_version',
  deviceId: 'd.id',
  assetTag: 'd.asset_tag',
  domain: 'd.domain',
  ownership: 'd.ownership',
  chassis: 'd.chassis',
  arch: 'd.architecture',
  osInstall: 'd.os_install_date',
  uptime: 'd.uptime',
  timezone: 'd.timezone',
  processor: 'd.cpu',
  cores: 'd.cpu_cores',
  capacity: 'd.disk_total_gb',
  free: 'CAST(d.disk_total_gb * d.disk_free_pct / 100.0 AS INTEGER)',
  freePct: 'd.disk_free_pct',
  biosVersion: 'd.bios_version',
  biosDate: 'd.bios_date',
  tpm: 'd.tpm',
  secureBoot: 'd.secure_boot',
  gpu: 'd.gpu',
  battery: 'd.battery',
  purchase: 'd.purchase_date',
  warranty: 'd.warranty_until',
  network: 'd.network_type',
  subnet: 'd.subnet',
  gateway: 'd.gateway',
  ssid: 'd.ssid',
  publicIp: 'd.public_ip',
  vpn: 'd.vpn',
  av: `CASE WHEN d.antivirus_ok = 1 THEN 'Protected' ELSE 'Not protected' END`,
  protection: 'd.av_product',
  avVersion: 'd.av_definitions',
  lastScan: 'd.last_scan_at',
  encryption: `CASE WHEN d.encrypted = 1 THEN 'Encrypted' ELSE 'Not encrypted' END`,
  encryptionType: 'd.encryption_type',
  firewall: `CASE WHEN d.firewall_ok = 1 THEN 'On' ELSE 'Off' END`,
  usb: 'd.usb_storage',
  localAdmins: 'd.local_admins',
  risk: `CASE WHEN d.critical_vulns > 0 OR d.encrypted = 0 OR d.antivirus_ok = 0
              THEN 'High risk' WHEN d.pending_patches > 2 THEN 'Medium risk'
              ELSE 'Low risk' END`,
  openVulns: 'd.critical_vulns',
  missing: 'd.pending_patches',
  critMissing: `CASE WHEN d.pending_patches >= 3 THEN 1 ELSE 0 END`,
  patch: `CASE WHEN d.pending_patches = 0 THEN 'Up to date' ELSE 'Updates pending' END`,
  lastPatched: 'd.last_patched_at',
  ring: 'd.patch_ring',
  rebootPending: `CASE WHEN d.reboot_pending = 1 THEN 'Yes' ELSE 'No' END`,
  agentHealth: 'd.agent_health',
  contentSource: 'd.content_source',
  compliance: 'd.config_pass_pct',
  failedChecks: 'd.config_fail',
  checks: `CASE WHEN d.config_pass_pct >= 90 THEN 'All passing'
                WHEN d.config_pass_pct >= 75 THEN 'Some failing' ELSE 'Many failing' END`,
  dexScore: 'd.dex_score',
  cpu: 'd.cpu_pct',
  ram: 'd.memory_pct',
  boot: 'd.boot_seconds',
  performance: `CASE WHEN d.cpu_pct >= 90 OR d.memory_pct >= 90 OR d.boot_seconds >= 90
                     THEN 'Poor' WHEN d.cpu_pct >= 75 OR d.memory_pct >= 75 OR d.boot_seconds >= 60
                     THEN 'Needs attention' ELSE 'Normal' END`,
  cpuBand: `CASE WHEN d.cpu_pct >= 90 THEN '90% or more' WHEN d.cpu_pct >= 75 THEN '75-89%'
                 WHEN d.cpu_pct >= 50 THEN '50-74%' ELSE 'Below 50%' END`,
  ramBand: `CASE WHEN d.memory_pct >= 90 THEN '90% or more' WHEN d.memory_pct >= 75 THEN '75-89%'
                 WHEN d.memory_pct >= 50 THEN '50-74%' ELSE 'Below 50%' END`,
  bootBand: `CASE WHEN d.boot_seconds >= 90 THEN '90 seconds or more'
                  WHEN d.boot_seconds >= 60 THEN '60-89 seconds' ELSE 'Under 60 seconds' END`,
  storage: `CASE WHEN d.disk_free_pct <= 10 THEN 'Low space'
                 WHEN d.disk_free_pct <= 25 THEN 'Watch' ELSE 'Healthy' END`,
  spaceBand: `CASE WHEN d.disk_free_pct <= 10 THEN '10% or less'
                   WHEN d.disk_free_pct <= 25 THEN '11-25%' ELSE 'Over 25%' END`,
  lastSeenGroup: `CASE WHEN julianday('now') - julianday(d.last_seen_at) > 30 THEN 'Over 30 days ago'
                       WHEN julianday('now') - julianday(d.last_seen_at) > 7 THEN 'Over 7 days ago'
                       WHEN julianday('now') - julianday(d.last_seen_at) > 1 THEN 'Over a day ago'
                       ELSE 'Today' END`,
  ready: `CASE WHEN d.config_pass_pct >= 90 AND d.pending_patches = 0 AND d.encrypted = 1
                    AND d.antivirus_ok = 1 AND d.firewall_ok = 1 THEN 'Ready'
               ELSE 'Needs review' END`,
  /*
   * "Last deployment" is a property of the device, not of the row: it is how
   * the newest action sent to this endpoint finished. A device that has never
   * been targeted says so rather than reporting a blank.
   */
  deployment: `COALESCE((SELECT CASE dr2.state WHEN 'succeeded' THEN 'Completed'
                                               WHEN 'failed' THEN 'Failed'
                                               ELSE 'In progress' END
                            FROM deployment_results dr2
                           WHERE dr2.device_id = d.id
                           ORDER BY dr2.finished_at DESC LIMIT 1), 'None')`,
};

/**
 * The fields each child source adds. A field named by a report but absent
 * here and in DEVICE_FIELDS is rejected at startup rather than silently
 * returning null.
 */
const SOURCE_FIELDS: Readonly<Record<ReportSource, Readonly<Record<string, string>>>> = {
  devices: {},
  software: {
    app: 's.title',
    version: 'ds.version',
    publisher: 's.publisher',
    category: 's.category',
    versionStatus: `CASE WHEN ds.outdated = 1 THEN 'Out of date' ELSE 'Current' END`,
    detected: 'ds.installed_at',
  },
  licenses: {
    app: 's.title',
    license: `CASE WHEN s.install_count > s.seats THEN 'Over-allocated'
                   WHEN s.install_count = s.seats THEN 'Fully assigned' ELSE 'Assigned' END`,
    renewal: `strftime('%b %Y', s.renews_at)`,
    version: 'ds.version',
    publisher: 's.publisher',
    category: 's.category',
    detected: 'ds.installed_at',
  },
  updates: {
    update: 'p.title',
    severity: `UPPER(SUBSTR(p.severity, 1, 1)) || SUBSTR(p.severity, 2)`,
    updateStatus: `CASE dp.state WHEN 'pending' THEN 'Pending' WHEN 'failed' THEN 'Failed'
                                 ELSE 'Installed' END`,
    detected: 'p.released_at',
    app: 'p.title',
  },
  'update-results': {
    update: 'p.title',
    result: `CASE dp.state WHEN 'installed' THEN 'Successful' WHEN 'failed' THEN 'Failed'
                           ELSE 'Not finished' END`,
    date: `date(dp.updated_at)`,
    severity: `UPPER(SUBSTR(p.severity, 1, 1)) || SUBSTR(p.severity, 2)`,
    updateStatus: `CASE dp.state WHEN 'pending' THEN 'Pending' WHEN 'failed' THEN 'Failed'
                                 ELSE 'Installed' END`,
    detail: 'p.kb',
  },
  issues: {
    issue: 'v.title',
    severity: `UPPER(SUBSTR(v.severity, 1, 1)) || SUBSTR(v.severity, 2)`,
    issueStatus: `CASE dv.state WHEN 'open' THEN 'Open' WHEN 'accepted' THEN 'Accepted'
                                ELSE 'Remediated' END`,
    detected: 'dv.first_seen_at',
    detail: 'v.affects',
    date: `date(dv.first_seen_at)`,
  },
  usb: {
    peripheral: 'ue.peripheral',
    usbName: 'ue.usb_name',
    usbAction: 'ue.action',
    action: 'ue.action',
    result: 'ue.action',
    date: `date(ue.occurred_at)`,
    time: 'ue.occurred_at',
  },
  deployments: {
    job: 'dep.name',
    app: 'dep.package',
    action: `REPLACE(UPPER(SUBSTR(dep.type, 1, 1)) || SUBSTR(dep.type, 2), '-', ' ')`,
    result: `CASE dr.state WHEN 'succeeded' THEN 'Completed' WHEN 'failed' THEN 'Failed'
                           ELSE 'In progress' END`,
    deployment: `CASE dr.state WHEN 'succeeded' THEN 'Completed' WHEN 'failed' THEN 'Failed'
                               ELSE 'In progress' END`,
    date: `date(dr.finished_at)`,
    detail: 'dr.message',
    time: 'dr.finished_at',
  },
  activity: {
    action: `UPPER(SUBSTR(ljr.action_type, 1, 1))
             || REPLACE(LOWER(SUBSTR(ljr.action_type, 2)), '_', ' ')`,
    result: `CASE ljr.status WHEN 'succeeded' THEN 'Completed' WHEN 'failed' THEN 'Failed'
                             WHEN 'timed-out' THEN 'Timed out' WHEN 'offline' THEN 'Not reached'
                             ELSE 'In progress' END`,
    date: `date(ljr.finished_at)`,
    time: 'ljr.finished_at',
    detail: 'ljr.reason',
    job: 'lj.title',
  },
};

/**
 * Where each source's rows come from. Every one starts at a device, so the
 * device column set is available to every report.
 */
const SOURCE_FROM: Readonly<Record<ReportSource, string>> = {
  devices: `devices d`,
  software: `device_software ds
               JOIN devices d ON d.id = ds.device_id
               JOIN software s ON s.id = ds.software_id`,
  licenses: `device_software ds
               JOIN software s ON s.id = ds.software_id
               JOIN devices d ON d.id = ds.device_id`,
  updates: `device_patches dp
              JOIN devices d ON d.id = dp.device_id
              JOIN patches p ON p.id = dp.patch_id`,
  'update-results': `device_patches dp
                       JOIN devices d ON d.id = dp.device_id
                       JOIN patches p ON p.id = dp.patch_id`,
  issues: `device_vulnerabilities dv
             JOIN devices d ON d.id = dv.device_id
             JOIN vulnerabilities v ON v.id = dv.vulnerability_id`,
  usb: `usb_events ue JOIN devices d ON d.id = ue.device_id`,
  deployments: `deployment_results dr
                  JOIN devices d ON d.id = dr.device_id
                  JOIN deployments dep ON dep.id = dr.deployment_id`,
  activity: `live_job_results ljr
               JOIN devices d ON d.id = ljr.device_id
               JOIN live_jobs lj ON lj.id = ljr.job_id`,
};

/** Rows a source always excludes, independent of the report. */
const SOURCE_WHERE: Readonly<Partial<Record<ReportSource, string>>> = {
  updates: `dp.state IN ('pending', 'failed')`,
  licenses: `s.seats > 0`,
  issues: `dv.state <> 'resolved'`,
};

/** The whole WHERE for one report. */
function whereOf(report: ReportDef): string {
  const parts = [SOURCE_WHERE[report.source], report.filter].filter(Boolean);
  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

function sqlFor(report: ReportDef, field: string): string | undefined {
  return SOURCE_FIELDS[report.source][field] ?? DEVICE_FIELDS[field];
}

/**
 * Checked once, at startup. A report that names a field with no SQL behind it
 * is a bug in the catalogue, and it should stop the server rather than serve a
 * column of nulls.
 */
function assertCatalogue(): void {
  const missing: string[] = [];
  for (const report of REPORTS) {
    for (const column of report.columns) {
      if (!sqlFor(report, column.field)) missing.push(`${report.id}.${column.field}`);
    }
    for (const chart of report.charts) {
      if (!sqlFor(report, chart.field)) missing.push(`${report.id} chart ${chart.field}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `report catalogue names ${missing.length} unmapped fields: ${missing.join(', ')}`,
    );
  }
}

const findReport = (id: string): ReportDef | undefined => REPORTS.find((r) => r.id === id);

const count = (db: Db, sql: string, ...params: unknown[]): number =>
  Number((db.prepare(sql).get(...params) as { n: number } | undefined)?.n ?? 0);

/** The row count a report would return, which is the figure on its card. */
function totalOf(db: Db, report: ReportDef): number {
  return count(db, `SELECT COUNT(*) AS n FROM ${SOURCE_FROM[report.source]} ${whereOf(report)}`);
}

/** One chart: the row count grouped by a field, largest group first. */
function chartOf(
  db: Db,
  report: ReportDef,
  field: string,
  limit = 10,
): { label: string; value: number }[] {
  const expr = sqlFor(report, field);
  if (!expr) return [];
  return (
    db
      .prepare(
        `SELECT ${expr} AS label, COUNT(*) AS value
           FROM ${SOURCE_FROM[report.source]} ${whereOf(report)}
          GROUP BY 1 ORDER BY value DESC, label LIMIT ?`,
      )
      .all(limit) as { label: unknown; value: number }[]
  ).map((r) => ({ label: r.label === null ? '—' : String(r.label), value: Number(r.value) }));
}

/**
 * The library's figures sweep every source — six hundred thousand
 * installations among them — and are the same for every reader, so they are
 * computed once and held briefly. The favourites are per user and cheap, so
 * they stay outside the cache and are merged on top.
 */
const library = new TtlCache<LibraryCard[]>({ ttlMs: 60_000, maxEntries: 4 });

interface LibraryCard {
  id: string;
  title: string;
  category: string;
  description: string;
  unit: string;
  charts: number;
  columns: number;
  total: number;
  headline: { label: string; value: string };
  secondary?: { label: string; value: string };
  preview: { label: string; value: number }[];
}

export function registerReportRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  assertCatalogue();

  /**
   * The library. Each card carries the live row count and the largest group
   * of its first chart, which is the headline the reference prints under the
   * title — so a card is never a label with no figure behind it.
   */
  app.get(`${basePath}/reports`, async (request) => {
    const email = request.auth?.email ?? '';
    const starred = new Set(
      (
        db
          .prepare(`SELECT report_id AS id FROM report_favorites WHERE user_email = ?`)
          .all(email) as { id: string }[]
      ).map((r) => r.id),
    );

    const cards = library.get('cards', () =>
      REPORTS.map<LibraryCard>((report) => {
        const total = totalOf(db, report);
        const first = report.charts[0];
        // Five groups is what fits the tile; the reference draws the same
        // first breakdown as a donut beside the figure.
        const preview = first ? chartOf(db, report, first.field, 5) : [];
        const top = preview[0];
        return {
          id: report.id,
          title: report.title,
          category: report.category,
          description: report.description,
          unit: report.unit,
          charts: report.charts.length,
          columns: report.columns.length,
          total,
          headline: { label: report.unit, value: String(total) },
          ...(top === undefined
            ? {}
            : { secondary: { label: top.label, value: String(top.value) } }),
          preview,
        };
      }),
    );

    return cards.map((card) => ({ ...card, favorite: starred.has(card.id) }));
  });

  /**
   * One report's three counters and its charts. The counters are the first
   * chart's own groups, which is what the reference puts above the panels.
   */
  app.get(`${basePath}/reports/:reportId/summary`, async (request) => {
    const { reportId } = request.params as { reportId: string };
    const report = findReport(reportId);
    if (!report) throw notFound();

    const total = totalOf(db, report);
    const charts = report.charts.map((chart) => ({
      title: chart.title,
      field: chart.field,
      data: chartOf(db, report, chart.field),
    }));

    // "N in this report", then the two largest groups of the first chart.
    const lead = charts[0]?.data ?? [];
    return {
      id: report.id,
      title: report.title,
      description: report.description,
      unit: report.unit,
      total,
      kpis: [
        {
          label: `${report.unit.charAt(0).toUpperCase()}${report.unit.slice(1)} in this report`,
          value: total,
        },
        ...lead.slice(0, 2).map((g) => ({ label: g.label, value: g.value })),
      ],
      charts,
      columns: report.columns.map((c) => ({ id: c.field, header: c.header })),
    };
  });

  /** The report's rows, paged, in the catalogue's own column order. */
  app.get(`${basePath}/reports/:reportId/run`, async (request) => {
    const { reportId } = request.params as { reportId: string };
    const report = findReport(reportId);
    if (!report) throw notFound();

    const query = request.query as { cursor?: string; limit?: string; q?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;
    const search = (query.q ?? '').trim();

    const select = report.columns
      .map((c) => `${sqlFor(report, c.field) ?? `''`} AS "${c.field}"`)
      .join(', ');

    const where = whereOf(report);
    const filtered = search
      ? `${where ? `${where} AND` : 'WHERE'} (d.hostname LIKE ? OR d.ip LIKE ? OR d.primary_user_name LIKE ?)`
      : where;
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    const rows = db
      .prepare(
        `SELECT ${select} FROM ${SOURCE_FROM[report.source]} ${filtered}
          ORDER BY d.hostname LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];

    const total = count(
      db,
      `SELECT COUNT(*) AS n FROM ${SOURCE_FROM[report.source]} ${filtered}`,
      ...params,
    );

    return {
      columns: report.columns.map((c) => ({ id: c.field, header: c.header })),
      rows,
      page: {
        nextCursor: offset + rows.length < total ? String(offset + rows.length) : null,
        total,
      },
    };
  });

  app.put(`${basePath}/reports/:reportId/favorite`, async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    if (!findReport(reportId)) throw notFound();
    const { favorite } = request.body as { favorite: boolean };
    const email = request.auth?.email ?? '';

    if (favorite) {
      db.prepare(
        `INSERT OR IGNORE INTO report_favorites (report_id, user_email) VALUES (?, ?)`,
      ).run(reportId, email);
    } else {
      db.prepare(`DELETE FROM report_favorites WHERE report_id = ? AND user_email = ?`).run(
        reportId,
        email,
      );
    }
    return reply.code(204).send();
  });

  /**
   * An export is a job, as it is everywhere else in this console: the file is
   * built server-side and fetched from /exports/{id}.
   */
  app.post(`${basePath}/reports/:reportId/export`, async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    const report = findReport(reportId);
    if (!report) throw notFound();
    const { format } = request.body as { format: string };

    return reply.code(202).send({
      id: `exp-${randomUUID()}`,
      status: 'queued',
      format,
      rows: totalOf(db, report),
      requestedAt: new Date().toISOString(),
    });
  });
}
