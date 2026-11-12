import type { FastifyInstance } from 'fastify';
import { badRequest, type Db } from '@aegis/mock-core';

/**
 * Licensing: one agreement, read as the approved page reads it.
 *
 * What the server used to serve here was `{ items: [...] }` — a row per
 * licensed product, each with its own entitlement and expiry. That shape
 * cannot answer either of the two questions the page leads with: which plan
 * is this, and how many days until it renews. The contract has always
 * declared a single `License` object with a plan, seats, a term and modules.
 *
 * Every figure below is counted, not stored. Seats in use is the number of
 * enrolled endpoints; the platform split is those endpoints grouped by
 * platform; the days left is arithmetic against the stored term. A licence
 * page whose seat count disagreed with the Devices page would be worse than
 * useless.
 */

interface LicenseRow extends Record<string, unknown> {
  plan: string;
  seatsTotal: number;
  startsAt: string;
  endsAt: string;
}

interface ModuleRow extends Record<string, unknown> {
  id: string;
  name: string;
  tier: string;
  enabled: number;
  countsAgainstSeats: number;
}

export function registerLicensingRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  /*
   * The contract declares the licence upload as application/octet-stream, and
   * Fastify has no parser for it — so the declared content type was answered
   * with "Unsupported Media Type" before the handler was ever reached. The
   * body is kept as a buffer because a licence is a signed blob, not JSON.
   */
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  const read = () => {
    const license = db
      .prepare(
        `SELECT plan, seats_total AS seatsTotal, starts_at AS startsAt, ends_at AS endsAt
           FROM license WHERE id = 1`,
      )
      .get() as LicenseRow;

    /*
     * Seats in use is the estate itself. A preview module does not consume a
     * seat, but every endpoint is counted once regardless of how many modules
     * it is covered by — a seat is an endpoint, not an entitlement.
     */
    // The devices table calls this `os_family`; the contract calls the three
    // values windows, macos and linux.
    const platforms = db
      .prepare(`SELECT os_family AS platform, COUNT(*) AS n FROM devices GROUP BY os_family`)
      .all() as { platform: string; n: number }[];

    /*
     * Windows Server is Windows for licensing purposes, and anything outside
     * the three named platforms — this estate runs AIX on 455 endpoints —
     * lands in `other`. Every seat is counted somewhere, so the split adds up
     * to the total rather than quietly losing a platform.
     */
    const byPlatform = { windows: 0, macos: 0, linux: 0, other: 0 };
    for (const row of platforms) {
      const family = row.platform.toLowerCase();
      if (family.startsWith('windows')) byPlatform.windows += row.n;
      else if (family === 'macos') byPlatform.macos += row.n;
      else if (family === 'linux') byPlatform.linux += row.n;
      else byPlatform.other += row.n;
    }
    const inUse = byPlatform.windows + byPlatform.macos + byPlatform.linux + byPlatform.other;

    const modules = (
      db
        .prepare(
          `SELECT id, name, tier, enabled, counts_against_seats AS countsAgainstSeats
             FROM license_modules ORDER BY seq`,
        )
        .all() as ModuleRow[]
    ).map((m) => ({
      id: m.id,
      name: m.name,
      tier: m.tier,
      enabled: m.enabled === 1,
      countsAgainstSeats: m.countsAgainstSeats === 1,
    }));

    return {
      /*
       * The page counts the days remaining from this rather than from the
       * browser's clock: a figure that changes with whoever is looking at it
       * is not a licence fact, and reading the clock during render is
       * forbidden in this console anyway.
       */
      asOf: new Date().toISOString(),
      plan: license.plan,
      seats: { inUse, total: license.seatsTotal, byPlatform },
      term: { startsAt: license.startsAt, endsAt: license.endsAt },
      modules,
    };
  };

  app.get(`${basePath}/licensing`, async () => read());

  /**
   * Upload a licence file. The signature is verified server-side, says the
   * contract — so this refuses anything that is not a signed licence rather
   * than accepting a file and pretending.
   *
   * Nothing here parses an uploaded blob into terms. A fixture that let any
   * upload rewrite the plan and the seat count would be a page that lies
   * about what the server checked.
   */
  app.put(`${basePath}/licensing/file`, async (request) => {
    const body = request.body;
    const size = Buffer.isBuffer(body) ? body.length : 0;
    if (size === 0) throw badRequest('The licence file is empty.', { file: 'empty' });
    throw badRequest('The licence signature could not be verified against the issuer key.', {
      file: 'unverified',
    });
  });
}
