import type { FastifyInstance } from 'fastify';
import { badRequest, type Db } from '@aegis/mock-core';

/**
 * Global Settings: the estate-wide patch defaults.
 *
 * The three thresholds at the top are the point of the panel. They do not
 * store a verdict about the estate's health — they store the *rule* that
 * produces one, and the four counters beside them are counted against the
 * devices table every time the page is read. Change a threshold and the
 * counters move, which is the whole reason an administrator would touch them.
 *
 * The approved sub-tab says "Saved in this browser (preview)" twice, because
 * nothing in the reference persists. These are saved on the server: a patch
 * default that lives in one administrator's browser is not an estate-wide
 * default. Recorded as D-058.
 */

interface SettingsRow extends Record<string, unknown> {
  highlyVulnerableCritical: number;
  highlyVulnerableTotal: number;
  vulnerableTotal: number;
  disableBuiltInUpdates: number;
  hideCheckForUpdates: number;
  groupOverrides: string;
  majorVersions: string;
  rings: string;
  maintenance: string;
  approval: string;
}

const SETTINGS_FIELDS = `highly_vulnerable_critical AS highlyVulnerableCritical,
                         highly_vulnerable_total AS highlyVulnerableTotal,
                         vulnerable_total AS vulnerableTotal,
                         disable_built_in_updates AS disableBuiltInUpdates,
                         hide_check_for_updates AS hideCheckForUpdates,
                         group_overrides AS groupOverrides,
                         major_versions AS majorVersions,
                         rings, maintenance, approval`;

const RESTARTS = new Set(['prompt', 'automatic', 'never']);
const THIRD_PARTY = new Set(['approval', 'automatic']);

export function registerPatchSettingsRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const row = () =>
    db.prepare(`SELECT ${SETTINGS_FIELDS} FROM patch_settings WHERE id = 1`).get() as SettingsRow;

  /**
   * The four counters, counted from the thresholds.
   *
   * An endpoint is highly vulnerable if it is missing enough critical updates
   * *or* enough updates altogether; vulnerable if it is missing enough
   * altogether but not enough to be highly vulnerable; healthy otherwise.
   * The bands are evaluated worst-first so no endpoint is counted twice.
   */
  const healthCounts = (settings: SettingsRow) => {
    const counts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN critical_vulns >= ? OR pending_patches >= ? THEN 1 ELSE 0 END) AS highlyVulnerable,
           SUM(CASE WHEN NOT (critical_vulns >= ? OR pending_patches >= ?)
                     AND pending_patches >= ? THEN 1 ELSE 0 END) AS vulnerable,
           COUNT(*) AS fleet
         FROM devices`,
      )
      .get(
        settings.highlyVulnerableCritical,
        settings.highlyVulnerableTotal,
        settings.highlyVulnerableCritical,
        settings.highlyVulnerableTotal,
        settings.vulnerableTotal,
      ) as { highlyVulnerable: number; vulnerable: number; fleet: number };

    return {
      highlyVulnerable: counts.highlyVulnerable,
      vulnerable: counts.vulnerable,
      healthy: counts.fleet - counts.highlyVulnerable - counts.vulnerable,
      fleet: counts.fleet,
    };
  };

  /**
   * What the estate is running, with whatever the vendor has published about
   * it. The versions and counts come from the devices; the support text is
   * reference material and is null where no vendor date is published.
   */
  const osVersions = () =>
    (
      db
        .prepare(
          `SELECT d.os_family AS os, d.os_version AS version, COUNT(*) AS computers,
                  l.vendor_support AS vendorSupport, l.end_of_life AS endOfLife
             FROM devices d
             LEFT JOIN os_lifecycle l ON l.os = d.os_family AND l.version = d.os_version
            GROUP BY d.os_family, d.os_version
            ORDER BY computers DESC`,
        )
        .all() as {
        os: string;
        version: string;
        computers: number;
        vendorSupport: string | null;
        endOfLife: number | null;
      }[]
    ).map((v) => ({
      os: v.os,
      version: v.version,
      computers: v.computers,
      vendorSupport: v.vendorSupport,
      endOfLife: v.endOfLife === 1,
    }));

  const shape = () => {
    const settings = row();
    return {
      health: {
        highlyVulnerableCritical: settings.highlyVulnerableCritical,
        highlyVulnerableTotal: settings.highlyVulnerableTotal,
        vulnerableTotal: settings.vulnerableTotal,
        ...healthCounts(settings),
      },
      deviceControls: {
        disableBuiltInUpdates: settings.disableBuiltInUpdates === 1,
        hideCheckForUpdates: settings.hideCheckForUpdates === 1,
      },
      groupOverrides: JSON.parse(settings.groupOverrides) as unknown[],
      majorVersions: JSON.parse(settings.majorVersions) as unknown,
      rings: JSON.parse(settings.rings) as unknown[],
      maintenance: JSON.parse(settings.maintenance) as unknown,
      approval: JSON.parse(settings.approval) as unknown,
      osVersions: osVersions(),
    };
  };

  app.get(`${basePath}/patches/settings`, async () => shape());

  app.put(`${basePath}/patches/settings`, async (request) => {
    const body = request.body as {
      health: {
        highlyVulnerableCritical: number;
        highlyVulnerableTotal: number;
        vulnerableTotal: number;
      };
      deviceControls: { disableBuiltInUpdates: boolean; hideCheckForUpdates: boolean };
      groupOverrides?: { groupId: string }[];
      majorVersions: unknown;
      rings: {
        id: string;
        name: string;
        groupId: string;
        deferDays: number;
        deadlineDays: number;
      }[];
      maintenance: { restartBehaviour: string; from: string; to: string };
      approval: { thirdPartyUpdates: string; catalogSyncHours: number };
    };

    /*
     * A band that cannot be reached describes nothing. If "vulnerable" needs
     * as many missing updates as "highly vulnerable", every endpoint in the
     * first band is already in the second and the middle band is always zero.
     */
    if (body.health.vulnerableTotal >= body.health.highlyVulnerableTotal) {
      throw badRequest(
        'The vulnerable threshold has to be lower than the highly vulnerable one, or nothing can land in between.',
        { vulnerableTotal: 'unreachable' },
      );
    }

    if (!RESTARTS.has(body.maintenance.restartBehaviour)) {
      throw badRequest('Unknown restart behaviour.', { restartBehaviour: 'invalid' });
    }
    if (!THIRD_PARTY.has(body.approval.thirdPartyUpdates)) {
      throw badRequest('Unknown third-party update policy.', { thirdPartyUpdates: 'invalid' });
    }

    /*
     * A ring whose deadline falls before its deferral tells an endpoint to
     * install a patch before it is allowed to have it.
     */
    const impossible = body.rings.find((ring) => ring.deadlineDays < 0 || ring.deferDays < 0);
    if (impossible) {
      throw badRequest('A ring cannot defer or deadline by a negative number of days.', {
        rings: 'invalid',
      });
    }

    // Every ring has to target a group that exists, or it patches nothing.
    const groups = new Set(
      (db.prepare(`SELECT id FROM device_groups`).all() as { id: string }[]).map((g) => g.id),
    );
    const orphan = body.rings.find((ring) => ring.groupId && !groups.has(ring.groupId));
    if (orphan) {
      throw badRequest(`${orphan.name} targets a device group that no longer exists.`, {
        rings: 'unknown-group',
      });
    }

    db.prepare(
      `UPDATE patch_settings
          SET highly_vulnerable_critical = ?, highly_vulnerable_total = ?, vulnerable_total = ?,
              disable_built_in_updates = ?, hide_check_for_updates = ?,
              group_overrides = ?, major_versions = ?, rings = ?, maintenance = ?, approval = ?
        WHERE id = 1`,
    ).run(
      body.health.highlyVulnerableCritical,
      body.health.highlyVulnerableTotal,
      body.health.vulnerableTotal,
      body.deviceControls.disableBuiltInUpdates ? 1 : 0,
      body.deviceControls.hideCheckForUpdates ? 1 : 0,
      JSON.stringify(body.groupOverrides ?? []),
      JSON.stringify(body.majorVersions),
      JSON.stringify(body.rings),
      JSON.stringify(body.maintenance),
      JSON.stringify(body.approval),
    );

    return shape();
  });
}
