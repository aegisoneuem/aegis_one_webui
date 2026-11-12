import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SessionStore,
  createMockServer,
  openDb,
  registerMockIdp,
  type Db,
  type IdpStore,
  type MockUser,
} from '@aegis/mock-core';
import { AGENT_VERSIONS } from './seed/catalog';
import { DEFAULT_DEVICE_COUNT, DEFAULT_SEED, seedDatabase } from './seed/seed';
import { registerAuthRoutes } from './routes/auth';
import { registerResourceRoutes } from './routes/resources';
import { registerDeviceRoutes } from './routes/devices';
import { registerActionRoutes } from './routes/actions';
import { registerAggregateRoutes } from './routes/aggregates';
import { registerEnrollmentRoutes } from './routes/enrollment';
import { registerGroupRoutes } from './routes/groups';
import { registerLiveOpsRoutes } from './routes/liveops';
import { registerVulnerabilityRoutes } from './routes/vulnerabilities';
import { registerConfigurationRoutes } from './routes/configuration';
import { registerDexRoutes } from './routes/dex';
import { registerReportRoutes } from './routes/reports';
import { registerZoneRoutes } from './routes/zones';
import { registerInsightRoutes } from './routes/insight';
import { registerIntegrationRoutes } from './routes/integrations';
import { registerPeerCacheRoutes } from './routes/peercache';
import { registerAdministrationRoutes } from './routes/administration';
import { registerLicensingRoutes } from './routes/licensing';
import { registerDiagnosticsRoutes } from './routes/diagnostics';
import { registerSoftwareWriteRoutes } from './routes/software';
import { registerPatchPolicyRoutes } from './routes/patch-policies';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

const BASE_PATH = '/api/v1';
const PORT = Number(process.env['MOCK_PORT'] ?? 8080);
const APP_ORIGIN = process.env['APP_ORIGIN'] ?? 'http://localhost:5173';
const ISSUER = process.env['MOCK_ISSUER'] ?? `http://localhost:${PORT}`;
const DB_FILE = process.env['MOCK_DB'] ?? resolve(here, '../data/aegis-mock.db');

/**
 * Fixture accounts, one per role, so the whole RBAC matrix can be exercised
 * from the sign-in screen. These are seed data for a mock IdP, not credentials
 * for anything — the real console authenticates against the organisation's own
 * identity provider.
 */
function fixtureUsers(db: Db): MockUser[] {
  const rows = db
    .prepare(
      `SELECT id, email, name, role, zone_ids FROM users WHERE status = 'active' ORDER BY id`,
    )
    .all() as { id: string; email: string; name: string; role: string; zone_ids: string }[];

  const roles = db.prepare(`SELECT name, permissions FROM roles`).all() as {
    name: string;
    permissions: string;
  }[];
  const permissionsByRole = new Map(
    roles.map((r) => [r.name, JSON.parse(r.permissions) as string[]]),
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    password: process.env['MOCK_PASSWORD'] ?? 'Aegis-Demo-2026',
    role: row.role,
    permissions: permissionsByRole.get(row.role) ?? [],
    zoneIds: JSON.parse(row.zone_ids) as string[],
    mfaCode: process.env['MOCK_MFA_CODE'] ?? '246813',
  }));
}

export async function start(): Promise<void> {
  const secret = process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters. See .env.example.');
  }

  const reseed = process.env['MOCK_RESEED'] === '1' || !existsSync(DB_FILE);
  const db = reseed
    ? seedDatabase({
        file: DB_FILE,
        seed: Number(process.env['MOCK_SEED'] ?? DEFAULT_SEED),
        deviceCount: Number(process.env['MOCK_DEVICES'] ?? DEFAULT_DEVICE_COUNT),
        onProgress: (message) => process.stdout.write(`seed: ${message}\n`),
      })
    : openDb({ file: DB_FILE });

  const redirectUris = [`${APP_ORIGIN}/auth/callback`];

  const { app, contract } = await createMockServer({
    basePath: BASE_PATH,
    contractPath: resolve(repoRoot, 'contracts/aegis-one.openapi.yaml'),
    appOrigins: [APP_ORIGIN],
    tokens: { secret, issuer: ISSUER, audience: 'aegis-one-console' },
    // Everything else needs a bearer token. These four are how you get one.
    publicPaths: ['/auth/token', '/auth/refresh', '/auth/logout', '/health'],
    /*
     * Per-session request ceiling. The default of 600/minute is what a person
     * clicking around needs with a lot of headroom; a load generator drives
     * far more than any person does, so a run has to raise it deliberately
     * rather than the limit being quietly weak for everyone.
     */
    rateLimits: {
      max: Number(process.env['MOCK_RATE_MAX'] ?? 600),
      windowMs: Number(process.env['MOCK_RATE_WINDOW_MS'] ?? 60_000),
      authMax: Number(process.env['MOCK_AUTH_RATE_MAX'] ?? 10),
      authWindowMs: Number(process.env['MOCK_AUTH_RATE_WINDOW_MS'] ?? 60_000),
    },
    dev: process.env['NODE_ENV'] !== 'production',
    secure: process.env['MOCK_SECURE'] === '1',
    ...(process.env['MOCK_LATENCY_MAX']
      ? {
          chaos: {
            latencyMinMs: Number(process.env['MOCK_LATENCY_MIN'] ?? 0),
            latencyMaxMs: Number(process.env['MOCK_LATENCY_MAX']),
            errorRate: Number(process.env['MOCK_ERROR_RATE'] ?? 0),
          },
        }
      : {}),
  });

  const sessions = new SessionStore();
  const idp: IdpStore = { codes: new Map() };
  const users = fixtureUsers(db);

  registerMockIdp(
    app,
    { prefix: '/oidc', issuer: ISSUER, clientId: 'aegis-one-console', redirectUris, users },
    idp,
  );

  registerAuthRoutes(app, {
    basePath: BASE_PATH,
    tokens: { secret, issuer: ISSUER, audience: 'aegis-one-console' },
    sessions,
    idp,
    users,
    redirectUris,
    secure: process.env['MOCK_SECURE'] === '1',
  });

  registerAggregateRoutes(app, db, BASE_PATH);
  registerDeviceRoutes(app, db, BASE_PATH);
  registerActionRoutes(app, db, BASE_PATH);
  registerGroupRoutes(app, db, BASE_PATH);
  registerEnrollmentRoutes(app, db, BASE_PATH, AGENT_VERSIONS[0]);
  registerLiveOpsRoutes(app, db, BASE_PATH);
  registerVulnerabilityRoutes(app, db, BASE_PATH);
  registerConfigurationRoutes(app, db, BASE_PATH);
  registerDexRoutes(app, db, BASE_PATH);
  registerReportRoutes(app, db, BASE_PATH);
  registerZoneRoutes(app, db, BASE_PATH);
  registerInsightRoutes(app, db, BASE_PATH);
  registerIntegrationRoutes(app, db, BASE_PATH);
  registerPeerCacheRoutes(app, db, BASE_PATH);
  registerAdministrationRoutes(app, db, BASE_PATH);
  registerLicensingRoutes(app, db, BASE_PATH);
  registerDiagnosticsRoutes(app, db, BASE_PATH);
  registerSoftwareWriteRoutes(app, db, BASE_PATH);
  registerPatchPolicyRoutes(app, db, BASE_PATH);
  // Last, so its generic `/:id` detail routes cannot shadow a specific one
  // such as `/devices/facets`.
  registerResourceRoutes(app, db, BASE_PATH);

  app.get(`${BASE_PATH}/health`, async () => ({
    status: 'ok',
    contractVersion: contract.version,
    operationsInContract: contract.operationCount,
  }));

  setInterval(() => sessions.sweep(), 10 * 60_000).unref();

  await app.listen({ port: PORT, host: '127.0.0.1' });
  app.log.info(
    {
      devices: (db.prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n,
      origin: APP_ORIGIN,
    },
    `mock server ready on http://localhost:${PORT}${BASE_PATH}`,
  );
}

start().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
