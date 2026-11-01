import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, openDb, type Db, type Rng } from '@aegis/mock-core';
import {
  AGENT_VERSIONS,
  CONFIG_BENCHMARKS,
  CONFIG_CHECK_TITLES,
  CVES,
  DEPARTMENTS,
  FIRST_NAMES,
  INTEGRATIONS,
  LAST_NAMES,
  OPERATING_SYSTEMS,
  SERVER_MODELS,
  SOFTWARE,
  WORKSTATION_MODELS,
  ZONES,
} from './catalog';

/**
 * Builds the whole fixture estate from one integer seed.
 *
 * The seed is documented in docs/seed.md and defaults to 20260401. Running
 * this twice with the same seed produces byte-identical data, which is what
 * makes a load-test result or a screenshot worth anything.
 */

export const DEFAULT_SEED = 20_260_401;
export const DEFAULT_DEVICE_COUNT = 50_000;

const here = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse('2026-11-01T09:30:00+05:30');

const iso = (ms: number): string => new Date(ms).toISOString();
const daysAgo = (n: number): string => iso(NOW - n * 86_400_000);

interface SeedOptions {
  file: string;
  seed?: number;
  deviceCount?: number;
  onProgress?: (message: string) => void;
}

export function seedDatabase({
  file,
  seed = DEFAULT_SEED,
  deviceCount = DEFAULT_DEVICE_COUNT,
  onProgress = () => {},
}: SeedOptions): Db {
  const db = openDb({ file, fresh: true });
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));

  const rng = createRng(seed);

  seedZones(db);
  seedSoftware(db);
  const patches = seedPatches(db, rng);
  seedVulnerabilities(db);
  onProgress('reference data');

  const deviceStats = seedDevices(db, rng, deviceCount, patches, onProgress);
  onProgress(`${deviceCount.toLocaleString('en-IN')} devices`);

  rollUpCounts(db);
  seedGroups(db, rng, deviceCount);
  seedConfigChecks(db, rng, deviceCount);
  seedDeployments(db, rng);
  seedLiveJobs(db, rng);
  seedLogBundles(db, rng);
  seedPeers(db, rng);
  seedIntegrations(db, rng);
  seedUsersAndRoles(db, rng);
  seedTokens(db, rng);
  seedLicenses(db, deviceStats.total);
  seedServiceHealth(db, rng);
  seedReports(db);
  seedAuditLog(db, rng);
  onProgress('operational data');

  return db;
}

function seedZones(db: Db): void {
  const insert = db.prepare(
    `INSERT INTO zones (id,name,city,device_count,peer_cache,bandwidth_mbps,relay_status,last_sync_at)
     VALUES (?,?,?,0,?,?,?,?)`,
  );
  db.transaction(() => {
    for (const z of ZONES) {
      insert.run(
        z.id,
        z.name,
        z.city,
        z.peerCache ? 1 : 0,
        z.bandwidthMbps,
        z.id === 'zn-jai-br' ? 'degraded' : 'healthy',
        iso(NOW - (z.id === 'zn-jai-br' ? 41 : 3) * 60_000),
      );
    }
  })();
}

function seedSoftware(db: Db): void {
  const insert = db.prepare(
    `INSERT INTO software (id,title,publisher,category,latest_version,size_mb) VALUES (?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    for (const s of SOFTWARE)
      insert.run(s.id, s.title, s.publisher, s.category, s.latestVersion, s.sizeMb);
  })();
}

interface PatchRow {
  id: string;
  platform: string;
  severity: string;
}

function seedPatches(db: Db, rng: Rng): PatchRow[] {
  const rows: PatchRow[] = [];
  const insert = db.prepare(
    `INSERT INTO patches (id,title,kb,platform,severity,category,released_at,reboot_required) VALUES (?,?,?,?,?,?,?,?)`,
  );

  const windowsPatches = [
    [
      'KB5041585',
      '2026-10 Cumulative Update for Windows 11, version 24H2',
      'critical',
      'Security Update',
    ],
    [
      'KB5040712',
      '2026-09 Cumulative Update for Windows 11, version 23H2',
      'critical',
      'Security Update',
    ],
    [
      'KB5039895',
      '2026-08 Cumulative Update for Windows 10, version 22H2',
      'important',
      'Security Update',
    ],
    [
      'KB5043098',
      '2026-10 Cumulative Update for Windows Server 2022',
      'critical',
      'Security Update',
    ],
    [
      'KB5042881',
      '2026-10 .NET Framework Security and Quality Rollup',
      'important',
      'Security Update',
    ],
    [
      'KB5041940',
      'Servicing Stack Update for Windows 11, version 24H2',
      'moderate',
      'Servicing Stack',
    ],
    ['KB5039211', 'Windows Malicious Software Removal Tool', 'low', 'Tool'],
    [
      'KB5038901',
      'Microsoft Defender Antivirus definition update',
      'important',
      'Definition Update',
    ],
  ] as const;

  const linuxPatches = [
    [
      'RHSA-2026:7741',
      'Important: kernel security and bug fix update',
      'important',
      'Security Update',
    ],
    ['RHSA-2026:7520', 'Critical: openssl security update', 'critical', 'Security Update'],
    ['USN-7122-1', 'Linux kernel vulnerabilities', 'important', 'Security Update'],
    ['USN-7098-2', 'curl vulnerability', 'moderate', 'Security Update'],
  ] as const;

  const macPatches = [
    ['macOS-15.1', 'macOS Sequoia 15.1 Update', 'critical', 'OS Update'],
    ['macOS-14.7.1', 'macOS Sonoma 14.7.1 Update', 'important', 'OS Update'],
  ] as const;

  const thirdParty = SOFTWARE.slice(0, 14).map(
    (s) =>
      [
        `TP-${s.id.slice(3).toUpperCase()}`,
        `${s.title} ${s.latestVersion}`,
        'important',
        'Third-Party App',
      ] as const,
  );

  const firmware = [
    ['DELL-BIOS-1.28.0', 'Dell Latitude 5450 System BIOS 1.28.0', 'moderate', 'Driver & BIOS'],
    ['LEN-BIOS-N3VET48W', 'ThinkPad T14 Gen 5 BIOS N3VET48W', 'moderate', 'Driver & BIOS'],
    ['INTEL-NIC-29.1', 'Intel Ethernet Adapter driver 29.1', 'low', 'Driver & BIOS'],
  ] as const;

  const groups: readonly (readonly [
    readonly (readonly [string, string, string, string])[],
    string,
  ])[] = [
    [windowsPatches, 'Windows'],
    [linuxPatches, 'Linux'],
    [macPatches, 'macOS'],
    [thirdParty, 'Third-Party'],
    [firmware, 'Firmware'],
  ];

  db.transaction(() => {
    for (const [list, platform] of groups) {
      for (const [kb, title, severity, category] of list) {
        const id = `pt-${kb.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        insert.run(
          id,
          title,
          kb,
          platform,
          severity,
          category,
          daysAgo(rng.int(3, 120)),
          category === 'Security Update' || category === 'OS Update' ? 1 : 0,
        );
        rows.push({ id, platform, severity });
      }
    }
  })();

  return rows;
}

function seedVulnerabilities(db: Db): void {
  const insert = db.prepare(
    `INSERT INTO vulnerabilities (id,title,severity,cvss,exploited,published_at,affects,fixed_by) VALUES (?,?,?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    for (const c of CVES) {
      insert.run(
        c.id,
        c.title,
        c.severity,
        c.cvss,
        c.exploited ? 1 : 0,
        daysAgo(c.publishedDaysAgo),
        c.affects,
        c.fixedBy,
      );
    }
  })();
}

const ZONE_WEIGHTS = ZONES.map((z) => [z, z.weight] as const);
const OS_WEIGHTS = OPERATING_SYSTEMS.map((o) => [o, o.weight] as const);

function seedDevices(
  db: Db,
  rng: Rng,
  count: number,
  patches: readonly PatchRow[],
  onProgress: (message: string) => void,
): { total: number } {
  const insertDevice = db.prepare(`INSERT INTO devices (
    id,hostname,status,os_family,os_name,os_version,os_build,kind,zone_id,zone_name,
    primary_user,primary_user_name,department,ip,mac,serial,model,cpu,ram_gb,disk_total_gb,disk_free_pct,
    agent_version,last_seen_at,enrolled_at,compliance_pct,pending_patches,critical_vulns,dex_score,
    encrypted,reboot_pending,config_pass_pct
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const insertSoftware = db.prepare(
    `INSERT INTO device_software (device_id,software_id,version,outdated,installed_at) VALUES (?,?,?,?,?)`,
  );
  const insertPatch = db.prepare(
    `INSERT INTO device_patches (device_id,patch_id,state,updated_at) VALUES (?,?,?,?)`,
  );
  const insertVuln = db.prepare(
    `INSERT INTO device_vulnerabilities (device_id,vulnerability_id,state,first_seen_at) VALUES (?,?,?,?)`,
  );

  const BATCH = 2500;

  const writeBatch = db.transaction((from: number, to: number) => {
    for (let i = from; i < to; i++) {
      const zone = rng.weighted(ZONE_WEIGHTS);
      const os = rng.weighted(OS_WEIGHTS);
      const isServer = os.kind === 'server';

      const first = rng.pick(FIRST_NAMES);
      const last = rng.pick(LAST_NAMES);
      const userId = `${first[0]?.toLowerCase() ?? 'x'}.${last.toLowerCase()}`;

      const prefix = zone.name
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase();
      const hostname = isServer
        ? `${prefix}-SRV-${String(i % 9999).padStart(4, '0')}`
        : `${prefix}-WS-${String(i % 9999).padStart(4, '0')}`;

      // Jaipur's relay is degraded, so its endpoints check in less reliably.
      const offlineChance = zone.id === 'zn-jai-br' ? 0.12 : 0.03;
      const status = rng.chance(offlineChance)
        ? 'offline'
        : rng.chance(0.06)
          ? 'pending-restart'
          : 'online';

      const lastSeen =
        status === 'offline' ? rng.recentMs(NOW, 45) : NOW - rng.int(30_000, 3_600_000);
      const diskFree = rng.weighted([
        [rng.int(2, 9), 6],
        [rng.int(10, 34), 34],
        [rng.int(35, 88), 60],
      ] as const);

      const compliance = Math.max(
        38,
        Math.min(100, 93 + rng.int(-22, 7) - (zone.id === 'zn-jai-br' ? 9 : 0)),
      );
      const deviceId = `dev-${String(100000 + i)}`;

      // Software, patches and findings for this device, decided from the same
      // stream. They are buffered rather than written straight away: the child
      // tables have a foreign key to devices, and the device row needs the
      // counts these loops produce, so the parent has to be inserted between.
      let pendingPatches = 0;
      let criticalVulns = 0;
      const softwareRows: unknown[][] = [];
      const patchRows: unknown[][] = [];
      const vulnRows: unknown[][] = [];

      for (const s of SOFTWARE) {
        if (!rng.chance(s.install)) continue;
        const outdated = rng.chance(0.22);
        const version = outdated ? agePatchVersion(s.latestVersion, rng) : s.latestVersion;
        softwareRows.push([deviceId, s.id, version, outdated ? 1 : 0, daysAgo(rng.int(5, 600))]);
      }

      for (const p of patches) {
        const applicable =
          (p.platform === 'Windows' && os.family.startsWith('Windows')) ||
          (p.platform === 'Linux' && os.family === 'Linux') ||
          (p.platform === 'macOS' && os.family === 'macOS') ||
          p.platform === 'Third-Party' ||
          (p.platform === 'Firmware' && !isServer);
        if (!applicable || !rng.chance(0.45)) continue;

        const state = rng.weighted([
          ['installed', 76],
          ['pending', 14],
          ['failed', 4],
          ['not-applicable', 6],
        ] as const);
        if (state === 'pending' || state === 'failed') pendingPatches++;
        patchRows.push([deviceId, p.id, state, iso(rng.recentMs(NOW, 60))]);
      }

      for (const c of CVES) {
        const relevant =
          c.affects === os.family ||
          c.affects === os.name ||
          (c.affects === 'Windows' && os.family.startsWith('Windows')) ||
          SOFTWARE.some((s) => s.title === c.affects);
        if (!relevant || !rng.chance(c.severity === 'critical' ? 0.16 : 0.1)) continue;

        const state = rng.weighted([
          ['open', 62],
          ['remediated', 30],
          ['accepted-risk', 8],
        ] as const);
        if (state === 'open' && c.severity === 'critical') criticalVulns++;
        vulnRows.push([deviceId, c.id, state, iso(rng.recentMs(NOW, c.publishedDaysAgo))]);
      }

      insertDevice.run(
        deviceId,
        hostname,
        status,
        os.family,
        os.name,
        os.version,
        os.build,
        os.kind,
        zone.id,
        zone.name,
        userId,
        `${first} ${last}`,
        rng.pick(DEPARTMENTS),
        `10.${20 + (ZONES.indexOf(zone) % 12)}.${rng.int(0, 254)}.${rng.int(2, 254)}`,
        macAddress(rng),
        `SN${String(4_810_000 + i * 13)}`,
        isServer ? rng.pick(SERVER_MODELS) : rng.pick(WORKSTATION_MODELS),
        isServer
          ? 'Intel Xeon Gold 6430'
          : rng.pick([
              'Intel Core Ultra 7 155U',
              'Intel Core i7-1365U',
              'AMD Ryzen 7 7840U',
              'Apple M3',
            ]),
        isServer ? rng.pick([64, 128, 256]) : rng.pick([16, 16, 32, 32, 64]),
        isServer ? rng.pick([960, 1920, 3840]) : rng.pick([256, 512, 512, 1024]),
        diskFree,
        rng.weighted([
          [AGENT_VERSIONS[0], 62],
          [AGENT_VERSIONS[1], 22],
          [AGENT_VERSIONS[2], 10],
          [AGENT_VERSIONS[3], 4],
          [AGENT_VERSIONS[4], 2],
        ] as const),
        iso(lastSeen),
        daysAgo(rng.int(20, 1400)),
        compliance,
        pendingPatches,
        criticalVulns,
        Math.max(20, Math.min(100, 78 + rng.int(-28, 20) - (diskFree < 10 ? 14 : 0))),
        os.family === 'Linux' || os.family === 'AIX'
          ? rng.chance(0.6)
            ? 1
            : 0
          : rng.chance(0.93)
            ? 1
            : 0,
        status === 'pending-restart' ? 1 : 0,
        Math.max(40, Math.min(100, compliance + rng.int(-10, 6))),
      );

      for (const row of softwareRows) insertSoftware.run(...row);
      for (const row of patchRows) insertPatch.run(...row);
      for (const row of vulnRows) insertVuln.run(...row);
    }
  });

  for (let from = 0; from < count; from += BATCH) {
    const to = Math.min(from + BATCH, count);
    writeBatch(from, to);
    if (to % 10_000 === 0)
      onProgress(`  ${to.toLocaleString('en-IN')} / ${count.toLocaleString('en-IN')} devices`);
  }

  return { total: count };
}

function agePatchVersion(latest: string, rng: Rng): string {
  const parts = latest.split('.');
  const headRaw = parts[0] ?? '1';
  const head = Number.parseInt(headRaw, 10);
  if (Number.isNaN(head)) return `${latest}-prev`;
  return [String(Math.max(1, head - rng.int(1, 3))), ...parts.slice(1)].join('.');
}

function macAddress(rng: Rng): string {
  return Array.from({ length: 6 }, () =>
    rng.int(0, 255).toString(16).padStart(2, '0').toUpperCase(),
  ).join(':');
}

/** Rolls per-device rows up into the counts the list pages show. */
function rollUpCounts(db: Db): void {
  db.exec(`
    UPDATE zones SET device_count = (SELECT COUNT(*) FROM devices WHERE devices.zone_id = zones.id);

    UPDATE software SET
      install_count = (SELECT COUNT(*) FROM device_software WHERE device_software.software_id = software.id),
      outdated_count = (SELECT COUNT(*) FROM device_software WHERE device_software.software_id = software.id AND outdated = 1);

    UPDATE patches SET
      applicable_count = (SELECT COUNT(*) FROM device_patches WHERE device_patches.patch_id = patches.id),
      installed_count = (SELECT COUNT(*) FROM device_patches WHERE device_patches.patch_id = patches.id AND state = 'installed'),
      failed_count = (SELECT COUNT(*) FROM device_patches WHERE device_patches.patch_id = patches.id AND state = 'failed');

    UPDATE vulnerabilities SET
      affected_count = (SELECT COUNT(*) FROM device_vulnerabilities WHERE device_vulnerabilities.vulnerability_id = vulnerabilities.id AND state = 'open'),
      remediated_count = (SELECT COUNT(*) FROM device_vulnerabilities WHERE device_vulnerabilities.vulnerability_id = vulnerabilities.id AND state = 'remediated');
  `);
}

function seedGroups(db: Db, rng: Rng, deviceCount: number): void {
  const insert = db.prepare(
    `INSERT INTO device_groups (id,name,kind,rule,member_count,created_at,created_by) VALUES (?,?,?,?,?,?,?)`,
  );
  const groups: readonly (readonly [string, 'rule' | 'static', string | null, number])[] = [
    [
      'All Windows workstations',
      'rule',
      'os_family = "Windows" AND kind = "workstation"',
      Math.round(deviceCount * 0.66),
    ],
    ['All servers', 'rule', 'kind = "server"', Math.round(deviceCount * 0.17)],
    [
      'Mumbai HQ — Finance',
      'rule',
      'zone_name = "Mumbai HQ" AND department = "Finance"',
      Math.round(deviceCount * 0.03),
    ],
    ['Pilot ring', 'static', null, 412],
    [
      'Broad ring',
      'rule',
      'NOT in Pilot ring AND NOT in Late ring',
      Math.round(deviceCount * 0.78),
    ],
    ['Late ring — production servers', 'static', null, 1180],
    ['Low disk (< 10% free)', 'rule', 'disk_free_pct < 10', Math.round(deviceCount * 0.06)],
    ['Unencrypted endpoints', 'rule', 'encrypted = false', Math.round(deviceCount * 0.09)],
    ['Agent below 7.4', 'rule', 'agent_version < "7.4.0"', Math.round(deviceCount * 0.16)],
    ['Executive laptops', 'static', null, 84],
    ['Jaipur Branch — all', 'rule', 'zone_name = "Jaipur Branch"', Math.round(deviceCount * 0.08)],
    ['Linux build agents', 'rule', 'os_family = "Linux" AND department = "Engineering"', 346],
  ];

  db.transaction(() => {
    groups.forEach(([name, kind, rule, members], i) => {
      insert.run(
        `grp-${String(i + 1).padStart(3, '0')}`,
        name,
        kind,
        rule,
        members,
        daysAgo(rng.int(30, 700)),
        rng.pick(['r.deshpande', 'a.iyer', 's.kulkarni']),
      );
    });
  })();
}

function seedConfigChecks(db: Db, rng: Rng, deviceCount: number): void {
  const insert = db.prepare(
    `INSERT INTO config_checks (id,title,benchmark,severity,platform,pass_count,fail_count,exception_count) VALUES (?,?,?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    // 200 checks, as the Configuration page reports.
    for (let i = 0; i < 200; i++) {
      const title = CONFIG_CHECK_TITLES[i % CONFIG_CHECK_TITLES.length] ?? 'Baseline check';
      const benchmark = CONFIG_BENCHMARKS[i % CONFIG_BENCHMARKS.length] ?? CONFIG_BENCHMARKS[0];
      const applicable = Math.round(deviceCount * (0.2 + rng.next() * 0.7));
      const fail = Math.round(applicable * (rng.next() ** 2 * 0.3));
      const exceptions = Math.round(fail * rng.next() * 0.2);
      insert.run(
        `chk-${String(i + 1).padStart(3, '0')}`,
        i < CONFIG_CHECK_TITLES.length
          ? title
          : `${title} (${Math.floor(i / CONFIG_CHECK_TITLES.length) + 1})`,
        benchmark,
        rng.weighted([
          ['high', 30],
          ['medium', 45],
          ['low', 25],
        ] as const),
        rng.pick(['Windows', 'Linux', 'macOS', 'All']),
        applicable - fail,
        fail,
        exceptions,
      );
    }
  })();
}

function seedDeployments(db: Db, rng: Rng): void {
  const insert = db.prepare(`INSERT INTO deployments
    (id,name,type,status,content,target_count,succeeded,failed,pending,created_at,created_by,scheduled_at,completed_at,wake_offline_first,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const plans: readonly (readonly [string, string, string])[] = [
    ['Google Chrome 142.0 — broad ring', 'software-install', 'Google Chrome 142.0.7204.92'],
    ['October security rollup — pilot', 'patch', 'KB5041585'],
    ['October security rollup — broad', 'patch', 'KB5041585'],
    ['CrowdStrike sensor 7.20 upgrade', 'software-install', 'CrowdStrike Falcon Sensor 7.20.19507'],
    ['Remove TeamViewer from Finance', 'software-uninstall', 'TeamViewer 15.58.4'],
    ['Disk cleanup script — low disk group', 'script', 'cleanup-temp.ps1'],
    ['RHEL 9 kernel update', 'patch', 'RHSA-2026:7741'],
    ['macOS Sequoia 15.1', 'os-update', 'macOS Sequoia 15.1'],
    ['Adobe Acrobat Reader 24.4', 'software-install', 'Adobe Acrobat Reader 24.4.20272'],
    ['BIOS 1.28.0 — Latitude 5450', 'patch', 'DELL-BIOS-1.28.0'],
    ['Netskope client rollout — Bengaluru', 'software-install', 'Netskope Client 120.0.1'],
    ['Java 21.0.5 upgrade', 'software-install', 'Oracle Java SE Runtime 21.0.5'],
    ['Zoom Workplace 6.2.11', 'software-install', 'Zoom Workplace 6.2.11'],
    ['Collect firewall state — all servers', 'script', 'get-firewall-state.ps1'],
    ['SAP GUI 8.00 PL12', 'software-install', 'SAP GUI for Windows 8.00 PL12'],
  ];

  db.transaction(() => {
    plans.forEach(([name, type, content], i) => {
      const targets = rng.int(60, 9800);
      const status = rng.weighted([
        ['completed', 48],
        ['running', 18],
        ['scheduled', 16],
        ['failed', 8],
        ['cancelled', 4],
        ['completed-with-errors', 6],
      ] as const);

      const done =
        status === 'scheduled'
          ? 0
          : status === 'running'
            ? Math.round(targets * rng.next() * 0.8)
            : targets;
      const failed =
        status === 'scheduled'
          ? 0
          : Math.round(done * (status === 'failed' ? 0.72 : rng.next() * 0.07));
      const created = rng.recentMs(NOW, 45);

      insert.run(
        `dep-${String(1000 + i)}`,
        name,
        type,
        status,
        content,
        targets,
        done - failed,
        failed,
        targets - done,
        iso(created),
        rng.pick(['r.deshpande', 'a.iyer', 's.kulkarni', 'n.banerjee']),
        status === 'scheduled' ? iso(NOW + rng.int(1, 72) * 3_600_000) : null,
        status === 'completed' || status === 'completed-with-errors'
          ? iso(created + rng.int(1, 9) * 3_600_000)
          : null,
        rng.chance(0.4) ? 1 : 0,
        rng.chance(0.3) ? 'Change CHG-0048213 approved by the CAB on 2026-10-28.' : null,
      );
    });
  })();

  // Per-endpoint results, for the deployment detail page.
  const devices = db.prepare(`SELECT id FROM devices LIMIT 4000`).all() as { id: string }[];
  const insertResult = db.prepare(
    `INSERT INTO deployment_results (deployment_id,device_id,state,message,finished_at) VALUES (?,?,?,?,?)`,
  );
  const deployments = db.prepare(`SELECT id, status FROM deployments`).all() as {
    id: string;
    status: string;
  }[];

  db.transaction(() => {
    for (const dep of deployments) {
      if (dep.status === 'scheduled') continue;
      const sample = devices.slice(0, rng.int(120, 600));
      for (const device of sample) {
        const state = rng.weighted([
          ['succeeded', 86],
          ['failed', 7],
          ['pending', 5],
          ['skipped', 2],
        ] as const);
        insertResult.run(
          dep.id,
          device.id,
          state,
          state === 'failed'
            ? rng.pick([
                'Installer exited with code 1603.',
                'Not enough free disk space on the system drive.',
                'The endpoint did not come back after the restart window.',
                'Package signature could not be verified.',
              ])
            : null,
          state === 'pending' ? null : iso(rng.recentMs(NOW, 20)),
        );
      }
    }
  })();
}

/**
 * Remote script execution jobs.
 *
 * Submitted, polled, and read back per endpoint. Nothing here is a session:
 * there is no channel to attach to and no way to send a second command to a
 * running job.
 */
function seedLiveJobs(db: Db, rng: Rng): void {
  const insertJob = db.prepare(`INSERT INTO live_jobs
    (id,name,kind,language,script,reason,status,target_count,completed,failed,created_at,created_by,finished_at,output_limit_kb)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertResult = db.prepare(`INSERT INTO live_job_results
    (job_id,device_id,hostname,state,exit_code,stdout,stderr,duration_ms,finished_at) VALUES (?,?,?,?,?,?,?,?,?)`);

  const jobs: readonly (readonly [
    string,
    'live-data' | 'script' | 'log-collection',
    string,
    string,
  ])[] = [
    [
      'Check pending restart — Mumbai HQ',
      'live-data',
      'powershell',
      '# live data query: pending restart, uptime, disk',
    ],
    [
      'Clear Windows Update cache',
      'script',
      'powershell',
      'Stop-Service wuauserv\nRemove-Item "$env:SystemRoot\\SoftwareDistribution\\Download\\*" -Recurse -Force\nStart-Service wuauserv',
    ],
    ['Collect agent logs — failed patch group', 'log-collection', null as unknown as string, ''],
    [
      'Report installed certificates',
      'script',
      'powershell',
      'Get-ChildItem Cert:\\LocalMachine\\My | Select-Object Subject, NotAfter',
    ],
    [
      'Free disk on /var — RHEL build agents',
      'script',
      'shell',
      'journalctl --vacuum-size=200M && df -h /var',
    ],
    [
      'Inventory refresh — Jaipur Branch',
      'live-data',
      'powershell',
      '# live data query: inventory',
    ],
    ['Collect crash dumps — Engineering', 'log-collection', null as unknown as string, ''],
    [
      'Verify firewall profiles',
      'script',
      'powershell',
      'Get-NetFirewallProfile | Select-Object Name, Enabled',
    ],
  ];

  const devices = db.prepare(`SELECT id, hostname FROM devices LIMIT 400`).all() as {
    id: string;
    hostname: string;
  }[];

  db.transaction(() => {
    jobs.forEach(([name, kind, language, script], i) => {
      const targets = rng.int(18, 820);
      const status = rng.weighted([
        ['completed', 56],
        ['running', 22],
        ['queued', 10],
        ['failed', 6],
        ['cancelled', 6],
      ] as const);
      const completed =
        status === 'queued' ? 0 : status === 'running' ? Math.round(targets * rng.next()) : targets;
      const failed = Math.round(completed * (status === 'failed' ? 0.64 : rng.next() * 0.09));
      const created = rng.recentMs(NOW, 14);
      const jobId = `job-${String(2000 + i)}`;

      insertJob.run(
        jobId,
        name,
        kind,
        kind === 'log-collection' ? null : language,
        kind === 'log-collection' ? null : script,
        rng.chance(0.5) ? 'INC-0092144' : null,
        status,
        targets,
        completed,
        failed,
        iso(created),
        rng.pick(['r.deshpande', 'a.iyer', 'n.banerjee']),
        status === 'completed' || status === 'failed'
          ? iso(created + rng.int(20, 900) * 1000)
          : null,
        256,
      );

      if (status === 'queued') return;
      for (const device of devices.slice(0, Math.min(targets, rng.int(20, 120)))) {
        const state = rng.weighted([
          ['succeeded', 84],
          ['failed', 8],
          ['timed-out', 4],
          ['unreachable', 4],
        ] as const);
        insertResult.run(
          jobId,
          device.id,
          device.hostname,
          state,
          state === 'succeeded' ? 0 : state === 'failed' ? rng.pick([1, 2, 1603]) : null,
          state === 'succeeded' ? sampleStdout(kind, rng) : null,
          state === 'failed' ? 'Access is denied. (0x80070005)' : null,
          rng.int(240, 42_000),
          iso(rng.recentMs(NOW, 14)),
        );
      }
    });
  })();
}

function sampleStdout(kind: string, rng: Rng): string {
  if (kind === 'log-collection')
    return 'Collected 4 files (agent.log, system.evtx, patch.log, setupapi.dev.log) — 18.4 MB';
  if (kind === 'live-data') {
    return [
      `PendingRestart : ${rng.chance(0.3) ? 'True' : 'False'}`,
      `UptimeDays     : ${rng.int(1, 94)}`,
      `FreeSpaceGB    : ${rng.int(4, 320)}`,
      `LastPatchAt    : ${daysAgo(rng.int(1, 60)).slice(0, 10)}`,
    ].join('\n');
  }
  return [
    'Stopping service wuauserv...',
    'Removed 1,284 files (3.9 GB).',
    'Starting service wuauserv...',
    'Done.',
  ].join('\n');
}

function seedLogBundles(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO log_bundles (id,device_id,hostname,file_types,status,size_bytes,collected_at,emailed) VALUES (?,?,?,?,?,?,?,?)`,
  );
  const devices = db.prepare(`SELECT id, hostname FROM devices LIMIT 600`).all() as {
    id: string;
    hostname: string;
  }[];
  const types = [
    'agent',
    'system-event',
    'application',
    'security',
    'patch-update',
    'custom-path',
  ] as const;

  db.transaction(() => {
    devices.forEach((device, i) => {
      insert.run(
        `log-${String(5000 + i)}`,
        device.id,
        device.hostname,
        JSON.stringify(
          [rng.pick(types), rng.pick(types)].filter((v, idx, arr) => arr.indexOf(v) === idx),
        ),
        rng.weighted([
          ['uploaded', 82],
          ['waiting', 9],
          ['failed', 6],
          ['skipped', 3],
        ] as const),
        rng.int(240_000, 94_000_000),
        iso(rng.recentMs(NOW, 30)),
        rng.chance(0.25) ? 1 : 0,
      );
    });
  })();
}

function seedPeers(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO peers (id,hostname,zone_id,zone_name,cache_size_gb,cache_used_gb,served_gb,peers_served,status,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    let n = 0;
    for (const zone of ZONES) {
      if (!zone.peerCache) continue;
      const count = Math.max(2, Math.round(zone.weight / 4));
      for (let i = 0; i < count; i++) {
        const size = rng.pick([100, 200, 500]);
        insert.run(
          `peer-${String(300 + n++)}`,
          `${zone.name
            .replace(/[^A-Za-z]/g, '')
            .slice(0, 3)
            .toUpperCase()}-CACHE-${String(i + 1).padStart(2, '0')}`,
          zone.id,
          zone.name,
          size,
          Math.round(size * (0.3 + rng.next() * 0.65)),
          rng.int(40, 9400),
          rng.int(12, 1800),
          rng.weighted([
            ['healthy', 86],
            ['degraded', 10],
            ['offline', 4],
          ] as const),
          iso(NOW - rng.int(30_000, 7_200_000)),
        );
      }
    }
  })();
}

function seedIntegrations(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO integrations (id,name,kind,status,last_event_at,events_24h) VALUES (?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    for (const int of INTEGRATIONS) {
      insert.run(
        int.id,
        int.name,
        int.kind,
        int.status,
        int.status === 'disconnected' ? daysAgo(4) : iso(NOW - rng.int(5_000, 900_000)),
        int.status === 'disconnected' ? 0 : rng.int(40, 184_000),
      );
    }
  })();
}

/** The five built-in roles from the contract's x-roles matrix. */
const ROLES: readonly (readonly [string, string, string[], boolean])[] = [
  ['role-super-admin', 'Super Admin', ['*'], true],
  [
    'role-admin',
    'Admin',
    [
      'devices:*',
      'groups:*',
      'enrollment:*',
      'patches:*',
      'software:*',
      'liveops:*',
      'deployments:*',
      'vulns:*',
      'profiles:*',
      'dex:read',
      'insight:read',
      'sites:*',
      'peercache:*',
      'reports:*',
      'integrations:*',
      'admin:users',
      'admin:roles',
      'admin:tokens',
      'licensing:read',
      'diagnostics:read',
    ],
    true,
  ],
  [
    'role-operator',
    'Operator',
    [
      'devices:read',
      'devices:action',
      'groups:read',
      'patches:read',
      'patches:deploy',
      'software:read',
      'software:deploy',
      'liveops:read',
      'liveops:run',
      'deployments:read',
      'deployments:create',
      'vulns:read',
      'profiles:read',
      'dex:read',
      'insight:read',
      'sites:read',
      'peercache:read',
      'reports:read',
      'diagnostics:read',
    ],
    true,
  ],
  [
    'role-auditor',
    'Auditor',
    [
      'devices:read',
      'groups:read',
      'enrollment:read',
      'patches:read',
      'software:read',
      'liveops:read',
      'deployments:read',
      'vulns:read',
      'profiles:read',
      'dex:read',
      'insight:read',
      'sites:read',
      'peercache:read',
      'reports:read',
      'reports:export',
      'integrations:read',
      'admin:audit',
      'licensing:read',
      'diagnostics:read',
    ],
    true,
  ],
  [
    'role-readonly',
    'Read-only',
    [
      'devices:read',
      'groups:read',
      'patches:read',
      'software:read',
      'deployments:read',
      'vulns:read',
      'profiles:read',
      'dex:read',
      'sites:read',
      'peercache:read',
      'reports:read',
    ],
    true,
  ],
  [
    'role-zone-jaipur',
    'Jaipur Branch Operator',
    [
      'devices:read',
      'devices:action',
      'patches:read',
      'patches:deploy',
      'liveops:read',
      'liveops:run',
      'deployments:read',
    ],
    false,
  ],
];

function seedUsersAndRoles(db: Db, rng: Rng): void {
  const insertRole = db.prepare(
    `INSERT INTO roles (id,name,permissions,system,zone_ids,user_count) VALUES (?,?,?,?,?,?)`,
  );
  const insertUser = db.prepare(
    `INSERT INTO users (id,email,name,role,zone_ids,status,last_sign_in_at,created_at) VALUES (?,?,?,?,?,?,?,?)`,
  );

  const users: readonly (readonly [string, string, string, string, string[]])[] = [
    ['usr-001', 'rohan.deshpande@example.co.in', 'Rohan Deshpande', 'Super Admin', []],
    ['usr-002', 'ananya.iyer@example.co.in', 'Ananya Iyer', 'Admin', []],
    ['usr-003', 'siddharth.kulkarni@example.co.in', 'Siddharth Kulkarni', 'Operator', []],
    ['usr-004', 'neha.banerjee@example.co.in', 'Neha Banerjee', 'Operator', []],
    ['usr-005', 'kavya.chandrasekar@example.co.in', 'Kavya Chandrasekar', 'Auditor', []],
    ['usr-006', 'imran.shaikh@example.co.in', 'Imran Shaikh', 'Read-only', []],
    ['usr-007', 'divya.nair@example.co.in', 'Divya Nair', 'Jaipur Branch Operator', ['zn-jai-br']],
    ['usr-008', 'vikram.rao@example.co.in', 'Vikram Rao', 'Admin', []],
  ];

  db.transaction(() => {
    for (const [id, name, permissions, system] of ROLES) {
      insertRole.run(
        id,
        name,
        JSON.stringify(permissions),
        system ? 1 : 0,
        JSON.stringify(name === 'Jaipur Branch Operator' ? ['zn-jai-br'] : []),
        users.filter((u) => u[3] === name).length,
      );
    }
    for (const [id, email, name, role, zoneIds] of users) {
      insertUser.run(
        id,
        email,
        name,
        role,
        JSON.stringify(zoneIds),
        id === 'usr-008' ? 'disabled' : 'active',
        id === 'usr-008' ? daysAgo(96) : iso(rng.recentMs(NOW, 10)),
        daysAgo(rng.int(120, 1100)),
      );
    }
  })();
}

function seedTokens(db: Db, rng: Rng): void {
  const insertToken = db.prepare(
    `INSERT INTO api_tokens (id,name,token_hash,prefix,scopes,created_at,created_by,last_used_at,expires_at,revoked_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const tokens: readonly (readonly [string, string[]])[] = [
    ['ci-patch-reporting', ['reports:read', 'patches:read']],
    ['servicenow-sync', ['devices:read', 'deployments:read']],
    ['grafana-metrics', ['diagnostics:read']],
    ['offboarding-automation', ['devices:read', 'devices:action']],
    ['legacy-inventory-export', ['devices:read']],
  ];

  db.transaction(() => {
    tokens.forEach(([name, scopes], i) => {
      // Only the hash is stored. The secret itself exists once, at creation.
      const secret = `aeg_${randomUUID().replace(/-/g, '')}`;
      insertToken.run(
        `tok-${String(700 + i)}`,
        name,
        createHash('sha256').update(secret).digest('hex'),
        secret.slice(0, 11),
        JSON.stringify(scopes),
        daysAgo(rng.int(20, 600)),
        rng.pick(['r.deshpande', 'a.iyer']),
        i === 4 ? daysAgo(214) : iso(rng.recentMs(NOW, 3)),
        i === 4 ? daysAgo(30) : iso(NOW + rng.int(20, 300) * 86_400_000),
        i === 4 ? daysAgo(12) : null,
      );
    });
  })();

  const insertEnrol = db.prepare(`INSERT INTO enrollment_tokens
    (id,name,platform,zone_id,prefix,token_hash,uses,max_uses,expires_at,created_at,created_by,revoked_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    ZONES.slice(0, 5).forEach((zone, i) => {
      const secret = `enr_${randomUUID().replace(/-/g, '')}`;
      insertEnrol.run(
        `enr-${String(800 + i)}`,
        `${zone.name} — standard build`,
        rng.pick(['windows', 'linux', 'macos']),
        zone.id,
        secret.slice(0, 11),
        createHash('sha256').update(secret).digest('hex'),
        rng.int(4, 1840),
        rng.chance(0.5) ? 5000 : null,
        iso(NOW + rng.int(10, 180) * 86_400_000),
        daysAgo(rng.int(10, 400)),
        'r.deshpande',
        null,
      );
    });
  })();
}

function seedLicenses(db: Db, deviceCount: number): void {
  const insert = db.prepare(
    `INSERT INTO licenses (id,product,entitled,consumed,expires_at,support_tier) VALUES (?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    insert.run(
      'lic-core',
      'Aegis One — Endpoint Management',
      50_000,
      deviceCount,
      daysAgo(-214),
      'Premium 24x7',
    );
    insert.run(
      'lic-vuln',
      'Aegis One — Vulnerability Management',
      50_000,
      Math.round(deviceCount * 0.94),
      daysAgo(-214),
      'Premium 24x7',
    );
    insert.run(
      'lic-dex',
      'Aegis One — Digital Experience',
      20_000,
      Math.round(deviceCount * 0.31),
      daysAgo(-92),
      'Standard',
    );
    insert.run('lic-insight', 'AEGIS Insight', 50_000, deviceCount, daysAgo(-214), 'Premium 24x7');
  })();
}

function seedServiceHealth(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO service_health (id,component,status,latency_ms,message,checked_at) VALUES (?,?,?,?,?,?)`,
  );
  const components: readonly (readonly [string, string, string | null])[] = [
    ['Console API', 'healthy', null],
    ['Inventory ingest', 'healthy', null],
    ['Patch catalogue sync', 'healthy', null],
    ['Vulnerability feed', 'degraded', 'Last successful feed sync 3 hours ago.'],
    ['Jaipur Branch relay', 'degraded', 'Relay reachable but 41 minutes behind.'],
    ['Report generation', 'healthy', null],
    ['Notification delivery', 'healthy', null],
    ['Peer cache coordinator', 'healthy', null],
    ['Identity provider', 'healthy', null],
    ['Audit pipeline', 'healthy', null],
  ];
  db.transaction(() => {
    components.forEach(([component, status, message], i) => {
      insert.run(
        `svc-${i + 1}`,
        component,
        status,
        rng.int(8, 640),
        message,
        iso(NOW - rng.int(10_000, 300_000)),
      );
    });
  })();
}

function seedReports(db: Db): void {
  const insert = db.prepare(
    `INSERT INTO reports (id,name,category,description,schedule,last_run_at,owner,custom) VALUES (?,?,?,?,?,?,?,?)`,
  );
  const reports: readonly (readonly [string, string, string, string | null, number])[] = [
    [
      'Patch compliance by zone',
      'Compliance',
      'Installed, pending and failed patches for every Aegis Zone.',
      'Weekly, Monday 07:00',
      0,
    ],
    [
      'Critical vulnerabilities — exploited in the wild',
      'Security',
      'Open findings with a known exploit, by zone and owner.',
      'Daily 06:00',
      0,
    ],
    [
      'Unencrypted endpoints',
      'Security',
      'Endpoints without full-disk encryption, grouped by department.',
      null,
      0,
    ],
    [
      'Software licence position',
      'Inventory',
      'Installed counts against entitlement for licensed titles.',
      'Monthly, 1st 06:00',
      0,
    ],
    [
      'Agent version spread',
      'Operations',
      'Agent versions across the estate, oldest first.',
      null,
      0,
    ],
    [
      'Deployment success rate',
      'Operations',
      'Success, failure and skip rates for the last 30 days.',
      'Weekly, Friday 18:00',
      0,
    ],
    [
      'Endpoints not seen in 30 days',
      'Operations',
      'Devices with no check-in, with last known user and zone.',
      'Weekly, Monday 07:00',
      0,
    ],
    [
      'Configuration drift — CIS Windows 11',
      'Compliance',
      'Failing checks against the CIS Windows 11 benchmark.',
      null,
      0,
    ],
    [
      'DEX score by department',
      'Experience',
      'Digital experience scores, lowest departments first.',
      null,
      0,
    ],
    [
      'Finance laptops — full posture',
      'Compliance',
      'Custom: Finance department, all posture columns.',
      null,
      1,
    ],
    [
      'Jaipur remediation tracker',
      'Security',
      'Custom: Jaipur Branch open criticals with remediation owner.',
      'Daily 08:00',
      1,
    ],
  ];
  db.transaction(() => {
    reports.forEach(([name, category, description, schedule, custom], i) => {
      insert.run(
        `rep-${String(600 + i)}`,
        name,
        category,
        description,
        schedule,
        daysAgo(custom ? 1 : 3),
        'r.deshpande',
        custom,
      );
    });
  })();
}

function seedAuditLog(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO audit_log (id,at,actor,actor_role,action,object_type,object_id,outcome,ip,detail) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const actions: readonly (readonly [string, string])[] = [
    ['deployment.create', 'deployment'],
    ['deployment.cancel', 'deployment'],
    ['liveops.script.submit', 'live-job'],
    ['liveops.logs.collect', 'live-job'],
    ['device.retire', 'device'],
    ['group.update', 'group'],
    ['token.create', 'api-token'],
    ['token.revoke', 'api-token'],
    ['role.create', 'role'],
    ['user.disable', 'user'],
    ['report.export', 'report'],
    ['settings.update', 'settings'],
    ['auth.sign-in', 'session'],
    ['auth.mfa-failed', 'session'],
  ];
  const actors: readonly (readonly [string, string])[] = [
    ['r.deshpande', 'Super Admin'],
    ['a.iyer', 'Admin'],
    ['s.kulkarni', 'Operator'],
    ['n.banerjee', 'Operator'],
    ['k.chandrasekar', 'Auditor'],
  ];

  db.transaction(() => {
    for (let i = 0; i < 1200; i++) {
      const action = rng.pick(actions);
      const actor = rng.pick(actors);
      insert.run(
        `aud-${String(100000 + i)}`,
        iso(rng.recentMs(NOW, 90)),
        actor[0],
        actor[1],
        action[0],
        action[1],
        `${action[1].slice(0, 3)}-${rng.int(1000, 9999)}`,
        rng.weighted([
          ['success', 92],
          ['denied', 6],
          ['error', 2],
        ] as const),
        `10.${rng.int(20, 32)}.${rng.int(0, 254)}.${rng.int(2, 254)}`,
        null,
      );
    }
  })();
}
