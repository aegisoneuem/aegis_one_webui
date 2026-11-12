import type { FastifyInstance } from 'fastify';
import { TtlCache, notFound, zoneScope, type Db } from '@aegis/mock-core';
import { shapeRow } from './resources';

/**
 * Aggregates behind Overview, DEX, Insight, Licensing and Diagnostics.
 *
 * All of them are computed in SQL. Sending the client 50,000 rows so it can
 * count them itself is the thing the performance budget exists to prevent.
 */
/**
 * Estate-wide figures change on the scale of minutes, so they are computed at
 * most once every few seconds and shared. Keyed by the caller's zone scope,
 * never by user: two users with the same scope see the same estate, and one
 * with a narrower scope must not read the wider cache entry.
 */
const AGGREGATE_TTL_MS = Number(process.env['MOCK_AGGREGATE_TTL_MS'] ?? 5000);
const aggregates = new TtlCache<unknown>({ ttlMs: AGGREGATE_TTL_MS });

/**
 * Drops every cached aggregate. A write that changes what the counters count
 * calls this, so the next read recomputes rather than serving the figures the
 * write has just invalidated.
 */
export function clearAggregates(): void {
  aggregates.clear();
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** A whole-number percentage, which is the only precision these widgets show. */
const pctOf = (part: number, whole: number): number =>
  whole ? Math.round((part / whole) * 100) : 0;

const scopeKey = (zoneIds: readonly string[]): string =>
  zoneIds.length === 0 ? 'all' : [...zoneIds].sort().join(',');

export function registerAggregateRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const scoped = (zoneIds: readonly string[]) => {
    const scope = zoneScope({ zoneIds: [...zoneIds] });
    return { where: scope ? `WHERE ${scope.sql}` : '', params: scope?.params ?? [] };
  };

  const one = <T>(sql: string, params: unknown[] = []): T => db.prepare(sql).get(...params) as T;
  const many = <T>(sql: string, params: unknown[] = []): T[] =>
    db.prepare(sql).all(...params) as T[];

  app.get(`${basePath}/overview`, async (request) => {
    const q = request.query as { zone?: string; platform?: string; department?: string };
    const filters = {
      zone: q.zone ?? '',
      platform: q.platform ?? '',
      department: q.department ?? '',
    };
    const key = `overview:${scopeKey(request.auth?.zoneIds ?? [])}:${filters.zone}:${filters.platform}:${filters.department}`;
    return aggregates.get(key, () => buildOverview(request.auth?.zoneIds ?? [], filters));
  });

  /**
   * Operating systems past their vendor end-of-support date, so the Needs
   * Attention row that names them is a fact about the estate rather than a
   * guess. Windows 10 Enterprise 22H2 reached end of support on 14 Oct 2025.
   */
  const END_OF_SUPPORT_OS = ['Windows 10 Enterprise'] as const;

  /**
   * Everything the Overview shows, in the shape the contract declares. The
   * page renders it and nothing more: a figure that is not computed here does
   * not appear on screen.
   */
  function buildOverview(
    zoneIds: readonly string[],
    filters: { zone: string; platform: string; department: string },
  ) {
    // The caller's zone scope is a permission boundary and the query string is
    // a preference, so they are ANDed: picking a zone can only ever narrow
    // what the role already allows, never widen it.
    const scope = scoped(zoneIds);
    const clauses: string[] = scope.where ? [scope.where.replace(/^WHERE /, '')] : [];
    const params: unknown[] = [...scope.params];

    if (filters.zone) {
      clauses.push('zone_id = ?');
      params.push(filters.zone);
    }
    if (filters.platform) {
      clauses.push("LOWER(REPLACE(os_family, ' Server', '')) = ?");
      params.push(filters.platform);
    }
    if (filters.department) {
      clauses.push('department = ?');
      params.push(filters.department);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const and = where ? `${where} AND` : 'WHERE';

    const totals = one<{
      total: number;
      online: number;
      encrypted: number;
      antivirus: number;
      firewall: number;
      fullyPatched: number;
      highRisk: number;
      avgDex: number;
      seenToday: number;
      currentAgent: number;
      endOfSupport: number;
      lowDisk: number;
    }>(
      `SELECT COUNT(*) AS total,
              SUM(status = 'online') AS online,
              SUM(encrypted = 1) AS encrypted,
              SUM(antivirus_ok = 1) AS antivirus,
              SUM(firewall_ok = 1) AS firewall,
              SUM(pending_patches = 0) AS fullyPatched,
              SUM(critical_vulns > 0) AS highRisk,
              ROUND(AVG(dex_score), 1) AS avgDex,
              SUM(last_seen_at >= ?) AS seenToday,
              SUM(agent_version >= '7.4.0') AS currentAgent,
              SUM(os_name IN (${END_OF_SUPPORT_OS.map(() => '?').join(',')})) AS endOfSupport,
              SUM(disk_free_pct < 10) AS lowDisk
       FROM devices ${where}`,
      [iso(Date.now() - 86_400_000), ...END_OF_SUPPORT_OS, ...params],
    );

    const n = totals.total || 1;
    const stale = one<{ n: number }>(`SELECT COUNT(*) AS n FROM devices ${and} last_seen_at < ?`, [
      ...params,
      iso(Date.now() - 7 * 86_400_000),
    ]);

    // Content delivery is the peer-cache tier: an estate whose relays are down
    // falls back to the internet for every byte, which is what this measures.
    const relays = one<{ total: number; healthy: number }>(
      `SELECT COUNT(*) AS total, SUM(status = 'healthy') AS healthy FROM peers`,
    );

    const securityPosture = [
      { control: 'disk-encryption' as const, protected: totals.encrypted, total: totals.total },
      { control: 'antivirus' as const, protected: totals.antivirus, total: totals.total },
      { control: 'firewall' as const, protected: totals.firewall, total: totals.total },
    ];

    /**
     * The five weighted measures behind the single score, and the weights the
     * approved design prints under each column. They sum to 1.
     */
    const measures = [
      { id: 'patching', label: 'Patching', weight: 0.3, score: pctOf(totals.fullyPatched, n) },
      {
        id: 'security-posture',
        label: 'Security Posture',
        weight: 0.25,
        score: Math.round(
          securityPosture.reduce((sum, c) => sum + pctOf(c.protected, c.total || 1), 0) /
            securityPosture.length,
        ),
      },
      {
        id: 'agent-health',
        label: 'Agent Health',
        weight: 0.2,
        // Both halves matter: an agent that checked in yesterday but is three
        // versions behind is not healthy, and nor is a current one gone quiet.
        score: Math.round((pctOf(totals.seenToday, n) + pctOf(totals.currentAgent, n)) / 2),
      },
      {
        id: 'experience',
        label: 'Experience (DEX)',
        weight: 0.15,
        score: Math.round(totals.avgDex),
      },
      {
        id: 'content-delivery',
        label: 'Content Delivery',
        weight: 0.1,
        score: pctOf(relays.healthy, relays.total || 1),
      },
    ];

    const score = Math.round(measures.reduce((sum, m) => sum + m.score * m.weight, 0));

    // Patch vendors rate severity as critical / important / moderate / low;
    // the contract's four buckets are critical / high / medium / low. The
    // middle two are the same thing under different names, so they are mapped
    // here rather than leaving two buckets permanently at zero.
    const patchSeverity = one<{ critical: number; high: number; medium: number; low: number }>(
      `SELECT SUM(p.severity = 'critical') AS critical,
              SUM(p.severity IN ('high', 'important')) AS high,
              SUM(p.severity IN ('medium', 'moderate')) AS medium,
              SUM(p.severity = 'low') AS low
       FROM device_patches dp JOIN patches p ON p.id = dp.patch_id
       WHERE dp.state IN ('pending', 'failed')`,
    );

    const lastInstall = one<{
      successful: number;
      restartNeeded: number;
      pending: number;
      failed: number;
    }>(
      `SELECT SUM(dp.state = 'installed' AND p.reboot_required = 0) AS successful,
              SUM(dp.state = 'installed' AND p.reboot_required = 1) AS restartNeeded,
              SUM(dp.state = 'pending') AS pending,
              SUM(dp.state = 'failed') AS failed
       FROM device_patches dp JOIN patches p ON p.id = dp.patch_id`,
    );

    const deploymentsByStatus = many<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM deployments GROUP BY 1`,
    );
    const byStatus = (...wanted: string[]): number =>
      deploymentsByStatus
        .filter((row) => wanted.includes(row.status))
        .reduce((sum, row) => sum + row.n, 0);

    const failedDeployments = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM deployments WHERE failed > 0`,
    );

    /**
     * Every row is a count this function has already computed, paired with the
     * page that resolves it. Ordered by severity, then by how many endpoints
     * are affected — the order the approved design shows them in.
     */
    const attention = [
      {
        id: 'antivirus-missing',
        severity: 'high',
        count: totals.total - totals.antivirus,
        title: 'Antivirus Missing or Outdated',
        detail: 'Endpoints with no reporting antivirus control',
        action: 'Install Antivirus',
      },
      {
        id: 'not-encrypted',
        severity: 'high',
        count: totals.total - totals.encrypted,
        title: 'Disk Not Fully Encrypted',
        detail: 'Encryption off or still in progress',
        action: 'Review',
      },
      {
        id: 'high-risk',
        severity: 'high',
        count: totals.highRisk,
        title: 'High-Risk Endpoints',
        detail: 'At least one open critical vulnerability',
        action: 'Review',
      },
      {
        id: 'deployment-failed',
        severity: 'high',
        count: failedDeployments.n,
        title: 'Deployment Failed',
        detail: 'Some targets did not complete',
        action: 'Open Failures',
      },
      {
        id: 'end-of-support-os',
        severity: 'medium',
        count: totals.endOfSupport,
        title: 'End-Of-Support OS',
        detail: 'Past the vendor end-of-support date',
        action: 'Review',
      },
      {
        id: 'firewall-off',
        severity: 'medium',
        count: totals.total - totals.firewall,
        title: 'Firewall Disabled',
        detail: 'Host firewall not reporting as enabled',
        action: 'Review',
      },
      {
        id: 'not-seen',
        severity: 'medium',
        count: stale.n,
        title: 'Not seen for 7+ days',
        detail: 'Agent has not checked in',
        action: 'Refresh Details',
      },
      {
        id: 'low-disk',
        severity: 'low',
        count: totals.lowDisk,
        title: 'Low Disk Space',
        detail: 'Under 10% free, deployments will fail',
        action: 'Review',
      },
    ].filter((row) => row.count > 0);

    /**
     * Licences, enrollment tokens and API tokens share one widget because they
     * share one failure: the day they lapse, something stops working. Revoked
     * ones are already dealt with, so they are not pending anything.
     */
    const expiring = many<{ kind: string; name: string; expiresAt: string }>(
      `SELECT 'license' AS kind, product AS name, expires_at AS expiresAt FROM licenses
       UNION ALL
       SELECT 'enrollment-token', name, expires_at FROM enrollment_tokens WHERE revoked_at IS NULL
       UNION ALL
       SELECT 'api-token', name, expires_at FROM api_tokens
         WHERE revoked_at IS NULL AND expires_at IS NOT NULL
       ORDER BY expiresAt ASC LIMIT 40`,
    );

    return {
      counts: {
        managedEndpoints: totals.total,
        online: totals.online,
        highRiskEndpoints: totals.highRisk,
        deviceGroups: one<{ n: number }>(`SELECT COUNT(*) AS n FROM device_groups`).n,
        softwarePackages: one<{ n: number }>(`SELECT COUNT(*) AS n FROM software`).n,
        patchUpdates: one<{ n: number }>(`SELECT COUNT(*) AS n FROM patches`).n,
        deployments: one<{ n: number }>(`SELECT COUNT(*) AS n FROM deployments`).n,
        zones: one<{ n: number }>(`SELECT COUNT(*) AS n FROM zones`).n,
      },
      health: { score, band: score >= 85 ? 'healthy' : score >= 70 ? 'fair' : 'poor', measures },
      patchCompliance: {
        compliantPct: pctOf(totals.fullyPatched, n),
        compliant: totals.fullyPatched,
        nonCompliant: totals.total - totals.fullyPatched,
        missingBySeverity: patchSeverity,
        lastInstall,
        byOs: many<{ family: string; compliantPct: number }>(
          `SELECT LOWER(REPLACE(os_family, ' Server', '')) AS family,
                  CAST(ROUND(100.0 * SUM(pending_patches = 0) / COUNT(*)) AS INTEGER) AS compliantPct
           FROM devices ${where} GROUP BY 1 ORDER BY COUNT(*) DESC`,
          params,
        ),
      },
      securityPosture,
      deploymentStatus: {
        completed: byStatus('completed'),
        queuedOrScheduled: byStatus('queued', 'scheduled'),
        running: byStatus('running'),
        failed: byStatus('failed'),
        paused: byStatus('paused'),
      },
      expiring,
      attention,
      recentActivity: many<Record<string, unknown>>(
        `SELECT id, name, type, status, target_count AS targetCount,
                done, failed, pending,
                triggered_by AS triggeredBy, triggered_at AS triggeredAt
         FROM deployments ORDER BY triggered_at DESC LIMIT 6`,
      ).map(({ done, failed, pending, ...row }) => ({
        ...shapeRow(row),
        counts: { done, failed, pending },
      })),
      updatedAt: iso(Date.now()),
    };
  }

  app.get(`${basePath}/dex`, async (request) =>
    aggregates.get(`dex:${scopeKey(request.auth?.zoneIds ?? [])}`, () => {
      const { where, params } = scoped(request.auth?.zoneIds ?? []);
      return {
        overall: one(`SELECT ROUND(AVG(dex_score), 1) AS score FROM devices ${where}`, params),
        byDepartment: many(
          `SELECT department, ROUND(AVG(dex_score), 1) AS score, COUNT(*) AS devices
         FROM devices ${where} GROUP BY 1 ORDER BY score ASC`,
          params,
        ),
        byZone: many(
          `SELECT zone_name AS zoneName, ROUND(AVG(dex_score), 1) AS score, COUNT(*) AS devices
         FROM devices ${where} GROUP BY 1 ORDER BY score ASC`,
          params,
        ),
        distribution: many(
          `SELECT CASE
                  WHEN dex_score >= 85 THEN 'excellent'
                  WHEN dex_score >= 70 THEN 'good'
                  WHEN dex_score >= 50 THEN 'fair'
                  ELSE 'poor' END AS band,
                COUNT(*) AS devices
         FROM devices ${where} GROUP BY 1`,
          params,
        ),
        lowestScoring: many(
          `SELECT id, hostname, zone_name AS zoneName, department, dex_score AS dexScore,
                disk_free_pct AS diskFreePct, ram_gb AS ramGb
         FROM devices ${where} ORDER BY dex_score ASC LIMIT 25`,
          params,
        ),
      };
    }),
  );

  app.get(`${basePath}/licensing`, async () => ({
    items: many(
      `SELECT id, product, entitled, consumed, expires_at AS expiresAt, support_tier AS supportTier FROM licenses ORDER BY product`,
    ),
  }));

  app.get(`${basePath}/diagnostics`, async () => ({
    services: many(
      `SELECT id, component, status, latency_ms AS latencyMs, message, checked_at AS checkedAt FROM service_health ORDER BY component`,
    ),
    zones: many(
      `SELECT id, name, relay_status AS relayStatus, last_sync_at AS lastSyncAt, device_count AS deviceCount FROM zones ORDER BY name`,
    ),
    counts: one(
      `SELECT (SELECT COUNT(*) FROM devices) AS devices,
              (SELECT COUNT(*) FROM device_software) AS softwareInstalls,
              (SELECT COUNT(*) FROM device_patches) AS patchRecords,
              (SELECT COUNT(*) FROM device_vulnerabilities) AS findings,
              (SELECT COUNT(*) FROM audit_log) AS auditEntries`,
    ),
  }));

  /**
   * The four counts above the inventory grid. They answer "how much of the
   * estate am I looking at", so they follow the same search term the grid
   * does — a count that ignored the filter would contradict the list under
   * it — but not its column filters, which are what the user is narrowing
   * away from.
   */
  app.get(`${basePath}/devices/summary`, async (request) => {
    const scope = zoneScope({ zoneIds: request.auth?.zoneIds ?? [] });
    const clauses = scope ? [scope.sql] : [];
    const params: unknown[] = scope ? [...scope.params] : [];

    const q = (request.query as { q?: string }).q?.trim();
    if (q) {
      // A % or _ typed into the search box is a literal, not a wildcard, so
      // it is escaped and the ESCAPE clause tells SQLite how.
      const cols = ['hostname', 'ip', 'serial', 'primary_user_name', 'model'];
      clauses.push(`(${cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      params.push(...cols.map(() => like));
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    // "all" is a reserved word, so the alias is quoted; the contract names
    // the field that way and the console reads it by that name.
    return one(
      `SELECT COUNT(*) AS "all",
              SUM(status = 'online') AS online,
              SUM(status = 'offline') AS offline,
              COUNT(DISTINCT zone_id) AS locations
       FROM devices ${where}`,
      params,
    );
  });

  /**
   * Everything the Patch Management page shows above its grids: the Overview
   * tab's four counters, three charts and two tables, the per-tab counters,
   * and the Patch Policies tab's coverage figures.
   *
   * It is one call because the page is one page: eight tabs that each fetched
   * their own counters would make switching tabs a network round trip for
   * figures the same query already has.
   */
  app.get(`${basePath}/patches/summary`, async (request) => {
    const zoneIds = request.auth?.zoneIds ?? [];
    return aggregates.get(`patches:${scopeKey(zoneIds)}`, () => buildPatchSummary(zoneIds));
  });

  /**
   * The six counters above the Deployments grid.
   *
   * They count the whole set of actions, not the filtered page, because each
   * one is a filter a reader can click — a counter that already reflected the
   * filter would always read the same as the grid under it.
   *
   * "With failures" is any action that has recorded a failure, which is not
   * the same as an action whose status is failed: a completed rollout with one
   * bad endpoint is the case worth surfacing.
   */
  app.get(`${basePath}/deployments/summary`, async () =>
    aggregates.get('deployments:summary', () =>
      one<Record<string, number>>(
        `SELECT COUNT(*) AS "all",
                SUM(status IN ('queued', 'running')) AS active,
                SUM(status = 'scheduled') AS scheduled,
                SUM(status = 'completed') AS completed,
                SUM(failed > 0) AS withFailures,
                SUM(status IN ('paused', 'cancelled')) AS pausedOrCancelled
         FROM deployments`,
      ),
    ),
  );

  app.get(`${basePath}/patch-policies`, async () =>
    many<Record<string, unknown>>(
      `SELECT id, name, content, patch_count AS patchCount, rollout, computers,
              compliance_pct AS compliancePct, schedule, next_run_at AS nextRunAt, status
       FROM patch_policies ORDER BY name`,
    ).map((row) => ({
      ...row,
      // Stored as one text column because SQLite has no array type.
      rollout: String(row['rollout'] ?? '')
        .split(',')
        .filter(Boolean),
    })),
  );

  /** The approval states the Patch schema allows a caller to set. */
  const APPROVALS = new Set(['approved', 'test', 'review', 'declined']);

  app.put(`${basePath}/patches/:patchId/approval`, async (request, reply) => {
    const { patchId } = request.params as { patchId: string };
    const body = request.body as { approval?: string };
    if (!body?.approval || !APPROVALS.has(body.approval)) {
      return reply.code(400).send({ title: 'Unknown approval state', status: 400 });
    }
    // Supersession is a fact about the catalogue, not a decision an operator
    // makes, so an update that has been replaced cannot be re-approved.
    const changed = db
      .prepare(`UPDATE patches SET approval = ? WHERE id = ? AND approval <> 'superseded'`)
      .run(body.approval, patchId);
    if (changed.changes === 0) throw notFound();
    aggregates.clear();
    return shapeRow(
      one<Record<string, unknown>>(
        `SELECT id, title, kb, severity, platform, category, subcategory, source, approval,
                superseded_by AS supersededBy, ring, zero_day AS zeroDay,
                missing_count AS endpointsMissing, installed_count AS remediated,
                released_at AS releasedAt
         FROM patches WHERE id = ?`,
        [patchId],
      ),
    );
  });

  /** The five buckets the Missing Patch Age chart uses, in days since release. */
  const AGE_BUCKETS = ['0–7 d', '8–14 d', '15–30 d', '31–60 d', '60+ d'] as const;

  interface PatchCell {
    zoneId: string;
    osLabel: string;
    platform: string;
    tab: string;
    source: string;
    severity: string;
    state: string;
    pairs: number;
    ageSum: number;
    age0: number;
    age1: number;
    age2: number;
    age3: number;
    age4: number;
  }

  /**
   * Everything above the Patch Management grids.
   *
   * The device/patch join is half a million rows and the page wants it sliced
   * five ways, which took seconds to group on request. It is rolled up while
   * seeding instead — see rollUpPatchCells — so this reads a few hundred rows
   * and folds them. Nothing writes to device_patches at runtime, so the two
   * cannot drift; approval, which an operator does change, is read live from
   * the patches table.
   */
  function buildPatchSummary(zoneIds: readonly string[]) {
    const scope = scoped(zoneIds);
    const zoneIn = zoneIds.length ? `WHERE zone_id IN (${zoneIds.map(() => '?').join(',')})` : '';
    const zoneParams = zoneIds.length ? [...zoneIds] : [];

    const cells = many<PatchCell>(
      `SELECT zone_id AS zoneId, os_label AS osLabel, platform, tab, source, severity, state,
              pairs, age_sum AS ageSum, age0, age1, age2, age3, age4
       FROM patch_cells ${zoneIn}`,
      zoneParams,
    );

    const counts = many<{
      dimension: string;
      key: string;
      devices: number;
      criticalDevices: number;
      updates: number;
    }>(
      `SELECT dimension, key, SUM(devices) AS devices,
              SUM(critical_devices) AS criticalDevices, SUM(updates) AS updates
       FROM patch_device_counts ${zoneIn} GROUP BY dimension, key`,
      zoneParams,
    );

    const countOf = (dimension: string, key: string) =>
      counts.find((row) => row.dimension === dimension && row.key === key);

    /** Adds one column of the rolled-up cells, over the ones a predicate picks. */
    const sum = (
      field: 'pairs' | 'ageSum' | 'age0' | 'age1' | 'age2' | 'age3' | 'age4',
      pick: (c: PatchCell) => boolean,
    ): number => cells.reduce((total, c) => (pick(c) ? total + c[field] : total), 0);

    const OPEN = (c: PatchCell) => c.state === 'pending' || c.state === 'failed';
    const DONE = (c: PatchCell) => c.state === 'installed';
    const both = (a: (c: PatchCell) => boolean, b: (c: PatchCell) => boolean) => (c: PatchCell) =>
      a(c) && b(c);

    const installed = sum('pairs', DONE);
    const missing = sum('pairs', OPEN);
    const failed = sum('pairs', (c) => c.state === 'failed');
    const severity = (name: string) =>
      sum(
        'pairs',
        both(OPEN, (c) => c.severity === name),
      );

    const estate = one<{ total: number; restart: number }>(
      `SELECT COUNT(*) AS total, SUM(reboot_pending = 1) AS restart FROM devices ${scope.where}`,
      scope.params,
    );

    /* Endpoints per OS version is a property of the estate, not of the pairs. */
    const endpointsByOs = many<{ label: string; n: number }>(
      `SELECT os_name || ' ' || os_version AS label, COUNT(*) AS n
       FROM devices ${scope.where} GROUP BY label`,
      scope.params,
    );

    const byOsVersion = endpointsByOs
      // An OS the catalogue carries no updates for has no compliance to
      // report. Leaving it in would draw it at 0%, which reads as "nothing is
      // patched" rather than "nothing applies".
      .filter(({ label }) => sum('pairs', (c) => c.osLabel === label) > 0)
      .map(({ label, n }) => {
        const done = sum(
          'pairs',
          both(DONE, (c) => c.osLabel === label),
        );
        const open = sum(
          'pairs',
          both(OPEN, (c) => c.osLabel === label),
        );
        return {
          label,
          platform: cells.find((c) => c.osLabel === label)?.platform ?? '',
          compliantPct: pctOf(done, done + open),
          endpoints: n,
        };
      })
      .sort((a, b) => b.endpoints - a.endpoints);

    const bySource = [...new Set(cells.map((c) => c.source))]
      .map((source) => {
        const done = sum(
          'pairs',
          both(DONE, (c) => c.source === source),
        );
        const open = sum(
          'pairs',
          both(OPEN, (c) => c.source === source),
        );
        const distinct = countOf('source', source);
        return {
          source,
          updates: distinct?.updates ?? 0,
          missing: open,
          critical: sum(
            'pairs',
            both(OPEN, (c) => c.source === source && c.severity === 'critical'),
          ),
          endpointsAffected: distinct?.devices ?? 0,
          compliancePct: pctOf(done, done + open),
        };
      })
      .sort((a, b) => b.missing - a.missing);

    /* The worst endpoints, read live: six rows off the outstanding-pairs index. */
    const scopedDevices = scope.where ? scope.where.replace(/^WHERE /, 'AND d.') : '';
    const devicesNeedingAttention = many<Record<string, unknown>>(
      `SELECT d.id AS deviceId, d.hostname AS name, d.os_name || ' ' || d.os_version AS osVersion,
              SUM(p.severity = 'critical') AS critical, COUNT(*) AS missing
       FROM device_patches dp
       JOIN devices d ON d.id = dp.device_id
       JOIN patches p ON p.id = dp.patch_id
       WHERE dp.state IN ('pending', 'failed') ${scopedDevices}
       GROUP BY d.id ORDER BY critical DESC, missing DESC LIMIT 6`,
      scope.params,
    );

    /* The catalogue is a couple of hundred rows, so these are read live. */
    const topMissing = many<Record<string, unknown>>(
      `SELECT p.id, p.title, p.kb, p.severity, p.platform, p.category, p.source,
              p.approval, p.missing_count AS endpointsMissing, p.installed_count AS remediated,
              p.released_at AS releasedAt
       FROM patches p WHERE p.missing_count > 0
       ORDER BY CASE p.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                p.missing_count DESC
       LIMIT 6`,
    );

    const vendors = many<{ source: string }>(
      `SELECT DISTINCT source FROM patches WHERE source <> '' ORDER BY source`,
    ).map((row) => row.source);

    const catalogue = many<{
      tab: string;
      available: number;
      missing: number;
      bios: number;
      drivers: number;
      awaiting: number;
    }>(
      `SELECT CASE WHEN category IN ('third-party', 'driver-bios') THEN category ELSE platform END AS tab,
              SUM(approval <> 'superseded') AS available,
              SUM(missing_count > 0) AS missing,
              SUM(subcategory = 'bios') AS bios,
              SUM(subcategory = 'driver') AS drivers,
              SUM(approval IN ('review', 'test')) AS awaiting
       FROM patches GROUP BY tab`,
    );

    const whole = one<{
      total: number;
      declined: number;
      superseded: number;
      zeroDay: number;
      applicable: number;
      criticalUpdates: number;
      awaiting: number;
    }>(
      `SELECT COUNT(*) AS total,
              SUM(approval = 'declined') AS declined,
              SUM(approval = 'superseded') AS superseded,
              SUM(zero_day = 1) AS zeroDay,
              SUM(missing_count > 0) AS applicable,
              SUM(severity = 'critical' AND missing_count > 0) AS criticalUpdates,
              SUM(approval IN ('review', 'test')) AS awaiting
       FROM patches`,
    );

    const policyRow = one<{ active: number; total: number }>(
      `SELECT SUM(status = 'active') AS active, COUNT(*) AS total FROM patch_policies`,
    );

    const tabStats = (tab: string) => {
      const distinct = countOf('tab', tab);
      const cat = catalogue.find((row) => row.tab === tab);
      const done = sum(
        'pairs',
        both(DONE, (c) => c.tab === tab),
      );
      const open = sum(
        'pairs',
        both(OPEN, (c) => c.tab === tab),
      );
      return {
        key: tab,
        compliancePct: pctOf(done, done + open),
        endpointsMissing: distinct?.devices ?? 0,
        // Applicability is decided by platform alone, so every endpoint in
        // scope was evaluated against this tab's updates.
        endpointsTotal: estate.total,
        criticalUpdates: distinct?.updates ?? 0,
        updatesAvailable: cat?.available ?? 0,
        updatesMissing: cat?.missing ?? 0,
      };
    };

    const allDevices = countOf('all', '');
    const driversDistinct = countOf('tab', 'driver-bios');
    const driverCatalogue = catalogue.find((row) => row.tab === 'driver-bios');

    return {
      compliancePct: pctOf(installed, installed + missing),
      missingCritical: severity('critical'),
      criticalUpdates: whole.criticalUpdates,
      awaitingApproval: whole.awaiting,
      failedInstalls: failed,
      installed,
      missing,
      devicesTotal: estate.total,
      devicesMissing: allDevices?.devices ?? 0,
      criticalDevices: allDevices?.criticalDevices ?? 0,
      averageAgeDays: missing ? Math.round(sum('ageSum', OPEN) / missing) : 0,
      devicesAwaitingRestart: estate.restart,
      vendors,
      byOsVersion,
      bySeverity: {
        critical: severity('critical'),
        high: severity('high'),
        medium: severity('medium'),
        low: severity('low'),
      },
      byAge: AGE_BUCKETS.map((bucket, i) => ({
        bucket,
        count: sum(`age${i}` as 'age0', OPEN),
      })),
      topMissing: topMissing.map((row) => shapeRow(row)),
      devicesNeedingAttention,
      bySource,
      tabs: {
        platforms: ['windows', 'macos', 'linux', 'third-party'].map(tabStats),
        driversBios: {
          endpointsNeeding: driversDistinct?.devices ?? 0,
          endpointsTotal: estate.total,
          bios: driverCatalogue?.bios ?? 0,
          drivers: driverCatalogue?.drivers ?? 0,
          awaitingApproval: driverCatalogue?.awaiting ?? 0,
        },
        all: {
          total: whole.total,
          applicable: whole.applicable,
          remediated: installed,
          failed,
          declined: whole.declined,
          superseded: whole.superseded,
          zeroDayCves: whole.zeroDay,
        },
      },
      policies: {
        active: policyRow.active,
        total: policyRow.total,
        computersCovered: estate.total,
        computersTotal: estate.total,
        highlyVulnerable: allDevices?.criticalDevices ?? 0,
      },
    };
  }
}
