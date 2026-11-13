import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, conflict, notFound, type Db } from '@aegis/mock-core';

/**
 * Integrations: four tabs over four kinds of thing.
 *
 * A **connector** is an outbound integration with a granted scope. A **SIEM
 * destination** is a log target. A **notification channel** is somewhere an
 * alert rule can send. A **delivery** is one attempt at one event. The page
 * that used to be here flattened all four into a single table with a `kind`
 * column, which is why it could show a name and an event count and nothing
 * else — no scope, no transport, no rules, no log.
 *
 * Two rules hold across every write here:
 *
 * - **Secrets are write-only.** A token or password submitted to a configure
 *   route is accepted and never read back; nothing in any response carries
 *   one, and nothing is stored in this fixture at all.
 * - **A test is a delivery.** Testing a destination appends to the same log
 *   the tab reads, so a test event is visible where real ones are rather
 *   than in a dialog that disappears.
 */

interface ConnectorRow extends Record<string, unknown> {
  id: string;
  name: string;
  kind: string;
  status: string;
  purpose: string;
  scope: string | null;
  lastActivity: string | null;
}

interface SiemRow extends Record<string, unknown> {
  id: string;
  name: string;
  transport: string;
  protocol: string;
  status: string;
  host: string | null;
  port: number | null;
  eventTypes: number;
  lastSentAt: string | null;
  ratePerHour: number | null;
  enabled: number;
}

interface ChannelRow extends Record<string, unknown> {
  id: string;
  name: string;
  transport: string;
  status: string;
  eventTypes: number | null;
  lastSentAt: string | null;
  ratePerHour: number | null;
}

interface RuleRow extends Record<string, unknown> {
  id: string;
  event: string;
  enabled: number;
}

interface DeliveryRow extends Record<string, unknown> {
  id: string;
  connector: string;
  eventType: string;
  event: string;
  at: string;
  outcome: string;
  httpStatus: number | null;
}

const CONNECTOR_FIELDS = `id, name, kind, status, purpose, scope,
                          last_sync_at AS lastActivity`;

const SIEM_FIELDS = `id, name, transport, protocol, status, host, port,
                     event_types AS eventTypes, last_sent_at AS lastSentAt,
                     rate_per_hour AS ratePerHour, enabled`;

const CHANNEL_FIELDS = `id, name, transport, status, event_types AS eventTypes,
                        last_sent_at AS lastSentAt, rate_per_hour AS ratePerHour`;

const DELIVERY_FIELDS = `id, connector_name AS connector, event_type AS eventType,
                         event, at, outcome, http_status AS httpStatus`;

const OUTCOMES = new Set(['delivered', 'failed', 'retrying']);

/** The three transports a destination can speak, as the contract names them. */
const PROTOCOLS = new Set(['syslog-tls', 'syslog-udp', 'https']);

export function registerIntegrationRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  /** One row per channel on a rule, in the order the Send To column prints them. */
  const channelsOf = db.prepare(
    `SELECT c.id, c.name, c.status
       FROM notification_rule_channels rc
       JOIN notification_channels c ON c.id = rc.channel_id
      WHERE rc.rule_id = ?
      ORDER BY rc.seq`,
  );

  const shapeRule = (row: RuleRow) => ({
    id: row.id,
    event: row.event,
    channels: channelsOf.all(row.id) as { id: string; name: string; status: string }[],
    enabled: row.enabled === 1,
  });

  const ruleById = (id: string) =>
    db.prepare(`SELECT id, event, enabled FROM notification_rules WHERE id = ?`).get(id) as
      RuleRow | undefined;

  /**
   * Records one delivery attempt, which is what a test is. The outcome is the
   * target's own state: a destination that is not configured has nothing to
   * deliver to, and the route refuses before reaching here.
   */
  const recordDelivery = (
    targetId: string,
    targetName: string,
    eventType: string,
    event: string,
  ) => {
    const id = `del-test-${randomUUID()}`;
    const at = new Date().toISOString();
    db.prepare(
      `INSERT INTO deliveries (id,connector_id,connector_name,event_type,event,at,outcome,http_status)
       VALUES (?,?,?,?,?,?,'delivered',200)`,
    ).run(id, targetId, targetName, eventType, event, at);
    return {
      id,
      connector: targetName,
      eventType,
      event,
      at,
      outcome: 'delivered',
      httpStatus: 200,
    };
  };

  // --- Connectors ----------------------------------------------------------

  app.get(`${basePath}/integrations/connectors`, async () =>
    (
      db.prepare(`SELECT ${CONNECTOR_FIELDS} FROM connectors ORDER BY seq`).all() as ConnectorRow[]
    ).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      status: c.status,
      purpose: c.purpose,
      scope: c.scope,
      lastActivity: c.lastActivity,
      logoUrl: null,
    })),
  );

  /**
   * Add a custom webhook. The URL must be https and must not point inside the
   * estate: a webhook that posts to a private address is an egress hole, and
   * the contract says the target is checked against an allow-list.
   */
  app.post(`${basePath}/integrations/connectors`, async (request, reply) => {
    const body = request.body as { name: string; url: string; events: string[] };
    let host: string;
    try {
      const parsed = new URL(body.url);
      if (parsed.protocol !== 'https:') throw new Error('not https');
      host = parsed.hostname.toLowerCase();
    } catch {
      throw badRequest('The target URL must be a valid https:// address.', { url: 'invalid' });
    }
    // Loopback, link-local and the three private ranges never leave the estate.
    if (
      host === 'localhost' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      throw badRequest('That host is not on the egress allow-list.', { url: 'not-allowed' });
    }

    const id = `con-hook-${randomUUID()}`;
    const seq =
      ((db.prepare(`SELECT MAX(seq) AS n FROM connectors`).get() as { n: number | null }).n ?? 0) +
      1;
    db.prepare(
      `INSERT INTO connectors (id,name,kind,status,purpose,scope,last_sync_at,seq)
       VALUES (?,?,'webhook','connected',?,'Deployments: Read',NULL,?)`,
    ).run(id, body.name, `${body.events.join(', ')} → ${body.url}`, seq);

    return reply.code(201).send({
      id,
      name: body.name,
      kind: 'webhook',
      status: 'connected',
      purpose: `${body.events.join(', ')} → ${body.url}`,
      scope: 'Deployments: Read',
      lastActivity: null,
      logoUrl: null,
    });
  });

  app.put(`${basePath}/integrations/connectors/:connectorId`, async (request) => {
    const { connectorId } = request.params as { connectorId: string };
    const row = db
      .prepare(`SELECT ${CONNECTOR_FIELDS} FROM connectors WHERE id = ?`)
      .get(connectorId) as ConnectorRow | undefined;
    if (!row) throw notFound(`No connector with id ${connectorId}.`);

    const body = request.body as { enabled?: boolean };
    // The secret, if one was sent, is accepted and dropped: nothing in this
    // fixture stores it and nothing reads it back.
    if (body.enabled !== undefined) {
      db.prepare(`UPDATE connectors SET status = ? WHERE id = ?`).run(
        body.enabled ? 'connected' : 'disabled',
        connectorId,
      );
    }
    const after = db
      .prepare(`SELECT ${CONNECTOR_FIELDS} FROM connectors WHERE id = ?`)
      .get(connectorId) as ConnectorRow;
    return { ...after, logoUrl: null };
  });

  app.post(`${basePath}/integrations/connectors/:connectorId/test`, async (request) => {
    const { connectorId } = request.params as { connectorId: string };
    const row = db.prepare(`SELECT id, name FROM connectors WHERE id = ?`).get(connectorId) as
      { id: string; name: string } | undefined;
    if (!row) throw notFound(`No connector with id ${connectorId}.`);
    return recordDelivery(row.id, row.name, 'Audit Trail', 'integration.test');
  });

  // --- SIEM and syslog -----------------------------------------------------

  app.get(`${basePath}/integrations/siem`, async () =>
    (
      db.prepare(`SELECT ${SIEM_FIELDS} FROM siem_destinations ORDER BY seq`).all() as SiemRow[]
    ).map((d) => ({
      id: d.id,
      name: d.name,
      transport: d.transport,
      protocol: d.protocol,
      status: d.status,
      host: d.host,
      port: d.port,
      eventTypes: d.eventTypes,
      lastSentAt: d.lastSentAt,
      ratePerHour: d.ratePerHour,
      enabled: d.enabled === 1,
    })),
  );

  app.put(`${basePath}/integrations/siem/:destinationId`, async (request) => {
    const { destinationId } = request.params as { destinationId: string };
    const row = db
      .prepare(`SELECT ${SIEM_FIELDS} FROM siem_destinations WHERE id = ?`)
      .get(destinationId) as SiemRow | undefined;
    if (!row) throw notFound(`No siem destination with id ${destinationId}.`);

    const body = request.body as {
      host?: string;
      port?: number;
      protocol?: string;
      enabled?: boolean;
    };
    if (body.protocol !== undefined && !PROTOCOLS.has(body.protocol)) {
      throw badRequest('Unknown protocol.', { protocol: 'invalid' });
    }

    const host = body.host ?? row.host;
    const port = body.port ?? row.port;
    const enabled = body.enabled ?? host !== null;
    // A destination counts as configured once it has somewhere to send to.
    const status = enabled && host !== null ? 'connected' : 'not-configured';

    db.prepare(
      `UPDATE siem_destinations
          SET host = ?, port = ?, protocol = ?, enabled = ?, status = ?
        WHERE id = ?`,
    ).run(host, port, body.protocol ?? row.protocol, enabled ? 1 : 0, status, destinationId);

    const after = db
      .prepare(`SELECT ${SIEM_FIELDS} FROM siem_destinations WHERE id = ?`)
      .get(destinationId) as SiemRow;
    return { ...after, enabled: after.enabled === 1 };
  });

  app.post(`${basePath}/integrations/siem/:destinationId/test`, async (request) => {
    const { destinationId } = request.params as { destinationId: string };
    const row = db
      .prepare(`SELECT id, name, status FROM siem_destinations WHERE id = ?`)
      .get(destinationId) as { id: string; name: string; status: string } | undefined;
    if (!row) throw notFound(`No siem destination with id ${destinationId}.`);
    if (row.status !== 'connected') throw conflict('Set the destination up before testing it.');
    return recordDelivery(row.id, row.name, 'Audit Trail', 'integration.test');
  });

  // --- Notification channels ----------------------------------------------

  app.get(`${basePath}/integrations/channels`, async () =>
    (
      db
        .prepare(`SELECT ${CHANNEL_FIELDS} FROM notification_channels ORDER BY seq`)
        .all() as ChannelRow[]
    ).map((c) => ({
      id: c.id,
      name: c.name,
      transport: c.transport,
      status: c.status,
      eventTypes: c.eventTypes,
      lastSentAt: c.lastSentAt,
      ratePerHour: c.ratePerHour,
    })),
  );

  app.put(`${basePath}/integrations/channels/:channelId`, async (request) => {
    const { channelId } = request.params as { channelId: string };
    const row = db
      .prepare(`SELECT ${CHANNEL_FIELDS} FROM notification_channels WHERE id = ?`)
      .get(channelId) as ChannelRow | undefined;
    if (!row) throw notFound(`No notification channel with id ${channelId}.`);

    const body = request.body as { endpoint?: string; enabled?: boolean };
    const configured = body.enabled ?? body.endpoint !== undefined;
    db.prepare(`UPDATE notification_channels SET status = ? WHERE id = ?`).run(
      configured ? 'connected' : 'not-configured',
      channelId,
    );
    return db
      .prepare(`SELECT ${CHANNEL_FIELDS} FROM notification_channels WHERE id = ?`)
      .get(channelId) as ChannelRow;
  });

  app.post(`${basePath}/integrations/channels/:channelId/test`, async (request) => {
    const { channelId } = request.params as { channelId: string };
    const row = db
      .prepare(`SELECT id, name, status FROM notification_channels WHERE id = ?`)
      .get(channelId) as { id: string; name: string; status: string } | undefined;
    if (!row) throw notFound(`No notification channel with id ${channelId}.`);
    if (row.status !== 'connected') throw conflict('Set the channel up before testing it.');
    return recordDelivery(row.id, row.name, 'Deployments', 'notification.test');
  });

  // --- Alert rules ---------------------------------------------------------

  app.get(`${basePath}/integrations/notifications`, async () =>
    (
      db
        .prepare(`SELECT id, event, enabled FROM notification_rules ORDER BY seq`)
        .all() as RuleRow[]
    ).map(shapeRule),
  );

  app.post(`${basePath}/integrations/notifications`, async (request, reply) => {
    const body = request.body as { event: string; channelIds: string[] };

    const known = new Set(
      (db.prepare(`SELECT id FROM notification_channels`).all() as { id: string }[]).map(
        (c) => c.id,
      ),
    );
    const unknown = body.channelIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw badRequest('Unknown notification channel.', { channelIds: 'unknown' });
    }

    const id = `rule-${randomUUID()}`;
    const seq =
      ((db.prepare(`SELECT MAX(seq) AS n FROM notification_rules`).get() as { n: number | null })
        .n ?? 0) + 1;
    db.transaction(() => {
      // A new rule arrives switched on: the reference's Add Rule has no
      // enabled control, and a rule nobody asked to be off is on.
      db.prepare(`INSERT INTO notification_rules (id,event,enabled,seq) VALUES (?,?,1,?)`).run(
        id,
        body.event,
        seq,
      );
      const link = db.prepare(
        `INSERT INTO notification_rule_channels (rule_id,channel_id,seq) VALUES (?,?,?)`,
      );
      body.channelIds.forEach((channelId, i) => link.run(id, channelId, i));
    })();

    return reply.code(201).send(shapeRule({ id, event: body.event, enabled: 1 }));
  });

  app.patch(`${basePath}/integrations/notifications/:ruleId`, async (request) => {
    const { ruleId } = request.params as { ruleId: string };
    if (!ruleById(ruleId)) throw notFound(`No notification rule with id ${ruleId}.`);
    const body = request.body as { enabled: boolean };
    db.prepare(`UPDATE notification_rules SET enabled = ? WHERE id = ?`).run(
      body.enabled ? 1 : 0,
      ruleId,
    );
    return shapeRule(ruleById(ruleId) as RuleRow);
  });

  app.delete(`${basePath}/integrations/notifications/:ruleId`, async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    if (!ruleById(ruleId)) throw notFound(`No notification rule with id ${ruleId}.`);
    db.transaction(() => {
      db.prepare(`DELETE FROM notification_rule_channels WHERE rule_id = ?`).run(ruleId);
      db.prepare(`DELETE FROM notification_rules WHERE id = ?`).run(ruleId);
    })();
    return reply.code(204).send();
  });

  // --- Delivery log --------------------------------------------------------

  app.get(`${basePath}/integrations/deliveries`, async (request) => {
    const query = request.query as {
      cursor?: string;
      limit?: string;
      q?: string;
      connector?: string;
      eventType?: string;
      result?: string;
    };

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const where: string[] = [];
    const params: unknown[] = [];

    if (query.connector) {
      where.push('connector_id = ?');
      params.push(query.connector);
    }
    if (query.eventType) {
      where.push('event_type = ?');
      params.push(query.eventType);
    }
    if (query.result) {
      if (!OUTCOMES.has(query.result)) throw badRequest('Unknown result.', { result: 'invalid' });
      where.push('outcome = ?');
      params.push(query.result);
    }
    if (query.q) {
      where.push('LOWER(event) LIKE ?');
      params.push(`%${query.q.trim().toLowerCase()}%`);
    }

    /*
     * The cursor is the row's (at, id) pair, so paging is stable even where
     * several events share a timestamp — the log is written in bursts, so
     * they routinely do.
     */
    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8');
      const [at, id] = decoded.split('|');
      if (!at || !id) throw badRequest('Malformed cursor.', { cursor: 'invalid' });
      where.push('(at < ? OR (at = ? AND id < ?))');
      params.push(at, at, id);
    }

    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT ${DELIVERY_FIELDS} FROM deliveries ${clause}
          ORDER BY at DESC, id DESC LIMIT ?`,
      )
      .all(...params, limit + 1) as DeliveryRow[];

    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM deliveries ${clause}`).get(...params) as { n: number }
    ).n;

    return {
      items,
      page: {
        total,
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(`${last.at}|${last.id}`, 'utf8').toString('base64url')
            : null,
      },
    };
  });
}
