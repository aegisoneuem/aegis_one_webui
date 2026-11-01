import type { FastifyInstance } from 'fastify';
import { zoneScope, type Db } from '@aegis/mock-core';
import { shapeRow } from './resources';

/**
 * Aggregates behind Overview, DEX, Insight, Licensing and Diagnostics.
 *
 * All of them are computed in SQL. Sending the client 50,000 rows so it can
 * count them itself is the thing the performance budget exists to prevent.
 */
export function registerAggregateRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const scoped = (zoneIds: readonly string[]) => {
    const scope = zoneScope({ zoneIds: [...zoneIds] });
    return { where: scope ? `WHERE ${scope.sql}` : '', params: scope?.params ?? [] };
  };

  const one = <T>(sql: string, params: unknown[] = []): T => db.prepare(sql).get(...params) as T;
  const many = <T>(sql: string, params: unknown[] = []): T[] =>
    db.prepare(sql).all(...params) as T[];

  app.get(`${basePath}/overview`, async (request) => {
    const { where, params } = scoped(request.auth?.zoneIds ?? []);

    const totals = one<{
      total: number;
      online: number;
      offline: number;
      pendingRestart: number;
      encrypted: number;
      avgCompliance: number;
      avgDex: number;
      criticalVulns: number;
      pendingPatches: number;
    }>(
      `SELECT COUNT(*) AS total,
              SUM(status = 'online') AS online,
              SUM(status = 'offline') AS offline,
              SUM(status = 'pending-restart') AS pendingRestart,
              SUM(encrypted = 1) AS encrypted,
              ROUND(AVG(compliance_pct), 1) AS avgCompliance,
              ROUND(AVG(dex_score), 1) AS avgDex,
              SUM(critical_vulns) AS criticalVulns,
              SUM(pending_patches) AS pendingPatches
       FROM devices ${where}`,
      params,
    );

    const staleCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const stale = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM devices ${where ? `${where} AND` : 'WHERE'} last_seen_at < ?`,
      [...params, staleCutoff],
    );

    return {
      endpoints: {
        total: totals.total,
        online: totals.online,
        offline: totals.offline,
        pendingRestart: totals.pendingRestart,
        notSeen7Days: stale.n,
      },
      posture: {
        compliancePct: totals.avgCompliance,
        encryptedPct: totals.total ? Math.round((totals.encrypted / totals.total) * 1000) / 10 : 0,
        dexScore: totals.avgDex,
        criticalVulnerabilities: totals.criticalVulns,
        pendingPatches: totals.pendingPatches,
      },
      byZone: many(
        `SELECT zone_id AS zoneId, zone_name AS zoneName, COUNT(*) AS devices,
                ROUND(AVG(compliance_pct), 1) AS compliancePct,
                SUM(status = 'offline') AS offline
         FROM devices ${where} GROUP BY 1, 2 ORDER BY devices DESC`,
        params,
      ),
      byOs: many(
        `SELECT os_family AS osFamily, os_name AS osName, COUNT(*) AS devices
         FROM devices ${where} GROUP BY 1, 2 ORDER BY devices DESC`,
        params,
      ),
      patchState: many(
        `SELECT state, COUNT(*) AS n FROM device_patches GROUP BY 1 ORDER BY n DESC`,
      ),
      topVulnerabilities: many(
        `SELECT id, title, severity, cvss, exploited, affected_count AS affectedCount
         FROM vulnerabilities WHERE affected_count > 0 ORDER BY exploited DESC, cvss DESC LIMIT 8`,
      ).map((row) => shapeRow(row as Record<string, unknown>)),
      recentDeployments: many(
        `SELECT id, name, type, status, target_count AS targetCount, succeeded, failed, created_at AS createdAt
         FROM deployments ORDER BY created_at DESC LIMIT 6`,
      ),
      serviceHealth: many(
        `SELECT component, status, latency_ms AS latencyMs, message, checked_at AS checkedAt FROM service_health ORDER BY status DESC, component`,
      ),
    };
  });

  app.get(`${basePath}/dex`, async (request) => {
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
  });

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
