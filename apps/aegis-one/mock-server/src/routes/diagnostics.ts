import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Db } from '@aegis/mock-core';

/**
 * System Health: the services, the day's events, and the two actions.
 *
 * Three of the seven services carry no stored signal. The agent gateway, the
 * peer cache controller and the notification service are counted from the
 * estate here, because the console already knows how many agents are online,
 * how many zones are delivering badly and how many notifications are queued.
 * A health page whose "27/32 agents connected" disagreed with the Devices
 * page would be worse than no health page.
 *
 * The page the server used to serve for this was `/diagnostics` — services,
 * zones and some counts, in a shape the contract does not mention. The
 * contract has always declared `/diagnostics/health` with a summary, the
 * services and the events.
 */

interface ServiceRow extends Record<string, unknown> {
  component: string;
  status: string;
  signal: string;
  detail: string;
  derived: string | null;
  checkedAt: string;
}

interface EventRow extends Record<string, unknown> {
  at: string;
  level: string;
  message: string;
}

export function registerDiagnosticsRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.get(`${basePath}/diagnostics/health`, async () => {
    const agents = db
      .prepare(`SELECT COUNT(*) AS total, SUM(status = 'online') AS online FROM devices`)
      .get() as { total: number; online: number };

    /*
     * A zone is delivering badly when its peers served less than 70% of what
     * reached it. That is the same arithmetic the Aegis Zones page prints as
     * its efficiency bars, so the two pages cannot disagree about which zone
     * is in trouble.
     */
    const badZones = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM (
             SELECT z.id,
                    COALESCE((SELECT SUM(p.served_gb) FROM peers p WHERE p.zone_id = z.id), 0) AS local,
                    z.direct_gb AS direct
               FROM zones z
              WHERE z.peer_cache = 1
           )
           WHERE local + direct > 0 AND (local * 100.0) / (local + direct) < 70`,
        )
        .get() as { n: number }
    ).n;

    const queued = (
      db.prepare(`SELECT COUNT(*) AS n FROM deliveries WHERE outcome = 'retrying'`).get() as {
        n: number;
      }
    ).n;

    const rows = db
      .prepare(
        `SELECT component, status, signal, detail, derived, checked_at AS checkedAt
           FROM service_health ORDER BY seq`,
      )
      .all() as ServiceRow[];

    const services = rows.map((row) => {
      let signal = row.signal;
      let status = row.status;
      if (row.derived === 'agents') {
        // Grouped, as the counter above the table groups it.
        signal = `${agents.online.toLocaleString('en-IN')}/${agents.total.toLocaleString('en-IN')}`;
      } else if (row.derived === 'peercache') {
        signal = badZones === 1 ? '1 zone' : `${badZones} zones`;
        // A controller with nothing below threshold is not degraded.
        status = badZones > 0 ? 'degraded' : 'healthy';
      } else if (row.derived === 'notifications') {
        signal = `${queued} queued`;
      }
      return { name: row.component, status, signal, detail: row.detail };
    });

    const events = db
      .prepare(
        `SELECT at, level, message FROM health_events
          WHERE at >= ? ORDER BY at`,
      )
      .all(new Date(Date.now() - 24 * 3_600_000).toISOString()) as EventRow[];

    const healthy = services.filter((s) => s.status === 'healthy').length;

    return {
      // When these checks ran. The page buckets its events against this.
      asOf: new Date().toISOString(),
      summary: {
        servicesHealthy: healthy,
        servicesTotal: services.length,
        degraded: services.filter((s) => s.status !== 'healthy').length,
        agentsConnected: agents.online,
        agentsTotal: agents.total,
        warnings24h: events.filter((e) => e.level === 'warning').length,
      },
      services,
      events,
    };
  });

  /**
   * Run Health Check. The checks are the same ones the page already reports,
   * so this re-runs them as a job rather than inventing a second opinion.
   */
  app.post(`${basePath}/diagnostics/health-check`, async (_request, reply) =>
    reply.code(202).send({
      id: `job-${randomUUID()}`,
      status: 'queued',
      createdAt: new Date().toISOString(),
      finishedAt: null,
    }),
  );

  /**
   * Download Diagnostic Bundle. Built server-side and polled like any other
   * export, which is why it returns an export rather than a file: a bundle of
   * server logs is not something a browser should be streaming synchronously.
   */
  app.post(`${basePath}/diagnostics/bundle`, async (_request, reply) =>
    reply.code(202).send({
      id: `exp-${randomUUID()}`,
      status: 'queued',
      format: 'zip',
      // Absent until ready, as the contract says of a signed download path.
      downloadUrl: null,
      expiresAt: null,
    }),
  );
}
