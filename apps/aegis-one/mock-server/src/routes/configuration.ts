import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { notFound, type Db } from '@aegis/mock-core';
import { CHECK_APPLIES_SQL, CHECK_EXCEPTED_SQL, CHECK_PASS_SQL } from '../seed/seed';

/**
 * Configuration Compliance: the summary the five counters and the four
 * widgets read, the check library, the per-device roll-up, the exceptions,
 * the benchmarks and the profiles.
 *
 * Every figure on this page narrows with the Device Group filter, including
 * the counters, so a scope is resolved once per request and every query reads
 * from the matching roll-up — `config_check_groups` for a group, the
 * estate-wide `config_checks` otherwise. The counters and the rows beneath
 * them are therefore the same numbers twice, which is the point: a counter
 * nobody can click through to is a counter nobody can check.
 *
 * A single device's result is never stored. It is derived from the same SQL
 * expression the seed rolled the counts up with, so the drawer's per-device
 * list and the count above it cannot drift apart.
 */

/** The library's own fields, named as the contract's ConfigCheck declares them. */
const CHECK_FIELDS = `c.id, c.title, c.category, c.platform, c.severity, c.expected,
                      c.custom, c.remediable`;

interface CountRow extends Record<string, unknown> {
  n: number;
}

const count = (db: Db, sql: string, ...params: unknown[]): number =>
  ((db.prepare(sql).get(...params) as CountRow | undefined)?.n ?? 0) | 0;

/** The column holding a check's mapping into each framework. */
const FRAMEWORK_COLUMN: Readonly<Record<string, string>> = {
  cis: 'cis',
  stig: 'stig',
  'pci-dss': 'pci',
  hipaa: 'hipaa',
};

const FRAMEWORKS = ['cis', 'stig', 'pci-dss', 'hipaa'] as const;
const PLATFORMS = ['windows', 'macos', 'linux'] as const;

interface CheckRow extends Record<string, unknown> {
  id: string;
  title: string;
  category: string;
  platform: string;
  severity: string;
  expected: string;
  cis: string;
  stig: string;
  pci: string;
  hipaa: string;
  remediable: number;
  custom: number;
  passCount: number;
  failCount: number;
  exceptionCount: number;
  compliancePct: number | null;
  seq?: number;
}

/**
 * Shapes one row into the contract's ConfigCheck. The four framework columns
 * become the `frameworks` array the grid draws as tags, in the page's own
 * order, and the empty ones are dropped rather than sent as blanks.
 */
function shapeCheck(row: CheckRow): Record<string, unknown> {
  const refs: Record<string, string> = {
    cis: row.cis,
    stig: row.stig,
    'pci-dss': row.pci,
    hipaa: row.hipaa,
  };
  // Built field by field rather than spread: the row also carries `seq`,
  // which orders the grid and is not part of the contract's ConfigCheck.
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    platform: row.platform,
    severity: row.severity,
    expected: row.expected,
    compliancePct: row.compliancePct,
    frameworks: FRAMEWORKS.filter((f) => refs[f]).map((f) => ({
      framework: f,
      ref: refs[f] ?? '',
    })),
    passing: row.passCount,
    failing: row.failCount,
    exceptions: row.exceptionCount,
    remediation: row.remediable ? 'automatic' : 'manual',
    custom: row.custom === 1,
  };
}

/** The estate-wide roll-up lives on the check row itself, so no join is needed. */
function scopeCounts(groupId: string | undefined): string {
  return groupId
    ? `g.pass_count AS passCount, g.fail_count AS failCount,
       g.exception_count AS exceptionCount, g.compliance_pct AS compliancePct`
    : `c.pass_count AS passCount, c.fail_count AS failCount,
       c.exception_count AS exceptionCount, c.compliance_pct AS compliancePct`;
}

function scopeFrom(groupId: string | undefined): { from: string; params: string[] } {
  return groupId
    ? {
        from: `config_checks c JOIN config_check_groups g
                 ON g.check_id = c.id AND g.group_id = ?`,
        params: [groupId],
      }
    : { from: `config_checks c`, params: [] };
}

interface CheckQuery {
  cursor?: string;
  limit?: string;
  q?: string;
  framework?: string;
  platform?: string;
  group?: string;
  category?: string;
  severity?: string;
  result?: string;
}

/**
 * The six filters, as SQL. Only the group filter changes the figures; the
 * other five narrow which rows are shown.
 */
function checkFilters(query: CheckQuery): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  const search = (query.q ?? '').trim();
  if (search) {
    where.push(`(c.id LIKE ? OR c.title LIKE ? OR c.category LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const framework = FRAMEWORK_COLUMN[query.framework ?? ''];
  if (framework) where.push(`c.${framework} <> ''`);

  if (query.platform) {
    where.push(`c.platform = ?`);
    params.push(query.platform);
  }
  if (query.category) {
    where.push(`c.category = ?`);
    params.push(query.category);
  }
  if (query.severity) {
    where.push(`c.severity = ?`);
    params.push(query.severity);
  }

  // A result is read off the counts, so it reads from whichever roll-up the
  // scope selected. The aliases below exist in both.
  if (query.result === 'fail') where.push(`failCount > 0`);
  else if (query.result === 'pass') where.push(`failCount = 0 AND passCount > 0`);
  else if (query.result === 'exception') where.push(`exceptionCount > 0`);
  else if (query.result === 'not-applicable') where.push(`passCount + failCount = 0`);

  return { where, params };
}

/** The reference's three bands for a device's compliance. */
const BANDS = `SUM(CASE WHEN config_pass_pct >= 90 THEN 1 ELSE 0 END) AS high,
               SUM(CASE WHEN config_pass_pct >= 75 AND config_pass_pct < 90 THEN 1 ELSE 0 END) AS medium,
               SUM(CASE WHEN config_pass_pct < 75 THEN 1 ELSE 0 END) AS low`;

/**
 * Devices in scope. A device is only in scope once the library has a check
 * for its platform: the estate also holds AIX servers, which are absent from
 * every figure rather than counted as passing.
 */
function deviceScope(groupId: string | undefined): { where: string; params: string[] } {
  const base = `d.config_checks_total > 0`;
  return groupId
    ? {
        where: `${base} AND EXISTS (SELECT 1 FROM group_members gm
                   WHERE gm.group_id = ? AND gm.device_id = d.id)`,
        params: [groupId],
      }
    : { where: base, params: [] };
}

export function registerConfigurationRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.get(`${basePath}/configuration/summary`, async (request) => {
    const query = request.query as { group?: string; platform?: string };
    const groupId = query.group;
    const { from, params: fromParams } = scopeFrom(groupId);
    const counts = scopeCounts(groupId);

    const platformWhere = query.platform ? ` AND c.platform = ?` : '';
    const platformParams = query.platform ? [query.platform] : [];

    const totals = db
      .prepare(
        `SELECT SUM(passCount) AS pass, SUM(failCount) AS fail, COUNT(*) AS checks,
                SUM(CASE WHEN failCount > 0 THEN 1 ELSE 0 END) AS failing,
                SUM(exceptionCount) AS exceptions
           FROM (SELECT ${counts} FROM ${from} WHERE 1 = 1${platformWhere})`,
      )
      .get(...fromParams, ...platformParams) as Record<string, number | null>;

    const pass = Number(totals['pass'] ?? 0);
    const fail = Number(totals['fail'] ?? 0);
    const overallPct = pass + fail > 0 ? Math.round((pass / (pass + fail)) * 100) : 0;

    const byFramework = FRAMEWORKS.map((f) => {
      const column = FRAMEWORK_COLUMN[f] ?? 'cis';
      const row = db
        .prepare(
          `SELECT SUM(passCount) AS pass, SUM(failCount) AS fail
             FROM (SELECT ${counts} FROM ${from}
                    WHERE c.${column} <> ''${platformWhere})`,
        )
        .get(...fromParams, ...platformParams) as Record<string, number | null>;
      const p = Number(row['pass'] ?? 0);
      const q = Number(row['fail'] ?? 0);
      return { framework: f, compliancePct: p + q > 0 ? Math.round((p / (p + q)) * 100) : 0 };
    });

    // By platform the reference reports the devices' own compliance, with the
    // device count underneath, not the checks' — a platform with few devices
    // should not be weighted by how many checks it happens to have.
    const scope = deviceScope(groupId);
    const byPlatform = PLATFORMS.map((platform) => {
      const families =
        platform === 'windows'
          ? `('Windows', 'Windows Server')`
          : platform === 'macos'
            ? `('macOS')`
            : `('Linux')`;
      const row = db
        .prepare(
          `SELECT CAST(ROUND(AVG(d.config_pass_pct)) AS INTEGER) AS pct, COUNT(*) AS n
             FROM devices d WHERE ${scope.where} AND d.os_family IN ${families}`,
        )
        .get(...scope.params) as Record<string, number | null>;
      return {
        platform,
        compliancePct: Number(row['pct'] ?? 0),
        devices: Number(row['n'] ?? 0),
      };
    });

    const bands = db
      .prepare(`SELECT ${BANDS} FROM devices d WHERE ${scope.where}`)
      .get(...scope.params) as Record<string, number | null>;

    const byCategory = (
      db
        .prepare(
          `SELECT c.category AS category, SUM(passCount) AS pass, SUM(failCount) AS fail
             FROM (SELECT c.category, ${counts} FROM ${from}
                    WHERE 1 = 1${platformWhere}) c
            GROUP BY c.category ORDER BY c.category`,
        )
        .all(...fromParams, ...platformParams) as Record<string, unknown>[]
    ).map((r) => {
      const p = Number(r['pass'] ?? 0);
      const q = Number(r['fail'] ?? 0);
      return {
        category: String(r['category']),
        compliancePct: p + q > 0 ? Math.round((p / (p + q)) * 100) : 0,
      };
    });

    // The reference ranks the ten worst by severity first, then by how many
    // devices fail them.
    const topFailing = (
      db
        .prepare(
          `SELECT ${CHECK_FIELDS}, c.cis, c.stig, c.pci, c.hipaa, ${counts}
             FROM ${from}
            WHERE 1 = 1${platformWhere}
            ORDER BY (CASE c.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END),
                     failCount DESC
            LIMIT 10`,
        )
        .all(...fromParams, ...platformParams) as CheckRow[]
    )
      .filter((r) => r.failCount > 0)
      .map(shapeCheck);

    const controls = (
      [
        ['disk-encryption', 'encrypted'],
        ['antivirus', 'antivirus_ok'],
        ['firewall', 'firewall_ok'],
      ] as const
    ).map(([control, column]) => {
      const row = db
        .prepare(`SELECT SUM(d.${column}) AS ok, COUNT(*) AS n FROM devices d WHERE ${scope.where}`)
        .get(...scope.params) as Record<string, number | null>;
      const ok = Number(row['ok'] ?? 0);
      const n = Number(row['n'] ?? 0);
      return {
        control,
        protectedCount: ok,
        notProtected: n - ok,
        compliancePct: n > 0 ? Math.round((ok / n) * 100) : 0,
      };
    });

    const postureRow = db
      .prepare(
        `SELECT SUM(d.encrypted + d.antivirus_ok + d.firewall_ok = 3) AS all3,
                SUM(d.encrypted + d.antivirus_ok + d.firewall_ok = 0) AS none3,
                COUNT(*) AS n
           FROM devices d WHERE ${scope.where}`,
      )
      .get(...scope.params) as Record<string, number | null>;
    const all3 = Number(postureRow['all3'] ?? 0);
    const none3 = Number(postureRow['none3'] ?? 0);
    const evaluated = Number(postureRow['n'] ?? 0);

    const nonCompliant = count(
      db,
      `SELECT COUNT(*) AS n FROM devices d WHERE ${scope.where} AND d.config_pass_pct < 90`,
      ...scope.params,
    );

    return {
      overallPct,
      checksInScope: Number(totals['checks'] ?? 0),
      failingChecks: Number(totals['failing'] ?? 0),
      nonCompliantDevices: { count: nonCompliant, total: evaluated },
      exceptions: count(db, `SELECT COUNT(*) AS n FROM config_exceptions`),
      byFramework,
      byPlatform,
      deviceBands: {
        high: Number(bands['high'] ?? 0),
        medium: Number(bands['medium'] ?? 0),
        low: Number(bands['low'] ?? 0),
      },
      byCategory,
      topFailing,
      posture: {
        protectedCount: all3,
        needsReview: evaluated - all3 - none3,
        notProtected: none3,
        controls,
        evaluatedDevices: evaluated,
      },
    };
  });

  app.get(`${basePath}/configuration/checks`, async (request) => {
    const query = request.query as CheckQuery;
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;
    const { from, params: fromParams } = scopeFrom(query.group);
    const counts = scopeCounts(query.group);
    const { where, params } = checkFilters(query);
    const filter = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

    const inner = `SELECT ${CHECK_FIELDS}, c.cis, c.stig, c.pci, c.hipaa, c.seq, ${counts}
                     FROM ${from}`;

    const rows = db
      .prepare(
        `SELECT * FROM (${inner}) c${filter}
          ORDER BY (CASE c.platform WHEN 'windows' THEN 0 WHEN 'macos' THEN 1 ELSE 2 END),
                   c.seq
          LIMIT ? OFFSET ?`,
      )
      .all(...fromParams, ...params, limit, offset) as CheckRow[];

    const total = count(
      db,
      `SELECT COUNT(*) AS n FROM (${inner}) c${filter}`,
      ...fromParams,
      ...params,
    );

    return {
      items: rows.map((row) => shapeCheck(row)),
      page: {
        nextCursor: offset + rows.length < total ? String(offset + rows.length) : null,
        total,
      },
    };
  });

  /**
   * One check with the devices behind it. The results are derived here from
   * the same expression the counts were rolled up with, so the drawer's list
   * and the Pass / Fail / Exc. figures above it always agree.
   */
  app.get(`${basePath}/configuration/checks/:checkId`, async (request) => {
    const { checkId } = request.params as { checkId: string };
    const query = request.query as { limit?: string; group?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
    const { from, params: fromParams } = scopeFrom(query.group);
    const counts = scopeCounts(query.group);

    const row = db
      .prepare(
        `SELECT ${CHECK_FIELDS}, c.cis, c.stig, c.pci, c.hipaa, ${counts}
           FROM ${from} WHERE c.id = ?`,
      )
      .get(...fromParams, checkId) as CheckRow | undefined;
    if (!row) throw notFound();

    const scope = deviceScope(query.group);
    const results = (
      db
        .prepare(
          `SELECT d.id AS deviceId, d.hostname AS name, d.os_name AS os, d.zone_name AS site,
                  CASE WHEN ${CHECK_EXCEPTED_SQL} THEN 'exception'
                       WHEN ${CHECK_PASS_SQL} THEN 'pass' ELSE 'fail' END AS result,
                  CASE WHEN ${CHECK_PASS_SQL} THEN c.expected ELSE c.bad END AS actual
             FROM devices d, config_checks c
            WHERE c.id = ? AND ${CHECK_APPLIES_SQL} AND ${scope.where}
            ORDER BY (CASE WHEN ${CHECK_EXCEPTED_SQL} THEN 1
                           WHEN ${CHECK_PASS_SQL} THEN 2 ELSE 0 END), d.hostname
            LIMIT ?`,
        )
        .all(checkId, ...scope.params, limit) as Record<string, unknown>[]
    ).map((r) => ({ ...r }));

    return { check: shapeCheck(row), results };
  });

  app.get(`${basePath}/configuration/devices`, async (request) => {
    const query = request.query as { cursor?: string; limit?: string; q?: string; group?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;
    const search = (query.q ?? '').trim();
    const scope = deviceScope(query.group);

    const where = [scope.where];
    const params: unknown[] = [...scope.params];
    if (search) {
      where.push(`(d.hostname LIKE ? OR d.primary_user_name LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    const filter = where.join(' AND ');

    // Worst first, which is how the reference opens the tab.
    const rows = db
      .prepare(
        `SELECT d.id AS deviceId, d.hostname AS name, d.os_name AS os, d.zone_name AS site,
                d.primary_user_name AS user, d.config_pass_pct AS compliancePct,
                d.config_fail AS failing, d.config_high_fail AS highFailing,
                d.config_exceptions AS exceptions, d.last_seen_at AS lastEvaluated
           FROM devices d WHERE ${filter}
          ORDER BY d.config_pass_pct, d.hostname LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];

    const total = count(db, `SELECT COUNT(*) AS n FROM devices d WHERE ${filter}`, ...params);

    return {
      items: rows,
      page: {
        nextCursor: offset + rows.length < total ? String(offset + rows.length) : null,
        total,
      },
    };
  });

  /** One device with the checks it fails, for the device drawer. */
  app.get(`${basePath}/configuration/devices/:deviceId`, async (request) => {
    const { deviceId } = request.params as { deviceId: string };
    const device = db
      .prepare(
        `SELECT id AS deviceId, hostname AS name, os_name AS os, zone_name AS site,
                primary_user_name AS user, config_pass_pct AS compliancePct,
                config_checks_total AS total, config_fail AS failing,
                config_exceptions AS exceptions
           FROM devices WHERE id = ?`,
      )
      .get(deviceId) as Record<string, number | string> | undefined;
    if (!device) throw notFound();

    const { total, ...rest } = device;
    const failedChecks = db
      .prepare(
        `SELECT c.id, c.title, c.category, c.severity, c.expected,
                c.bad AS actual,
                CASE WHEN c.remediable THEN 'automatic' ELSE 'manual' END AS remediation
           FROM config_checks c, devices d
          WHERE d.id = ? AND ${CHECK_APPLIES_SQL}
            AND NOT ${CHECK_EXCEPTED_SQL} AND NOT ${CHECK_PASS_SQL}
          ORDER BY (CASE c.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END), c.id`,
      )
      .all(deviceId) as Record<string, unknown>[];

    return {
      ...rest,
      passing: Number(total) - Number(device['exceptions']) - Number(device['failing']),
      failedChecks,
    };
  });

  app.get(`${basePath}/configuration/exceptions`, async () =>
    db
      .prepare(
        `SELECT x.id, x.check_id AS checkId, c.title AS checkTitle,
                COALESCE(g.name, 'All devices') AS scope,
                x.reason, x.granted_by AS grantedBy, x.granted_at AS grantedAt,
                x.expires_at AS expiresAt
           FROM config_exceptions x
           JOIN config_checks c ON c.id = x.check_id
           LEFT JOIN device_groups g ON g.id = x.scope_group_id
          ORDER BY x.granted_at DESC`,
      )
      .all(),
  );

  /**
   * The benchmarks, each rolled up over the checks it maps to on its own
   * platform. Six benchmarks over 200 checks is small enough to aggregate per
   * request, unlike the per-group figures.
   */
  app.get(`${basePath}/configuration/benchmarks`, async () => {
    const rows = db
      .prepare(
        `SELECT b.id, b.framework, b.name, b.version, b.platform,
                b.assigned_group_id AS assignedGroupId,
                COALESCE(g.name, 'All devices') AS assignedTo
           FROM config_benchmarks b
           LEFT JOIN device_groups g ON g.id = b.assigned_group_id
          ORDER BY b.name`,
      )
      .all() as Record<string, unknown>[];

    return rows.map((b) => {
      const column = FRAMEWORK_COLUMN[String(b['framework'])] ?? 'cis';
      const platform = b['platform'] as string | null;
      const platformWhere = platform ? ` AND c.platform = ?` : '';
      const platformParams = platform ? [platform] : [];

      const totals = db
        .prepare(
          `SELECT COUNT(*) AS checks, SUM(c.pass_count) AS pass, SUM(c.fail_count) AS fail
             FROM config_checks c WHERE c.${column} <> ''${platformWhere}`,
        )
        .get(...platformParams) as Record<string, number | null>;

      const families = platform
        ? platform === 'windows'
          ? `('Windows', 'Windows Server')`
          : platform === 'macos'
            ? `('macOS')`
            : `('Linux')`
        : null;
      const devices = count(
        db,
        `SELECT COUNT(*) AS n FROM devices d WHERE d.config_checks_total > 0` +
          (families ? ` AND d.os_family IN ${families}` : ''),
      );

      const pass = Number(totals['pass'] ?? 0);
      const fail = Number(totals['fail'] ?? 0);
      return {
        ...b,
        devices,
        checks: Number(totals['checks'] ?? 0),
        compliancePct: pass + fail > 0 ? Math.round((pass / (pass + fail)) * 100) : 0,
      };
    });
  });

  app.get(`${basePath}/configuration/profiles`, async () =>
    db
      .prepare(
        `SELECT id, name, platform, assigned_devices AS assignedDevices,
                compliance_pct AS compliancePct, status, modified_at AS modifiedAt, version
           FROM config_profiles ORDER BY modified_at DESC`,
      )
      .all(),
  );

  app.get(`${basePath}/configuration/profiles/:profileId`, async (request) => {
    const { profileId } = request.params as { profileId: string };
    const profile = db
      .prepare(
        `SELECT id, name, platform, assigned_devices AS assignedDevices,
                compliance_pct AS compliancePct, status, modified_at AS modifiedAt, version
           FROM config_profiles WHERE id = ?`,
      )
      .get(profileId) as Record<string, unknown> | undefined;
    if (!profile) throw notFound();

    const rows = db
      .prepare(
        `SELECT setting, version, value FROM config_profile_settings
          WHERE profile_id = ? ORDER BY setting, version`,
      )
      .all(profileId) as { setting: string; version: number; value: string }[];

    const settings: { setting: string; values: { version: number; value: string }[] }[] = [];
    for (const row of rows) {
      const existing = settings.find((s) => s.setting === row.setting);
      const entry = { version: row.version, value: row.value };
      if (existing) existing.values.push(entry);
      else settings.push({ setting: row.setting, values: [entry] });
    }

    return { profile, settings };
  });

  /**
   * Evaluate Now. The library's results are a pure function of the estate, so
   * a re-evaluation finds exactly what the stored roll-up already says: this
   * reports the work as a job without pretending the figures moved.
   */
  app.post(`${basePath}/configuration/evaluate`, async (_request, reply) =>
    reply.code(202).send({
      id: `job-${randomUUID()}`,
      status: 'queued',
      createdAt: new Date().toISOString(),
      finishedAt: null,
    }),
  );
}
