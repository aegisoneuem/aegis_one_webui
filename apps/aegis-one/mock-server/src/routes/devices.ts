import type { FastifyInstance } from 'fastify';
import { TtlCache, notFound, zoneScope, type Db } from '@aegis/mock-core';
import { shapeRow } from './resources';

/**
 * The sub-resources behind the device detail tabs.
 *
 * Every one of them re-checks that the device is visible to the caller before
 * returning anything. Checking only on the parent route would make the id an
 * IDOR: `/devices/dev-1/software` is reachable without ever calling
 * `/devices/dev-1`.
 */
/** Same reasoning as the aggregates: six full scans, shared for a few seconds. */
const facetCache = new TtlCache<unknown>({
  ttlMs: Number(process.env['MOCK_AGGREGATE_TTL_MS'] ?? 5000),
});

export function registerDeviceRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const assertVisible = (
    deviceId: string,
    zoneIds: readonly string[],
  ): { id: string; hostname: string } => {
    const scope = zoneScope({ zoneIds: [...zoneIds] });
    const sql = `SELECT id, hostname FROM devices WHERE id = ?${scope ? ` AND ${scope.sql}` : ''}`;
    const row = db.prepare(sql).get(deviceId, ...(scope?.params ?? [])) as
      { id: string; hostname: string } | undefined;
    if (!row) throw notFound();
    return row;
  };

  app.get(`${basePath}/devices/:deviceId/software`, async (request) => {
    const { deviceId } = request.params as { deviceId: string };
    assertVisible(deviceId, request.auth?.zoneIds ?? []);
    const rows = db
      .prepare(
        `SELECT s.id, s.title, s.publisher, s.category, ds.version, s.latest_version AS latestVersion,
                ds.outdated, ds.installed_at AS installedAt, s.size_mb AS sizeMb
         FROM device_software ds JOIN software s ON s.id = ds.software_id
         WHERE ds.device_id = ? ORDER BY s.title`,
      )
      .all(deviceId) as Record<string, unknown>[];
    return {
      items: rows.map((r) => ({ ...shapeRow(r), outdated: r['outdated'] === 1 })),
      page: { nextCursor: null, total: rows.length },
    };
  });

  app.get(`${basePath}/devices/:deviceId/patches`, async (request) => {
    const { deviceId } = request.params as { deviceId: string };
    assertVisible(deviceId, request.auth?.zoneIds ?? []);
    const rows = db
      .prepare(
        `SELECT p.id, p.title, p.kb, p.severity, p.category, p.platform, p.released_at AS releasedAt,
                dp.state, dp.updated_at AS updatedAt, p.reboot_required AS rebootRequired
         FROM device_patches dp JOIN patches p ON p.id = dp.patch_id
         WHERE dp.device_id = ? ORDER BY p.released_at DESC`,
      )
      .all(deviceId) as Record<string, unknown>[];
    return { items: rows.map((r) => shapeRow(r)), page: { nextCursor: null, total: rows.length } };
  });

  app.get(`${basePath}/devices/:deviceId/vulnerabilities`, async (request) => {
    const { deviceId } = request.params as { deviceId: string };
    assertVisible(deviceId, request.auth?.zoneIds ?? []);
    const rows = db
      .prepare(
        `SELECT v.id, v.title, v.severity, v.cvss, v.exploited, v.affects, v.fixed_by AS fixedBy,
                v.published_at AS publishedAt, dv.state, dv.first_seen_at AS firstSeenAt
         FROM device_vulnerabilities dv JOIN vulnerabilities v ON v.id = dv.vulnerability_id
         WHERE dv.device_id = ? ORDER BY v.cvss DESC`,
      )
      .all(deviceId) as Record<string, unknown>[];
    return { items: rows.map((r) => shapeRow(r)), page: { nextCursor: null, total: rows.length } };
  });

  /**
   * Diagnostics tab: the device's own posture, plus the jobs and log bundles
   * that touched it. Read-only — nothing here opens a channel to the endpoint.
   */
  app.get(`${basePath}/devices/:deviceId/diagnostics`, async (request) => {
    const { deviceId } = request.params as { deviceId: string };
    assertVisible(deviceId, request.auth?.zoneIds ?? []);

    const device = db
      .prepare(
        `SELECT disk_free_pct AS diskFreePct, disk_total_gb AS diskTotalGb, ram_gb AS ramGb,
                agent_version AS agentVersion, last_seen_at AS lastSeenAt, dex_score AS dexScore,
                config_pass_pct AS configPassPct, encrypted, reboot_pending AS rebootPending
         FROM devices WHERE id = ?`,
      )
      .get(deviceId) as Record<string, unknown>;

    const jobs = db
      .prepare(
        `SELECT r.job_id AS jobId, j.name, j.kind, r.state, r.exit_code AS exitCode,
                r.duration_ms AS durationMs, r.finished_at AS finishedAt
         FROM live_job_results r JOIN live_jobs j ON j.id = r.job_id
         WHERE r.device_id = ? ORDER BY r.finished_at DESC LIMIT 25`,
      )
      .all(deviceId) as Record<string, unknown>[];

    const bundles = db
      .prepare(
        `SELECT id, file_types AS fileTypes, status, size_bytes AS sizeBytes, collected_at AS collectedAt
         FROM log_bundles WHERE device_id = ? ORDER BY collected_at DESC LIMIT 25`,
      )
      .all(deviceId) as Record<string, unknown>[];

    return {
      posture: shapeRow(device),
      recentJobs: jobs.map((j) => shapeRow(j)),
      logBundles: bundles.map((b) => ({
        ...shapeRow(b),
        fileTypes: JSON.parse(String(b['fileTypes'])) as string[],
      })),
    };
  });

  /** Facet counts for the Devices filter bar, over the same filters as the list. */
  app.get(`${basePath}/devices/facets`, async (request) =>
    facetCache.get((request.auth?.zoneIds ?? []).join(',') || 'all', () => {
      const scope = request.auth ? zoneScope(request.auth) : undefined;
      const where = scope ? `WHERE ${scope.sql}` : '';
      const params = scope?.params ?? [];
      const facet = (column: string) =>
        Object.fromEntries(
          (
            db
              .prepare(
                `SELECT "${column}" AS k, COUNT(*) AS n FROM devices ${where} GROUP BY 1 ORDER BY 2 DESC`,
              )
              .all(...params) as { k: string; n: number }[]
          ).map((r) => [r.k, r.n]),
        );

      return {
        status: facet('status'),
        osFamily: facet('os_family'),
        zoneName: facet('zone_name'),
        department: facet('department'),
        agentVersion: facet('agent_version'),
        kind: facet('kind'),
      };
    }),
  );
}
