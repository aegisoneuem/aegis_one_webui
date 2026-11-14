import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, conflict, notFound, type Db } from '@aegis/mock-core';

/**
 * Remote Control: consent-first, audited, and recorded by policy.
 *
 * This module exists because the console's README used to say there must be
 * no remote control at all. That line is out of date — remote control is a
 * requirement now — but the reason behind it is not, so the shape here keeps
 * it: nothing connects without the end user's agreement, the on-screen
 * indicator cannot be switched off, every session is a row with a named
 * operator and a reason, and the policy is enforced on the server rather than
 * asked of the client.
 *
 * What this does not do is move pixels. v130's own Remote Control is a
 * browser demo that pairs two tabs over WebRTC; a real session needs the
 * agent, and the agent is not part of this mock. So a session here is its
 * record: requested, consented to or declined, open, ended, with who and why.
 */

type Consent = 'ask' | 'notify';
type Mode = 'view' | 'control' | 'chat';
type State = 'pending-consent' | 'open' | 'ended';

interface PolicyRow {
  consent: string;
  require_reason: number;
  record: number;
  chat: number;
  idle_minutes: number;
  max_minutes: number;
  updated_at: string;
  updated_by: string;
}

interface SessionRow {
  id: string;
  deviceId: string;
  hostname: string;
  os: string | null;
  user: string | null;
  operator: string;
  mode: string;
  reason: string;
  state: string;
  consent: string;
  recorded: number;
  startedAt: string;
  endedAt: string | null;
  endedBy: string | null;
  endReason: string | null;
}

const MODES: readonly Mode[] = ['view', 'control', 'chat'];

const SESSION_FIELDS = `s.id, s.device_id AS deviceId, d.hostname, d.os_name AS os,
                        d.primary_user_name AS user, s.operator_name AS operator,
                        s.mode, s.reason, s.state, s.consent, s.recorded,
                        s.started_at AS startedAt, s.ended_at AS endedAt,
                        s.ended_by AS endedBy, s.end_reason AS endReason`;

function shapePolicy(row: PolicyRow): Record<string, unknown> {
  return {
    consent: row.consent,
    requireReason: row.require_reason === 1,
    record: row.record === 1,
    chat: row.chat === 1,
    idleMinutes: row.idle_minutes,
    maxMinutes: row.max_minutes,
    // Not a setting. It is reported so the console can draw it as locked
    // rather than leaving a reader to wonder whether it can be turned off.
    onScreenIndicator: true,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function shapeSession(row: SessionRow): Record<string, unknown> {
  return {
    id: row.id,
    deviceId: row.deviceId,
    hostname: row.hostname,
    ...(row.os === null ? {} : { os: row.os }),
    ...(row.user === null ? {} : { user: row.user }),
    operator: row.operator,
    mode: row.mode,
    reason: row.reason,
    state: row.state,
    consent: row.consent,
    recorded: row.recorded === 1,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    endedBy: row.endedBy,
    endReason: row.endReason,
  };
}

export function registerRemoteControlRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const readPolicy = (): PolicyRow =>
    db.prepare(`SELECT * FROM remote_policy WHERE id = 1`).get() as PolicyRow;

  app.get(`${basePath}/remote-control/policy`, async () => shapePolicy(readPolicy()));

  app.put(`${basePath}/remote-control/policy`, async (request) => {
    const body = request.body as {
      consent: Consent;
      requireReason: boolean;
      record: boolean;
      chat: boolean;
      idleMinutes: number;
      maxMinutes: number;
    };

    // The maximum has to be at least the idle timeout, or a session is cut
    // short by a rule the operator cannot see.
    if (body.maxMinutes < body.idleMinutes) {
      throw badRequest('The maximum session cannot be shorter than the idle timeout.');
    }

    db.prepare(
      `UPDATE remote_policy
          SET consent = ?, require_reason = ?, record = ?, chat = ?,
              idle_minutes = ?, max_minutes = ?, updated_at = ?, updated_by = ?
        WHERE id = 1`,
    ).run(
      body.consent,
      body.requireReason ? 1 : 0,
      body.record ? 1 : 0,
      body.chat ? 1 : 0,
      body.idleMinutes,
      body.maxMinutes,
      new Date().toISOString(),
      request.auth?.email ?? 'unknown',
    );

    return shapePolicy(readPolicy());
  });

  app.get(`${basePath}/remote-control/sessions`, async (request) => {
    const query = request.query as { cursor?: string; limit?: string; state?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 200);
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;

    const where =
      query.state === 'open'
        ? `WHERE s.state IN ('pending-consent', 'open')`
        : query.state === 'finished'
          ? `WHERE s.state = 'ended'`
          : '';

    const rows = db
      .prepare(
        `SELECT ${SESSION_FIELDS}
           FROM remote_sessions s JOIN devices d ON d.id = s.device_id
           ${where}
          ORDER BY CASE s.state WHEN 'ended' THEN 1 ELSE 0 END, s.started_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as SessionRow[];

    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM remote_sessions s ${where}`).get() as { n: number }
    ).n;

    return {
      sessions: rows.map(shapeSession),
      page: {
        nextCursor: offset + rows.length < total ? String(offset + rows.length) : null,
        total,
      },
    };
  });

  app.post(`${basePath}/remote-control/sessions`, async (request, reply) => {
    const body = request.body as { deviceId: string; mode: Mode; reason?: string };
    const policy = readPolicy();

    if (!MODES.includes(body.mode)) throw badRequest('Unknown session mode.');

    const device = db
      .prepare(`SELECT id, hostname FROM devices WHERE id = ?`)
      .get(body.deviceId) as { id: string; hostname: string } | undefined;
    if (!device) throw notFound();

    const reason = (body.reason ?? '').trim();
    if (policy.require_reason === 1 && reason === '') {
      throw badRequest('The policy requires a reason or ticket for every session.');
    }

    // One session per endpoint. Two operators on one screen without either
    // knowing is the thing the consent rule is there to prevent.
    const open = db
      .prepare(
        `SELECT id FROM remote_sessions
          WHERE device_id = ? AND state IN ('pending-consent', 'open')`,
      )
      .get(body.deviceId);
    if (open) throw conflict('That endpoint already has a session open.');

    const id = `rc-${randomUUID()}`;
    const consent = policy.consent as Consent;
    db.prepare(
      `INSERT INTO remote_sessions
         (id, device_id, operator_email, operator_name, mode, reason, state,
          consent, recorded, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.deviceId,
      request.auth?.email ?? 'unknown',
      request.auth?.name ?? 'Unknown operator',
      body.mode,
      reason,
      // Attended means nothing is shown until the user accepts.
      consent === 'ask' ? 'pending-consent' : 'open',
      consent,
      policy.record,
      new Date().toISOString(),
    );

    const row = db
      .prepare(
        `SELECT ${SESSION_FIELDS} FROM remote_sessions s
           JOIN devices d ON d.id = s.device_id WHERE s.id = ?`,
      )
      .get(id) as SessionRow;

    return reply.status(201).send(shapeSession(row));
  });

  app.post(`${basePath}/remote-control/sessions/:sessionId`, async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const { endReason } = request.body as { endReason: string };

    const existing = db.prepare(`SELECT state FROM remote_sessions WHERE id = ?`).get(sessionId) as
      { state: State } | undefined;
    if (!existing) throw notFound();

    if (existing.state !== 'ended') {
      db.prepare(
        `UPDATE remote_sessions
            SET state = 'ended', ended_at = ?, ended_by = ?, end_reason = ?
          WHERE id = ?`,
      ).run(new Date().toISOString(), request.auth?.email ?? 'unknown', endReason, sessionId);
    }

    const row = db
      .prepare(
        `SELECT ${SESSION_FIELDS} FROM remote_sessions s
           JOIN devices d ON d.id = s.device_id WHERE s.id = ?`,
      )
      .get(sessionId) as SessionRow;

    return shapeSession(row);
  });
}
