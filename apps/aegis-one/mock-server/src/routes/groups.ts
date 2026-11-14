import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, listRows, notFound, zoneScope, type Db } from '@aegis/mock-core';
import { devicesSpec } from '../specs';
import { shapeRow, toListQuery } from './resources';

/**
 * Device groups.
 *
 * These do not go through the generic resource lister, because `GET /groups`
 * is not a page: the contract returns the whole tree plus a summary, with no
 * cursor. A tree paged halfway through is a tree with its branches cut off.
 */

/** Exactly the fields the contract's `Group` declares, and no others. */
const GROUP_FIELDS = `id, name, kind, parent_id AS parentId, members, online, offline,
                      missing_patches AS missingPatches, sub_groups AS subGroups`;

interface GroupRow extends Record<string, unknown> {
  id: string;
  name: string;
  parentId: string | null;
}

export function registerGroupRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.get(`${basePath}/groups`, async (request) => {
    const { q } = request.query as { q?: string };

    /*
     * A search matches a group by name, but a matched child with an unmatched
     * parent would be drawn at the root. So the match is widened to the
     * ancestors of everything it hit, and the tree keeps its shape.
     */
    const all = db
      // Insertion order, which is the order the approved design lists them:
      // platform trees first, then locations, then the rings.
      .prepare(`SELECT ${GROUP_FIELDS} FROM device_groups ORDER BY rowid`)
      .all() as GroupRow[];

    const byId = new Map(all.map((g) => [g.id, g]));
    let items = all;
    if (q?.trim()) {
      const needle = q.trim().toLowerCase();
      const keep = new Set<string>();
      for (const g of all) {
        if (!g.name.toLowerCase().includes(needle)) continue;
        for (let node: GroupRow | undefined = g; node; node = byId.get(node.parentId ?? '')) {
          if (keep.has(node.id)) break;
          keep.add(node.id);
        }
      }
      items = all.filter((g) => keep.has(g.id));
    }

    const summary = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM device_groups WHERE parent_id IS NULL) AS groups,
                (SELECT COUNT(*) FROM device_groups WHERE parent_id IS NOT NULL) AS subGroups,
                (SELECT COUNT(DISTINCT device_id) FROM group_members) AS grouped,
                (SELECT COUNT(*) FROM devices) -
                  (SELECT COUNT(DISTINCT device_id) FROM group_members) AS notGrouped`,
      )
      .get();

    return { items, summary };
  });

  app.get(`${basePath}/groups/:groupId`, async (request) => {
    const { groupId } = request.params as { groupId: string };
    const row = db
      .prepare(`SELECT ${GROUP_FIELDS}, rule, policies FROM device_groups WHERE id = ?`)
      .get(groupId) as (GroupRow & { rule: string | null; policies: string }) | undefined;
    if (!row) throw notFound();

    const history = db
      .prepare(
        `SELECT id, at, actor, action, object_id AS target, ip, outcome
           FROM audit_log WHERE object_type = 'group' AND object_id = ?
          ORDER BY at DESC LIMIT 50`,
      )
      .all(groupId);

    const { policies, ...group } = row;
    return {
      ...group,
      // Stored as one text column because SQLite has no array type.
      policies: policies ? policies.split('\n').filter(Boolean) : [],
      history,
    };
  });

  /*
   * `POST /groups/import` has been in the contract since the beginning and
   * had no implementation, which is the same failure the group and filter
   * parameters had: a console could upload a roster, be told nothing went
   * wrong, and have changed nothing.
   *
   * The file is what the reference's own importer accepts — two columns,
   * group name then computer name — separated by a comma, a semicolon or a
   * tab, optionally quoted, with an optional header row whose first cell
   * begins with "group".
   */
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  app.post(`${basePath}/groups/import`, async (request) => {
    const text = typeof request.body === 'string' ? request.body : '';
    if (!text.trim()) throw badRequest('The uploaded file is empty.');

    const rows = text
      .split(/\r?\n/)
      .map((line) => line.split(/[,;\t]/).map((cell) => cell.trim().replace(/^"|"$/g, '')))
      .filter((cells) => cells.length >= 2 && cells[0] && cells[1])
      .filter((cells, index) => !(index === 0 && /^group/i.test(cells[0] ?? '')));

    if (rows.length === 0) throw badRequest('No rows with a group name and a computer name.');
    // A bound on the work one request can ask for, so a mistyped file cannot
    // turn into a minute of synchronous SQLite.
    if (rows.length > 10_000) throw badRequest('More than 10,000 rows in one import.');

    const groupByName = new Map(
      (
        db.prepare(`SELECT id, name FROM device_groups`).all() as { id: string; name: string }[]
      ).map((g) => [g.name.toLowerCase(), g.id]),
    );
    const findDevice = db.prepare(
      `SELECT id FROM devices WHERE lower(hostname) = ? OR lower(dns_name) = ? LIMIT 1`,
    );
    const insertGroup = db.prepare(
      `INSERT INTO device_groups (id, name, kind, parent_id, rule, policies, created_at, created_by)
       VALUES (?, ?, 'static', NULL, NULL, '', ?, ?)`,
    );
    const insertMember = db.prepare(
      `INSERT OR IGNORE INTO group_members (group_id, device_id) VALUES (?, ?)`,
    );

    const now = new Date().toISOString();
    const by = request.auth?.email ?? 'unknown';
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const touched = new Set<string>();

    const run = db.transaction(() => {
      for (const [rawGroup, rawDevice] of rows) {
        const groupName = rawGroup ?? '';
        const deviceName = (rawDevice ?? '').toLowerCase();
        let groupId = groupByName.get(groupName.toLowerCase());
        if (!groupId) {
          groupId = `grp-${randomUUID()}`;
          insertGroup.run(groupId, groupName, now, by);
          groupByName.set(groupName.toLowerCase(), groupId);
        }
        const device = findDevice.get(deviceName, deviceName) as { id: string } | undefined;
        if (!device) {
          skipped += 1;
          // Enough to fix the file by, and not one line per row of a file
          // that named the wrong column.
          if (errors.length < 20) errors.push(`No computer named "${rawDevice ?? ''}".`);
          continue;
        }
        const result = insertMember.run(groupId, device.id);
        if (result.changes === 0) skipped += 1;
        else {
          created += 1;
          touched.add(groupId);
        }
      }

      /*
       * The tree reads stored counts rather than counting on every request,
       * so every group this touched is recounted here. Leaving them stale
       * would show a group whose figure disagrees with its own member list.
       */
      const recount = db.prepare(
        `UPDATE device_groups SET
           members = (SELECT COUNT(*) FROM group_members WHERE group_id = device_groups.id),
           online = (SELECT COUNT(*) FROM group_members gm JOIN devices d ON d.id = gm.device_id
                      WHERE gm.group_id = device_groups.id AND d.status = 'online'),
           offline = (SELECT COUNT(*) FROM group_members gm JOIN devices d ON d.id = gm.device_id
                      WHERE gm.group_id = device_groups.id AND d.status != 'online'),
           missing_patches = (SELECT COALESCE(SUM(d.pending_patches), 0) FROM group_members gm
                      JOIN devices d ON d.id = gm.device_id WHERE gm.group_id = device_groups.id)
         WHERE id = ?`,
      );
      for (const id of touched) recount.run(id);
    });
    run();

    return { created, skipped, errors };
  });

  app.get(`${basePath}/groups/:groupId/members`, async (request) => {
    const { groupId } = request.params as { groupId: string };
    const exists = db.prepare(`SELECT id FROM device_groups WHERE id = ?`).get(groupId);
    if (!exists) throw notFound();

    /*
     * Membership and the caller's zones are both constraints on the same
     * query, and `listRows` takes one. Composing them here keeps the zone
     * scope in force: a scoped user asking for a group they can see still
     * gets only the members inside their own zones.
     */
    const zones = request.auth ? zoneScope(request.auth) : undefined;
    const membership = {
      sql: `"id" IN (SELECT device_id FROM group_members WHERE group_id = ?)`,
      params: [groupId] as unknown[],
    };
    const scope = zones
      ? {
          sql: `(${membership.sql}) AND (${zones.sql})`,
          params: [...membership.params, ...zones.params],
        }
      : membership;

    const result = listRows<Record<string, unknown>>(db, devicesSpec, toListQuery(request), {
      scope,
    });
    return { items: result.items.map((row) => shapeRow(row)), page: result.page };
  });
}
