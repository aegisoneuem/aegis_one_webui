import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, conflict, notFound, type Db } from '@aegis/mock-core';

/**
 * Software package writes: add, read, edit and delete one package.
 *
 * Three of the four declared operations were not served, which is why the
 * Software Catalog's `+ Add package` and `Edit Package` were rendered and did
 * nothing. The list *and the package detail* are served by the shared
 * resource lister and stay there — registering a second `GET /software/:id`
 * here is how this file first failed to boot.
 *
 * A package is a *definition*, separate from the installer binary it points
 * at. That separation is the whole reason `installer` is an enum rather than
 * a boolean on the file: a definition can exist with nothing to install yet,
 * and the catalogue says so rather than hiding the row.
 */

interface PackageRow extends Record<string, unknown> {
  id: string;
  name: string;
  publisher: string;
  version: string;
  platform: string;
  category: string;
  logoUrl: string | null;
  installer: string;
  installerSha256: string | null;
  state: string;
  silentInstallCommand: string;
  silentUninstallCommand: string;
}

const PACKAGE_FIELDS = `id, title AS name, publisher, latest_version AS version, platform,
                        category, logo_url AS logoUrl, installer,
                        installer_sha256 AS installerSha256, state,
                        silent_install AS silentInstallCommand,
                        silent_uninstall AS silentUninstallCommand`;

const PLATFORMS = new Set(['windows', 'macos', 'linux']);

export function registerSoftwareWriteRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const read = (id: string) =>
    db.prepare(`SELECT ${PACKAGE_FIELDS} FROM software WHERE id = ?`).get(id) as
      PackageRow | undefined;

  app.post(`${basePath}/software`, async (request, reply) => {
    const body = request.body as {
      name: string;
      publisher: string;
      version: string;
      platform: string;
      category?: string;
      silentInstallCommand?: string;
      silentUninstallCommand?: string;
    };
    if (!PLATFORMS.has(body.platform)) {
      throw badRequest('Unknown platform.', { platform: 'invalid' });
    }

    /*
     * A second package with the same title, version and platform is a
     * duplicate, not a variant: the catalogue is keyed on what an endpoint
     * would install, and two of those cannot both be current.
     */
    const clash = db
      .prepare(
        `SELECT id FROM software
          WHERE LOWER(title) = LOWER(?) AND latest_version = ? AND platform = ?`,
      )
      .get(body.name.trim(), body.version.trim(), body.platform);
    if (clash) throw conflict('That title and version is already in the catalogue.');

    const id = `pkg-${randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO software
         (id,title,publisher,category,latest_version,size_mb,platform,logo_url,
          installer,installer_sha256,state,silent_install,silent_uninstall,
          install_count,outdated_count,seats,renews_at)
       VALUES (?,?,?,?,?,0,?,NULL,'missing',NULL,'draft',?,?,0,0,0,'')`,
    ).run(
      id,
      body.name.trim(),
      body.publisher.trim(),
      body.category ?? 'Utilities',
      body.version.trim(),
      body.platform,
      body.silentInstallCommand ?? '',
      body.silentUninstallCommand ?? '',
    );

    /*
     * A new definition is a draft with no installer. It is not publishable
     * until a binary is attached, and the catalogue card says "missing"
     * rather than implying it is ready to deploy.
     */
    return reply.code(201).send(read(id));
  });

  app.patch(`${basePath}/software/:packageId`, async (request) => {
    const { packageId } = request.params as { packageId: string };
    const row = read(packageId);
    if (!row) throw notFound(`No package with id ${packageId}.`);

    const body = request.body as {
      name: string;
      publisher: string;
      version: string;
      platform: string;
      category?: string;
      silentInstallCommand?: string;
      silentUninstallCommand?: string;
    };
    if (!PLATFORMS.has(body.platform)) {
      throw badRequest('Unknown platform.', { platform: 'invalid' });
    }

    /*
     * Changing the version invalidates the installer: the binary on file was
     * built for the old one, and keeping its hash against a new version would
     * claim an integrity check that was never made.
     */
    const versionChanged = body.version.trim() !== row.version;

    db.prepare(
      `UPDATE software
          SET title = ?, publisher = ?, category = ?, latest_version = ?, platform = ?,
              silent_install = ?, silent_uninstall = ?,
              installer = CASE WHEN ? THEN 'missing' ELSE installer END,
              installer_sha256 = CASE WHEN ? THEN NULL ELSE installer_sha256 END,
              state = CASE WHEN ? THEN 'draft' ELSE state END
        WHERE id = ?`,
    ).run(
      body.name.trim(),
      body.publisher.trim(),
      body.category ?? row.category,
      body.version.trim(),
      body.platform,
      body.silentInstallCommand ?? row.silentInstallCommand,
      body.silentUninstallCommand ?? row.silentUninstallCommand,
      versionChanged ? 1 : 0,
      versionChanged ? 1 : 0,
      versionChanged ? 1 : 0,
      packageId,
    );

    return read(packageId);
  });

  app.delete(`${basePath}/software/:packageId`, async (request, reply) => {
    const { packageId } = request.params as { packageId: string };
    const row = read(packageId);
    if (!row) throw notFound(`No package with id ${packageId}.`);

    /*
     * A package an endpoint has installed cannot be deleted: the inventory
     * rows point at it, and removing the definition would leave the Devices
     * page listing software nothing can describe.
     */
    const installed = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM device_software WHERE software_id = ?`)
        .get(packageId) as { n: number }
    ).n;
    if (installed > 0) {
      throw conflict(
        `${installed.toLocaleString('en-IN')} endpoints have this installed. Retire it instead.`,
      );
    }

    db.prepare(`DELETE FROM software WHERE id = ?`).run(packageId);
    return reply.code(204).send();
  });
}
