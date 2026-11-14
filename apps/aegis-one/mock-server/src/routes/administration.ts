import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, conflict, forbidden, notFound, type Db } from '@aegis/mock-core';

/**
 * Administration: identity, users, roles and agent enrollment.
 *
 * Four things the contract has always described and the server never served.
 * The page read a flat `users` lister, a roles aggregate missing two of the
 * three scopes the approved cards print, and nothing at all for identity —
 * its Identity & SSO tab was two paragraphs of prose.
 *
 * Two rules hold across every write here:
 *
 * - **No secret is stored.** Configuring a provider accepts a client secret
 *   or a bind password and drops it. There is no column for one, no route
 *   that returns one, and nothing in any response that could leak one.
 * - **A role cannot exceed its creator.** `POST /admin/roles` refuses any
 *   permission the caller does not hold, which is the contract's own words
 *   and the only thing standing between a scoped admin and privilege
 *   escalation.
 */

interface ProviderRow extends Record<string, unknown> {
  id: string;
  name: string;
  protocol: string;
  description: string;
  enabled: number;
  status: string;
  mfaRequired: number;
}

interface RoleRow extends Record<string, unknown> {
  id: string;
  name: string;
  permissions: string;
  system: number;
  zoneIds: string;
  softwareCategories: string;
  groupIds: string;
  userCount: number;
}

interface UserRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
  zoneIds: string;
  mfaEnrolled: number;
  status: string;
  lastSignIn: string | null;
}

const PROVIDER_FIELDS = `id, name, protocol, description, enabled, status,
                         mfa_required AS mfaRequired`;

const ROLE_FIELDS = `id, name, permissions, system, zone_ids AS zoneIds,
                     software_categories AS softwareCategories,
                     group_ids AS groupIds, user_count AS userCount`;

const USER_FIELDS = `id, name, email, role, zone_ids AS zoneIds,
                     mfa_enrolled AS mfaEnrolled, status,
                     last_sign_in_at AS lastSignIn`;

/** The contract's own Role enum. A user's role must be one of these. */
const ROLES = new Set(['Super Admin', 'Admin', 'Operator', 'Auditor', 'Read-only']);

const list = (raw: string): string[] => JSON.parse(raw) as string[];

export function registerAdministrationRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const shapeProvider = (row: ProviderRow) => ({
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    description: row.description,
    enabled: row.enabled === 1,
    status: row.status,
    mfaRequired: row.mfaRequired === 1,
  });

  const shapeRole = (row: RoleRow) => ({
    id: row.id,
    name: row.name,
    permissions: list(row.permissions),
    zoneIds: list(row.zoneIds),
    softwareCategories: list(row.softwareCategories),
    groupIds: list(row.groupIds),
    system: row.system === 1,
    userCount: row.userCount,
  });

  const shapeUser = (row: UserRow) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    zoneIds: list(row.zoneIds),
    mfaEnrolled: row.mfaEnrolled === 1,
    disabled: row.status === 'disabled',
    lastSignIn: row.lastSignIn,
  });

  // --- Identity & SSO ------------------------------------------------------

  app.get(`${basePath}/admin/identity-providers`, async () =>
    (
      db
        .prepare(`SELECT ${PROVIDER_FIELDS} FROM identity_providers ORDER BY seq`)
        .all() as ProviderRow[]
    ).map(shapeProvider),
  );

  app.put(`${basePath}/admin/identity-providers/:providerId`, async (request) => {
    const { providerId } = request.params as { providerId: string };
    const row = db
      .prepare(`SELECT ${PROVIDER_FIELDS} FROM identity_providers WHERE id = ?`)
      .get(providerId) as ProviderRow | undefined;
    if (!row) throw notFound(`No identity provider with id ${providerId}.`);

    const body = request.body as {
      issuer?: string;
      clientId?: string;
      secret?: string;
      enabled?: boolean;
    };

    /*
     * A provider counts as connected once it has somewhere to federate to.
     * The secret, if one was sent, is accepted and dropped here: nothing
     * stores it and nothing can read it back.
     */
    const connected = body.issuer !== undefined || row.status === 'connected';
    const enabled = body.enabled ?? row.enabled === 1;
    if (enabled && !connected) {
      throw conflict('Configure the provider before switching sign-in on.');
    }

    db.prepare(`UPDATE identity_providers SET enabled = ?, status = ? WHERE id = ?`).run(
      enabled ? 1 : 0,
      connected ? 'connected' : 'not-configured',
      providerId,
    );
    return shapeProvider(
      db
        .prepare(`SELECT ${PROVIDER_FIELDS} FROM identity_providers WHERE id = ?`)
        .get(providerId) as ProviderRow,
    );
  });

  // --- Users ---------------------------------------------------------------

  app.get(`${basePath}/admin/users`, async (request) => {
    const query = request.query as { cursor?: string; limit?: string; q?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

    const where: string[] = [];
    const params: unknown[] = [];
    if (query.q) {
      where.push('(LOWER(name) LIKE ? OR LOWER(email) LIKE ?)');
      const term = `%${query.q.trim().toLowerCase()}%`;
      params.push(term, term);
    }
    if (query.cursor) {
      where.push('id > ?');
      params.push(Buffer.from(query.cursor, 'base64url').toString('utf8'));
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db
      .prepare(`SELECT ${USER_FIELDS} FROM users ${clause} ORDER BY id LIMIT ?`)
      .all(...params, limit + 1) as UserRow[];
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];

    return {
      items: items.map(shapeUser),
      page: {
        total: (
          db.prepare(`SELECT COUNT(*) AS n FROM users ${clause}`).get(...params) as { n: number }
        ).n,
        nextCursor:
          rows.length > limit && last ? Buffer.from(last.id, 'utf8').toString('base64url') : null,
      },
    };
  });

  app.post(`${basePath}/admin/users`, async (request, reply) => {
    const body = request.body as { email: string; name: string; role: string };
    if (!ROLES.has(body.role)) throw badRequest('Unknown role.', { role: 'invalid' });

    // Only a Super Admin may grant Super Admin — the contract's own rule, and
    // the one that stops an Admin from promoting themselves sideways.
    if (body.role === 'Super Admin' && request.auth?.role !== 'Super Admin') {
      throw forbidden('Only a Super Admin may grant Super Admin.');
    }

    const email = body.email.trim().toLowerCase();
    const taken = db.prepare(`SELECT id FROM users WHERE LOWER(email) = ?`).get(email);
    if (taken) throw conflict('That email already has a console account.');

    const id = `usr-${randomUUID().slice(0, 8)}`;
    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id,email,name,role,zone_ids,mfa_enrolled,status,last_sign_in_at,created_at)
         VALUES (?,?,?,?,'[]',0,'invited',NULL,?)`,
      ).run(id, email, body.name.trim(), body.role, new Date().toISOString());
      db.prepare(`UPDATE roles SET user_count = user_count + 1 WHERE name = ?`).run(body.role);
    })();

    /*
     * An invited account arrives with no second factor enrolled and has never
     * signed in. It is not "Active", and the Users table says so.
     */
    return reply
      .code(201)
      .send(
        shapeUser(db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(id) as UserRow),
      );
  });

  app.patch(`${basePath}/admin/users/:userId`, async (request) => {
    const { userId } = request.params as { userId: string };
    const row = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(userId) as
      UserRow | undefined;
    if (!row) throw notFound(`No user with id ${userId}.`);

    const body = request.body as { role?: string; disabled?: boolean };
    if (body.role !== undefined) {
      if (!ROLES.has(body.role)) throw badRequest('Unknown role.', { role: 'invalid' });
      if (body.role === 'Super Admin' && request.auth?.role !== 'Super Admin') {
        throw forbidden('Only a Super Admin may grant Super Admin.');
      }
    }

    // Disabling the last Super Admin would lock everyone out of the console.
    if (body.disabled === true && row.role === 'Super Admin') {
      const others = (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM users
              WHERE role = 'Super Admin' AND status <> 'disabled' AND id <> ?`,
          )
          .get(userId) as { n: number }
      ).n;
      if (others === 0) throw conflict('This is the last active Super Admin.');
    }

    db.transaction(() => {
      if (body.role !== undefined && body.role !== row.role) {
        db.prepare(`UPDATE roles SET user_count = user_count - 1 WHERE name = ?`).run(row.role);
        db.prepare(`UPDATE roles SET user_count = user_count + 1 WHERE name = ?`).run(body.role);
        db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(body.role, userId);
      }
      if (body.disabled !== undefined) {
        db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(
          body.disabled ? 'disabled' : 'active',
          userId,
        );
      }
    })();

    return shapeUser(
      db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(userId) as UserRow,
    );
  });

  // --- Roles & Content Access ----------------------------------------------

  app.get(`${basePath}/admin/roles`, async () =>
    (
      db.prepare(`SELECT ${ROLE_FIELDS} FROM roles ORDER BY system DESC, name`).all() as RoleRow[]
    ).map(shapeRole),
  );

  app.post(`${basePath}/admin/roles`, async (request, reply) => {
    const body = request.body as {
      name: string;
      permissions: string[];
      zoneIds?: string[];
      softwareCategories?: string[];
      groupIds?: string[];
    };

    /*
     * Permissions cannot exceed the creator's own. A caller holding `*` holds
     * everything; anyone else must already have each permission they grant.
     * Without this a scoped admin could mint a role with `admin:roles` and
     * hand it to themselves.
     */
    const held = new Set(request.auth?.permissions ?? []);
    if (!held.has('*')) {
      const excess = body.permissions.filter((perm) => !held.has(perm));
      if (excess.length > 0) {
        throw forbidden(`You do not hold ${excess[0]}, so you cannot grant it.`);
      }
    }

    const name = body.name.trim();
    if (db.prepare(`SELECT id FROM roles WHERE name = ?`).get(name)) {
      throw conflict('A role with that name already exists.');
    }

    const id = `role-${randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO roles
         (id,name,permissions,system,zone_ids,software_categories,group_ids,user_count)
       VALUES (?,?,?,0,?,?,?,0)`,
    ).run(
      id,
      name,
      JSON.stringify(body.permissions),
      JSON.stringify(body.zoneIds ?? []),
      JSON.stringify(body.softwareCategories ?? []),
      JSON.stringify(body.groupIds ?? []),
    );

    return reply
      .code(201)
      .send(
        shapeRole(db.prepare(`SELECT ${ROLE_FIELDS} FROM roles WHERE id = ?`).get(id) as RoleRow),
      );
  });

  // --- Agent enrollment settings -------------------------------------------

  const settings = () => {
    const row = db
      .prepare(
        `SELECT require_token AS requireToken, auto_assign_group AS autoAssignGroup,
                token_max_age_days AS tokenMaxAgeDays
           FROM agent_enrollment_settings WHERE id = 1`,
      )
      .get() as { requireToken: number; autoAssignGroup: string | null; tokenMaxAgeDays: number };
    return {
      requireToken: row.requireToken === 1,
      autoAssignGroup: row.autoAssignGroup,
      tokenMaxAgeDays: row.tokenMaxAgeDays,
    };
  };

  app.get(`${basePath}/admin/agent-enrollment`, async () => settings());

  app.put(`${basePath}/admin/agent-enrollment`, async (request) => {
    const body = request.body as {
      requireToken: boolean;
      autoAssignGroup: string | null;
      tokenMaxAgeDays: number;
    };
    if (body.autoAssignGroup !== null) {
      const group = db
        .prepare(`SELECT id FROM device_groups WHERE id = ?`)
        .get(body.autoAssignGroup);
      if (!group) throw badRequest('Unknown device group.', { autoAssignGroup: 'unknown' });
    }
    db.prepare(
      `UPDATE agent_enrollment_settings
          SET require_token = ?, auto_assign_group = ?, token_max_age_days = ?
        WHERE id = 1`,
    ).run(body.requireToken ? 1 : 0, body.autoAssignGroup, body.tokenMaxAgeDays);
    return settings();
  });
}
