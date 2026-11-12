import type { FastifyInstance } from 'fastify';
import { conflict, notFound, zoneScope, type Db } from '@aegis/mock-core';

/**
 * Peer cache: one row per zone, naming the endpoint currently elected to cache
 * for it.
 *
 * The approved page states the rule in its own words — no dedicated
 * distribution servers, a regular endpoint agent is elected and can be
 * re-elected at any time. So every row here points at a real device, and
 * electing is choosing a different one, not provisioning anything.
 *
 * What the page used to read was `/peercache/summary` and `/peercache/peers`:
 * four counters and a flat list of cache *nodes*, neither declared in the
 * contract, at the wrong granularity. The contract has always described this
 * page as a list keyed by zone.
 */

interface PeerRow extends Record<string, unknown> {
  zoneId: string;
  zone: string;
  deviceId: string | null;
  currentPeer: string | null;
  peerStatus: string | null;
  cacheSizeGb: number | null;
  lastTransfer: string | null;
  enabled: number;
  agentStatus: string | null;
  agentVersion: string | null;
  diskFreePct: number | null;
  dexScore: number | null;
}

/**
 * The elected peer for each zone, with the health of the device behind it.
 * A zone with peer caching switched off still appears — it is a zone that
 * could have a cache and does not, which is a thing the page should say.
 */
const PEER_FIELDS = `z.id AS zoneId, z.name AS zone, z.peer_cache AS enabled,
                     p.device_id AS deviceId, p.hostname AS currentPeer,
                     p.status AS peerStatus, p.cache_size_gb AS cacheSizeGb,
                     p.last_transfer_at AS lastTransfer,
                     d.status AS agentStatus, d.agent_version AS agentVersion,
                     d.disk_free_pct AS diskFreePct, d.dex_score AS dexScore`;

const PEER_FROM = `FROM zones z
                   LEFT JOIN peers p ON p.zone_id = z.id AND p.elected = 1
                   LEFT JOIN devices d ON d.id = p.device_id`;

/**
 * The agent health the second column prints. It is the elected device's own
 * state, not the cache's: an offline endpoint cannot serve its neighbours
 * whatever the cache looks like.
 *
 * A zone with nothing elected has no agent to report on, so it reports
 * nothing rather than being called unreachable — there is no endpoint that
 * failed to answer.
 */
function agentHealth(row: PeerRow): 'healthy' | 'degraded' | 'unreachable' | null {
  if (row.currentPeer === null) return null;
  if (row.agentStatus !== 'online') return 'unreachable';
  if (row.peerStatus === 'offline') return 'unreachable';
  // A cache node with little room left is degraded before it fails.
  if (row.peerStatus === 'degraded' || (row.diskFreePct ?? 100) < 15) return 'degraded';
  return 'healthy';
}

/**
 * The health the Status column prints. The reference shows Healthy and
 * Warning; a zone with caching switched off reads Disabled.
 *
 * A cache whose last transfer is long behind the rest of the estate's is
 * warned about rather than called healthy: content that has stopped moving is
 * the failure this page exists to surface, and it does not show up in the
 * agent's own health.
 *
 * `latest` is the newest transfer anywhere in the estate, not the wall clock.
 * The fixture's own clock is frozen (docs/seed.md), so judging staleness
 * against `Date.now()` would report every cache as stale once the seed is a
 * few hours old — a fixture artefact presented as an estate-wide fault. A
 * real backend compares against now; here the newest row *is* now.
 */
function cacheStatus(row: PeerRow, latest: number): 'healthy' | 'warning' | 'disabled' {
  if (row.enabled !== 1 || row.currentPeer === null) return 'disabled';
  if (agentHealth(row) !== 'healthy') return 'warning';
  if (row.lastTransfer === null) return 'warning';
  const behindMinutes = (latest - Date.parse(row.lastTransfer)) / 60_000;
  return behindMinutes > 120 ? 'warning' : 'healthy';
}

export function registerPeerCacheRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const contentOf = db.prepare(
    `SELECT label FROM peer_cache_content WHERE zone_id = ? ORDER BY seq`,
  );

  /** The newest transfer in the estate, which is this fixture's "now". */
  const latestTransfer = (): number => {
    const row = db.prepare(`SELECT MAX(last_transfer_at) AS at FROM peers`).get() as {
      at: string | null;
    };
    return row.at === null ? Date.now() : Date.parse(row.at);
  };

  const shape = (row: PeerRow, now: number) => ({
    zoneId: row.zoneId,
    zone: row.zone,
    enabled: row.enabled === 1,
    deviceId: row.deviceId,
    currentPeer: row.currentPeer,
    agentHealth: agentHealth(row),
    contentCached: (contentOf.all(row.zoneId) as { label: string }[]).map((c) => c.label),
    cacheSizeGb: row.cacheSizeGb ?? 0,
    lastTransfer: row.lastTransfer,
    status: cacheStatus(row, now),
  });

  const rowFor = (zoneId: string) =>
    db.prepare(`SELECT ${PEER_FIELDS} ${PEER_FROM} WHERE z.id = ?`).get(zoneId) as
      PeerRow | undefined;

  app.get(`${basePath}/peercache`, async (request) => {
    // A zone-scoped role sees only its own zones, here as everywhere else.
    const scope = zoneScope({ zoneIds: request.auth?.zoneIds ?? [] }, 'id');
    const where = scope ? `WHERE z.${scope.sql}` : '';
    const rows = db
      .prepare(`SELECT ${PEER_FIELDS} ${PEER_FROM} ${where} ORDER BY z.device_count DESC`)
      .all(...(scope?.params ?? [])) as PeerRow[];

    const latest = latestTransfer();
    return rows.map((row) => shape(row, latest));
  });

  /**
   * Re-elect. The next cache is the zone's steadiest *other* candidate —
   * online, with the most free disk — which is the same rule the fixture used
   * to pick the current one, so the page and the seed cannot disagree about
   * what a good cache looks like.
   */
  app.post(`${basePath}/peercache/:zoneId/elect`, async (request) => {
    const { zoneId } = request.params as { zoneId: string };
    const row = rowFor(zoneId);
    if (!row) throw notFound(`No zone with id ${zoneId}.`);
    if (row.enabled !== 1) throw conflict('Peer caching is switched off for this zone.');

    const next = db
      .prepare(
        `SELECT p.id FROM peers p
           JOIN devices d ON d.id = p.device_id
          WHERE p.zone_id = ? AND p.elected = 0 AND d.status = 'online'
          ORDER BY d.disk_free_pct DESC, d.dex_score DESC, p.id
          LIMIT 1`,
      )
      .get(zoneId) as { id: string } | undefined;

    if (!next) throw conflict('No other endpoint in this zone can take the cache.');

    db.transaction(() => {
      db.prepare(`UPDATE peers SET elected = 0 WHERE zone_id = ?`).run(zoneId);
      db.prepare(`UPDATE peers SET elected = 1, last_transfer_at = NULL WHERE id = ?`).run(next.id);
    })();

    // The new cache has transferred nothing yet, so it reports a warning
    // until it does. That is true, and the page should show it.
    return shape(rowFor(zoneId) as PeerRow, latestTransfer());
  });

  app.put(`${basePath}/peercache/:zoneId/state`, async (request) => {
    const { zoneId } = request.params as { zoneId: string };
    const row = rowFor(zoneId);
    if (!row) throw notFound(`No zone with id ${zoneId}.`);

    const { enabled } = request.body as { enabled: boolean };
    if (enabled && row.currentPeer === null) {
      throw conflict('This zone has no endpoint eligible to cache for it.');
    }
    db.prepare(`UPDATE zones SET peer_cache = ? WHERE id = ?`).run(enabled ? 1 : 0, zoneId);
    return shape(rowFor(zoneId) as PeerRow, latestTransfer());
  });
}
