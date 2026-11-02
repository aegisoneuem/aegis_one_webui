import type { FastifyInstance } from 'fastify';
import { TtlCache, zoneScope, type Db } from '@aegis/mock-core';
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
                succeeded, failed, pending,
                created_by AS triggeredBy, created_at AS triggeredAt
         FROM deployments ORDER BY created_at DESC LIMIT 6`,
      ).map(({ succeeded, failed, pending, ...row }) => ({
        ...shapeRow(row),
        counts: { done: succeeded, failed, pending },
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

  /**
   * AEGIS Insight: the same aggregates, framed as findings with a suggested
   * action. Every figure here comes from a query above — nothing is invented,
   * and nothing is predicted.
   */
  app.get(`${basePath}/insight`, async (request) => {
    const { where, params } = scoped(request.auth?.zoneIds ?? []);
    const lowDisk = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM devices ${where ? `${where} AND` : 'WHERE'} disk_free_pct < 10`,
      params,
    );
    const unencrypted = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM devices ${where ? `${where} AND` : 'WHERE'} encrypted = 0`,
      params,
    );
    const oldAgent = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM devices ${where ? `${where} AND` : 'WHERE'} agent_version < '7.4.0'`,
      params,
    );
    const exploited = one<{ devices: number; cves: number }>(
      `SELECT SUM(affected_count) AS devices, COUNT(*) AS cves FROM vulnerabilities WHERE exploited = 1 AND affected_count > 0`,
    );
    const worstZone = one<{ zoneName: string; compliancePct: number }>(
      `SELECT zone_name AS zoneName, ROUND(AVG(compliance_pct), 1) AS compliancePct
       FROM devices ${where} GROUP BY 1 ORDER BY compliancePct ASC LIMIT 1`,
      params,
    );

    return {
      findings: [
        {
          id: 'exploited-cves',
          severity: 'critical',
          title: `${exploited.cves} vulnerabilities with known exploits are open on ${exploited.devices?.toLocaleString('en-IN') ?? 0} endpoints`,
          detail: 'These have public exploit code. Patch them ahead of the normal cycle.',
          action: {
            label: 'Open Vulnerabilities',
            page: 'vulns',
            filter: { exploited: 'true', state: 'open' },
          },
        },
        {
          id: 'unencrypted',
          severity: 'high',
          title: `${unencrypted.n.toLocaleString('en-IN')} endpoints have no full-disk encryption`,
          detail: 'A lost or stolen device exposes whatever is on it.',
          action: { label: 'Open Devices', page: 'devices', filter: { encrypted: 'false' } },
        },
        {
          id: 'low-disk',
          severity: 'medium',
          title: `${lowDisk.n.toLocaleString('en-IN')} endpoints have under 10% free disk`,
          detail: 'Patch and software installs fail on these before they start.',
          action: { label: 'Open Devices', page: 'devices', filter: { 'diskFreePct.lte': '10' } },
        },
        {
          id: 'old-agent',
          severity: 'medium',
          title: `${oldAgent.n.toLocaleString('en-IN')} endpoints are on an agent older than 7.4`,
          detail: 'Older agents do not report configuration results.',
          action: {
            label: 'Open Devices',
            page: 'devices',
            filter: { 'agentVersion.lte': '7.3.9' },
          },
        },
        {
          id: 'worst-zone',
          severity: 'medium',
          title: `${worstZone?.zoneName ?? 'One zone'} has the lowest patch compliance at ${worstZone?.compliancePct ?? 0}%`,
          detail: 'Check the relay for that zone before scheduling more work into it.',
          action: { label: 'Open Aegis Zones', page: 'sites' },
        },
      ],
    };
  });

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

  app.get(`${basePath}/peercache/summary`, async (request) => {
    const scope = zoneScope({ zoneIds: request.auth?.zoneIds ?? [] });
    const where = scope ? `WHERE ${scope.sql}` : '';
    return {
      totals: one(
        `SELECT COUNT(*) AS peers, SUM(served_gb) AS servedGb, SUM(cache_used_gb) AS usedGb,
                SUM(cache_size_gb) AS capacityGb, SUM(peers_served) AS peersServed
         FROM peers ${where}`,
        scope?.params ?? [],
      ),
      byZone: many(
        `SELECT zone_name AS zoneName, COUNT(*) AS peers, SUM(served_gb) AS servedGb
         FROM peers ${where} GROUP BY 1 ORDER BY servedGb DESC`,
        scope?.params ?? [],
      ),
    };
  });

  app.get(`${basePath}/admin/roles`, async () =>
    many(
      `SELECT id, name, permissions, system, zone_ids AS zoneIds, user_count AS userCount FROM roles ORDER BY system DESC, name`,
    ).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        ...shapeRow(r),
        permissions: JSON.parse(String(r['permissions'])) as string[],
        zoneIds: JSON.parse(String(r['zoneIds'])) as string[],
      };
    }),
  );
}
