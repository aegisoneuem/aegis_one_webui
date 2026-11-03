import type { FastifyInstance } from 'fastify';
import { type Db } from '@aegis/mock-core';

/**
 * Enrollment: how an endpoint joins the estate.
 *
 * `GET /enrollment/tokens` is a bare array in the contract rather than a page,
 * so neither of these goes through the generic resource lister.
 */

/** Seven days without a check-in is what the approved page calls "not checking in". */
const STALE_DAYS = 7;

/**
 * The install command per platform, as the approved design prints it.
 *
 * Both placeholders stay placeholders. A console that rendered a real token
 * here would put a working credential on a screen people screenshot into
 * tickets, which is exactly what the caption underneath warns against.
 */
const INSTALL_COMMANDS = {
  windows:
    'msiexec /i AegisAgent.msi /qn ENROLL_TOKEN="<ENROLLMENT_TOKEN>" SERVER="https://<CONSOLE_HOST>"',
  macos:
    'sudo installer -pkg AegisAgent.pkg -target / && sudo /opt/aegis/bin/aegis enroll --token "<ENROLLMENT_TOKEN>" --server "https://<CONSOLE_HOST>"',
  linux:
    'curl -fsSLO https://<CONSOLE_HOST>/agent/aegis-agent.deb && sudo dpkg -i aegis-agent.deb && sudo aegis enroll --token "<ENROLLMENT_TOKEN>"',
} as const;

export function registerEnrollmentRoutes(
  app: FastifyInstance,
  db: Db,
  basePath: string,
  latestAgentVersion: string,
): void {
  app.get(`${basePath}/enrollment/summary`, async () => {
    const stale = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();

    const devices = db
      .prepare(
        `SELECT COUNT(*) AS enrolled,
                SUM(status = 'online') AS online,
                SUM(agent_version = ?) AS onLatestAgent,
                SUM(last_seen_at < ?) AS notCheckingIn,
                SUM(os_family = 'Windows') AS windows,
                SUM(os_family = 'macOS') AS macos,
                SUM(os_family = 'Linux') AS linux
           FROM devices`,
      )
      .get(latestAgentVersion, stale) as Record<string, number>;

    const tokens = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(revoked_at IS NULL AND expires_at > ?) AS active
           FROM enrollment_tokens`,
      )
      .get(new Date().toISOString()) as { total: number; active: number };

    /*
     * Directory auto-enrol is the only one of the four whose state is a fact
     * about this estate rather than about the product: it depends on an
     * identity integration being connected. The other three are fixed — the
     * installer always works, imaging is a documented path with nothing to
     * configure, and nothing here accepts a serial-number CSV.
     */
    const identity = db
      .prepare(`SELECT COUNT(*) AS n FROM integrations WHERE kind = 'identity' AND status = ?`)
      .get('connected') as { n: number };

    return {
      enrolled: devices['enrolled'] ?? 0,
      online: devices['online'] ?? 0,
      onLatestAgent: devices['onLatestAgent'] ?? 0,
      latestAgentVersion,
      activeTokens: tokens.active ?? 0,
      totalTokens: tokens.total ?? 0,
      notCheckingIn: devices['notCheckingIn'] ?? 0,
      byPlatform: {
        windows: devices['windows'] ?? 0,
        macos: devices['macos'] ?? 0,
        linux: devices['linux'] ?? 0,
      },
      installCommands: INSTALL_COMMANDS,
      methods: [
        {
          id: 'agent-installer',
          name: 'Agent Installer',
          description: 'Windows MSI, macOS PKG and Linux DEB/RPM with an enrollment token.',
          state: 'ready',
        },
        {
          id: 'directory-auto-enroll',
          name: 'Directory Auto-Enroll',
          description:
            'Enroll domain-joined devices through Entra ID or Active Directory group policy.',
          state: identity.n > 0 ? 'configured' : 'not-configured',
        },
        {
          id: 'imaging-vdi',
          name: 'Imaging & VDI',
          description: 'Add the agent to a golden image; each clone enrolls on first boot.',
          state: 'available',
        },
        {
          id: 'bulk-import',
          name: 'Bulk Import',
          description: 'Upload a CSV of serial numbers to pre-assign groups before devices arrive.',
          state: 'not-configured',
        },
      ],
    };
  });

  app.get(`${basePath}/enrollment/tokens`, async () => {
    const now = new Date().toISOString();
    return db
      .prepare(
        `SELECT t.id, t.name, g.name AS targetGroup, t.created_at AS createdAt,
                t.expires_at AS expiresAt, t.uses, t.max_uses AS maxUses,
                CASE WHEN t.revoked_at IS NOT NULL THEN 'revoked'
                     WHEN t.expires_at <= ? THEN 'expired'
                     ELSE 'active' END AS status
           FROM enrollment_tokens t
           LEFT JOIN device_groups g ON g.id = t.target_group_id
          ORDER BY t.created_at DESC`,
      )
      .all(now);
  });
}
