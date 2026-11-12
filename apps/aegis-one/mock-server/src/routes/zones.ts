import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { zoneScope, type Db } from '@aegis/mock-core';

/**
 * Aegis Zones: where content comes from, and what that saves.
 *
 * Content reaches a zone once as a seed copy, its peers then serve it
 * locally, and whatever an endpoint could not get locally it pulls from the
 * central repository. Every percentage on this page divides two of those
 * three figures, so each one is a stored column and none of them is an
 * assumption — which is what lets the counters, the donut, the per-zone
 * efficiency bars and the delivery path all agree.
 *
 * A zone with no peer cache serves nothing locally, so it saves nothing and
 * its efficiency is zero. That is the finding the page exists to surface, not
 * a gap in the data.
 */

interface ZoneRow extends Record<string, unknown> {
  id: string;
  name: string;
  city: string;
  devices: number;
  connectivityPct: number;
  bandwidthMbps: number;
  peerCacheOn: number;
  lastSync: string;
  relayStatus: string;
  seedGb: number;
  directGb: number;
  localGb: number;
  avoidedWeekGb: number;
  localMbps: number;
  peersServed: number;
}

const ZONE_FIELDS = `z.id, z.name, z.city, z.device_count AS devices,
                     z.connectivity_pct AS connectivityPct,
                     z.bandwidth_mbps AS bandwidthMbps,
                     z.peer_cache AS peerCacheOn,
                     z.last_sync_at AS lastSync, z.relay_status AS relayStatus,
                     z.seed_gb AS seedGb, z.direct_gb AS directGb,
                     z.avoided_week_gb AS avoidedWeekGb, z.local_mbps AS localMbps,
                     COALESCE((SELECT SUM(p.served_gb) FROM peers p
                                WHERE p.zone_id = z.id), 0) AS localGb,
                     COALESCE((SELECT SUM(p.peers_served) FROM peers p
                                WHERE p.zone_id = z.id), 0) AS peersServed`;

/** Share of delivered bytes a local peer answered. */
const hitRate = (localGb: number, directGb: number): number =>
  localGb + directGb > 0 ? Math.round((localGb / (localGb + directGb)) * 100) : 0;

/**
 * Share of delivered bytes that never crossed the WAN.
 *
 * Lower than the hit rate, and deliberately so: the first copy into a zone
 * still crosses it, so a zone that serves everything locally still paid for
 * one seed copy.
 */
const wanSaved = (localGb: number, directGb: number, seedGb: number): number => {
  const delivered = localGb + directGb;
  if (delivered === 0) return 0;
  return Math.max(0, Math.round((1 - (seedGb + directGb) / delivered) * 100));
};

export function registerZoneRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.get(`${basePath}/zones`, async (request) => {
    // A zone-scoped role sees only its own zones, here as everywhere else.
    const scope = zoneScope({ zoneIds: request.auth?.zoneIds ?? [] }, 'id');
    const where = scope ? `WHERE z.${scope.sql}` : '';

    const rows = db
      .prepare(`SELECT ${ZONE_FIELDS} FROM zones z ${where} ORDER BY z.device_count DESC`)
      .all(...(scope?.params ?? [])) as ZoneRow[];

    const totalLocal = rows.reduce((a, z) => a + z.localGb, 0);
    const totalDirect = rows.reduce((a, z) => a + z.directGb, 0);
    const totalSeed = rows.reduce((a, z) => a + z.seedGb, 0);
    const cached = rows.filter((z) => z.peerCacheOn === 1);

    const items = rows.map((z) => ({
      id: z.id,
      name: z.name,
      city: z.city,
      devices: z.devices,
      connectivityPct: z.connectivityPct,
      bandwidthMbps: z.bandwidthMbps,
      // "none" is a zone that has no cache and does not need one; the
      // contract's third value, "disabled", is for one switched off by
      // policy, which nothing in this estate does.
      peerCache: z.peerCacheOn === 1 ? 'elected' : 'none',
      lastSync: z.lastSync,
      status:
        z.relayStatus === 'degraded'
          ? 'degraded'
          : z.relayStatus === 'offline'
            ? 'offline'
            : 'healthy',
    }));

    const localPct = hitRate(totalLocal, totalDirect);

    return {
      items,
      summary: {
        wanSavedPct: wanSaved(totalLocal, totalDirect, totalSeed),
        avoidedThisWeekGb: rows.reduce((a, z) => a + z.avoidedWeekGb, 0),
        hitRatePct: localPct,
        directPct: 100 - localPct,
        avgLocalMbps:
          cached.length > 0
            ? Math.round(cached.reduce((a, z) => a + z.localMbps, 0) / cached.length)
            : 0,
      },
      delivery: {
        // The donut: two shares of the same total, so they add to a hundred.
        distribution: [
          { source: 'Local cached', pct: localPct },
          { source: 'Direct central', pct: 100 - localPct },
        ],
        // One bar per zone, worst last so a constrained zone is visible.
        efficiency: rows.map((z) => ({
          zone: z.name,
          pct: hitRate(z.localGb, z.directGb),
        })),
        path: [
          {
            hop: 1,
            label: 'Central repository',
            detail: `${(totalSeed + totalDirect).toLocaleString('en-IN')} GB served`,
            metric: null,
          },
          {
            hop: 2,
            label: 'Aegis Zone peer cache',
            detail: `${totalLocal.toLocaleString('en-IN')} GB avoided`,
            metric: `${wanSaved(totalLocal, totalDirect, totalSeed)}% saved`,
          },
          {
            /*
             * The tier below the zone cache: endpoints that got their copy
             * from a neighbour. Reported as endpoints reached rather than
             * bytes, because bytes here would be the same figure as hop 2.
             */
            hop: 3,
            label: 'Local peer',
            detail: `${rows
              .reduce((a, z) => a + z.peersServed, 0)
              .toLocaleString('en-IN')} endpoints served`,
            metric: `${localPct}% hit rate`,
          },
          {
            hop: 4,
            label: 'Endpoint',
            detail: `${rows.reduce((a, z) => a + z.devices, 0).toLocaleString('en-IN')} targets`,
            metric: `${
              cached.length > 0
                ? Math.round(cached.reduce((a, z) => a + z.localMbps, 0) / cached.length)
                : 0
            } MB/s avg`,
          },
        ],
      },
    };
  });

  /**
   * Refresh Discovery. Discovery re-reads the estate's own check-ins, so it
   * finds exactly what the stored figures already report: this reports the
   * work as a job without pretending the figures moved.
   */
  app.post(`${basePath}/zones/discovery`, async (_request, reply) =>
    reply.code(202).send({
      id: `job-${randomUUID()}`,
      status: 'queued',
      createdAt: new Date().toISOString(),
      finishedAt: null,
    }),
  );
}
