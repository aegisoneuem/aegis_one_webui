import type { FastifyInstance } from 'fastify';
import { listRows, notFound, zoneScope, type Db } from '@aegis/mock-core';
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
