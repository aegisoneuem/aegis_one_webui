import type { FastifyInstance } from 'fastify';
import type { Db } from '@aegis/mock-core';

/**
 * The Vulnerabilities page, for everything the generic resource lister cannot
 * serve: the summary the six KPI cards and the six dashboard widgets read,
 * the devices ranked by exposure, the fixes ranked by the risk they remove,
 * and the projects.
 *
 * The findings grid, a single finding and the scan history are all pages or
 * rows of one table, so they stay on the lister — which is also why the
 * shaping below is exported rather than kept here.
 *
 * Everything here is an aggregation over the same two tables the rest of the
 * console reads. The figures above the grid and the rows inside it are the
 * same query twice, which is the point: a counter nobody can click through
 * to is a counter nobody can check.
 */

/** Severity weights the exposure score and every "worst first" ordering. */
const SEVERITY_WEIGHT = `CASE v.severity WHEN 'critical' THEN 10 WHEN 'high' THEN 6
                              WHEN 'medium' THEN 3 ELSE 1 END`;

/** Exactly the contract's Finding, flat as the table keeps it. */
const FINDING_FIELDS = `v.id, v.id AS cve, v.check_id AS checkId, v.title, v.affects AS product,
                        v.severity, v.cvss, v.priority, v.threats, v.detection, v.confidence,
                        v.family, v.solution, v.fix_type AS fixType, v.port,
                        v.first_detected_at AS firstDetectedAt, v.last_detected_at AS lastDetectedAt,
                        v.sla_due_at AS slaDueAt, v.project_id AS projectId,
                        v.accepted_reason AS acceptedReason, v.state,
                        v.affected_count AS devices, v.published_at AS publishedAt`;

/** Overdue once the due date has passed, due soon inside the last week. */
function slaState(dueAt: string, now: number): 'within' | 'due-soon' | 'overdue' {
  const left = Date.parse(dueAt) - now;
  if (left < 0) return 'overdue';
  return left <= 7 * 86_400_000 ? 'due-soon' : 'within';
}

/**
 * Age and SLA state are both comparisons against now, so the lister and the
 * summary derive them here on the way out. A row written yesterday would
 * otherwise still claim to be within its SLA a year later.
 *
 * It tolerates a partial row, because `?fields=` lets the grid ask for fewer
 * columns than the contract declares.
 */
export function shapeFinding(
  row: Record<string, unknown>,
  now = Date.now(),
): Record<string, unknown> {
  const due = row['slaDueAt'];
  const first = row['firstDetectedAt'];
  return {
    ...row,
    ...(first === undefined
      ? {}
      : { ageDays: Math.max(0, Math.floor((now - Date.parse(String(first))) / 86_400_000)) }),
    ...(due === undefined ? {} : { sla: slaState(String(due), now) }),
  };
}

interface CountRow extends Record<string, unknown> {
  n: number;
}

const count = (db: Db, sql: string, ...params: unknown[]): number =>
  ((db.prepare(sql).get(...params) as CountRow | undefined)?.n ?? 0) | 0;

/** A < 250, B < 400, C < 550, D < 700, F at or above it. */
function grade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score < 250) return 'A';
  if (score < 400) return 'B';
  if (score < 550) return 'C';
  if (score < 700) return 'D';
  return 'F';
}

/** The eight threat indicators, in the order the page lists them. */
const INDICATORS = [
  'known-exploited',
  'exploit-available',
  'ransomware',
  'wormable',
  'zero-day',
  'remote',
  'malware',
  'no-fix',
] as const;

const AGE_BUCKETS: readonly (readonly [string, number, number])[] = [
  ['0–30 days', 0, 30],
  ['31–60 days', 31, 60],
  ['61–90 days', 61, 90],
  ['Over 90 days', 91, Number.MAX_SAFE_INTEGER],
];

export function registerVulnerabilityRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.get(`${basePath}/vulnerabilities/summary`, async () => {
    const now = Date.now();
    // A finding is open while at least one device still has it open.
    const open = (
      db
        .prepare(`SELECT ${FINDING_FIELDS} FROM vulnerabilities v WHERE v.state = 'open'`)
        .all() as Record<string, unknown>[]
    ).map((r) => shapeFinding({ ...r, threats: JSON.parse(String(r['threats'])) as unknown }, now));

    const threatsOf = (f: Record<string, unknown>): string[] => f['threats'] as string[];
    const sev = (f: Record<string, unknown>): string => String(f['severity']);

    // The estate's exposure is the average over the devices something
    // actually scanned; a device nobody reached is absent, not a zero.
    const exposureRow = db
      .prepare(
        `SELECT CAST(ROUND(AVG(exposure)) AS INTEGER) AS n
           FROM devices WHERE scan_method <> 'not-scanned'`,
      )
      .get() as CountRow | undefined;
    const exposureScore = exposureRow?.n ?? 0;

    const scanned = count(
      db,
      `SELECT COUNT(*) AS n FROM devices WHERE scan_method <> 'not-scanned'`,
    );
    const total = count(db, `SELECT COUNT(*) AS n FROM devices`);

    const devicesAffected = count(
      db,
      `SELECT COUNT(DISTINCT device_id) AS n FROM device_vulnerabilities WHERE state = 'open'`,
    );

    // Twelve weeks of open findings, stacked by severity. The current week is
    // what the grid holds; the weeks before it are taken from when each
    // finding was first detected, so the line ends where the figures start.
    const trend = Array.from({ length: 12 }, (_, i) => {
      const weeksBack = 11 - i;
      const at = now - weeksBack * 7 * 86_400_000;
      const live = open.filter((f) => Date.parse(String(f['firstDetectedAt'])) <= at);
      const bySev = (s: string): number => live.filter((f) => sev(f) === s).length;
      return {
        date: new Date(at).toISOString().slice(0, 10),
        open: live.length,
        critical: bySev('critical'),
        high: bySev('high'),
        medium: bySev('medium'),
        low: bySev('low'),
      };
    });

    const slaCount = (state: string): number => open.filter((f) => f['sla'] === state).length;

    // Fixes ranked by how many devices are missing them, which is what the
    // Top Fixes widget sorts on.
    const topFixes = db
      .prepare(
        `SELECT v.solution AS fix, COUNT(*) AS findings, SUM(v.affected_count) AS devicesMissing
           FROM vulnerabilities v WHERE v.affected_count > 0
          GROUP BY v.solution ORDER BY devicesMissing DESC LIMIT 6`,
      )
      .all() as Record<string, unknown>[];

    return {
      exposureScore,
      grade: grade(exposureScore),
      openFindings: open.length,
      devicesAffected,
      criticalAndHigh: open.filter((f) => sev(f) === 'critical' || sev(f) === 'high').length,
      knownExploited: open.filter((f) => threatsOf(f).includes('known-exploited')).length,
      slaOverdue: slaCount('overdue'),
      scanCoverage: { scanned, total },
      bySeverity: {
        critical: open.filter((f) => sev(f) === 'critical').length,
        high: open.filter((f) => sev(f) === 'high').length,
        medium: open.filter((f) => sev(f) === 'medium').length,
        low: open.filter((f) => sev(f) === 'low').length,
      },
      trend,
      sla: {
        within: slaCount('within'),
        dueSoon: slaCount('due-soon'),
        overdue: slaCount('overdue'),
      },
      age: AGE_BUCKETS.map(([bucket, from, to]) => ({
        bucket,
        count: open.filter((f) => Number(f['ageDays']) >= from && Number(f['ageDays']) <= to)
          .length,
      })),
      topPriorities: [...open]
        .sort((a, b) => Number(b['priority']) - Number(a['priority']))
        .slice(0, 6),
      topFixes,
      threatIndicators: INDICATORS.map((indicator) => ({
        indicator,
        count: open.filter((f) => threatsOf(f).includes(indicator)).length,
      })).filter((r) => r.count > 0),
    };
  });

  /**
   * Devices ranked by exposure — the Devices tab's own grid. The four
   * severity columns count that device's own open findings, so a row's
   * figures add up to the findings behind it.
   */
  app.get(`${basePath}/vulnerabilities/devices`, async (request) => {
    const query = request.query as { limit?: string; q?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
    const search = (query.q ?? '').trim();

    const rows = db
      .prepare(
        `SELECT d.id AS deviceId, d.hostname AS name, d.os_name AS os, d.ip, d.zone_name AS site,
                d.criticality, d.scan_method AS scanMethod, d.exposure,
                d.last_scan_at AS lastScan,
                SUM(v.severity = 'critical') AS critical,
                SUM(v.severity = 'high') AS high,
                SUM(v.severity = 'medium') AS medium,
                SUM(v.severity = 'low') AS low
           FROM devices d
           LEFT JOIN device_vulnerabilities dv
                  ON dv.device_id = d.id AND dv.state = 'open'
           LEFT JOIN vulnerabilities v ON v.id = dv.vulnerability_id
          WHERE (? = '' OR d.hostname LIKE '%' || ? || '%')
          GROUP BY d.id
          ORDER BY d.exposure DESC, d.hostname
          LIMIT ?`,
      )
      .all(search, search, limit) as Record<string, unknown>[];

    // The total is the estate the search matched, not the page in hand: the
    // grid's caption counts devices, and a page length would under-report it.
    const total = count(
      db,
      `SELECT COUNT(*) AS n FROM devices WHERE (? = '' OR hostname LIKE '%' || ? || '%')`,
      search,
      search,
    );

    return {
      items: rows.map((r) => ({
        ...r,
        critical: Number(r['critical'] ?? 0),
        high: Number(r['high'] ?? 0),
        medium: Number(r['medium'] ?? 0),
        low: Number(r['low'] ?? 0),
      })),
      page: { nextCursor: null, total },
    };
  });

  /**
   * Fixes ranked by the risk they would remove. One fix closes several
   * findings on several devices, so the unit here is the solution, not the
   * CVE — which is why the console can offer one deployment per row.
   */
  app.get(`${basePath}/vulnerabilities/remediations`, async () => {
    const rows = db
      .prepare(
        `SELECT v.solution AS fix,
                COUNT(*) AS findings,
                SUM(v.affected_count) AS devicesMissing,
                MAX(${SEVERITY_WEIGHT}) AS weight,
                MIN(v.fix_type) AS fixType,
                GROUP_CONCAT(v.id) AS cves,
                SUM(v.priority * ${SEVERITY_WEIGHT} * v.affected_count) AS risk
           FROM vulnerabilities v WHERE v.affected_count > 0
          GROUP BY v.solution ORDER BY risk DESC`,
      )
      .all() as Record<string, unknown>[];

    const total = rows.reduce((a, r) => a + Number(r['risk'] ?? 0), 0) || 1;
    const severityOf = (weight: number): string =>
      weight >= 10 ? 'critical' : weight >= 6 ? 'high' : weight >= 3 ? 'medium' : 'low';

    return {
      items: rows.map((r, i) => ({
        id: `rem-${i + 1}`,
        fix: String(r['fix']),
        highestSeverity: severityOf(Number(r['weight'])),
        fixType: String(r['fixType']),
        riskReducedPct: Math.round((Number(r['risk'] ?? 0) / total) * 100),
        cves: String(r['cves'] ?? '')
          .split(',')
          .filter(Boolean),
        findings: Number(r['findings']),
        devicesMissing: Number(r['devicesMissing'] ?? 0),
      })),
      page: { nextCursor: null, total: rows.length },
    };
  });

  app.get(`${basePath}/vulnerabilities/projects`, async () => {
    const rows = db
      .prepare(
        `SELECT p.id, p.name, p.owner, p.due, p.progress_pct AS progressPct,
                (SELECT COUNT(*) FROM vulnerabilities v WHERE v.project_id = p.id) AS findings
           FROM vuln_projects p ORDER BY p.due`,
      )
      .all() as Record<string, unknown>[];

    // Days to the due date are measured here, against the server's clock,
    // for the same reason a finding's SLA state is.
    const now = Date.now();
    return rows.map((r) => ({
      ...r,
      dueInDays: Math.ceil((Date.parse(`${String(r['due'])}T00:00:00Z`) - now) / 86_400_000),
    }));
  });
}
