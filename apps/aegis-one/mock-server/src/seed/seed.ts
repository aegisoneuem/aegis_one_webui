import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
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
  seedPatchPolicies(db);
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

/**
 * The silent switches each installer kind takes.
 *
 * These are the vendors' own documented switches, not invented ones: an MSI
 * takes /qn, an Inno Setup package /VERYSILENT, NSIS /S. The kind is chosen
 * from the package's own id so the same title always gets the same pair.
 */
const INSTALLER_KINDS: readonly (readonly [string, string, string])[] = [
  ['msi', 'msiexec /i "{package}" /qn /norestart', 'msiexec /x "{product}" /qn /norestart'],
  ['inno', '"{package}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '"{uninstaller}" /VERYSILENT'],
  ['nsis', '"{package}" /S', '"{uninstaller}" /S'],
];

function seedSoftware(db: Db): void {
  const insert = db.prepare(
    `INSERT INTO software (id,title,publisher,category,latest_version,size_mb,
                           platform,logo_url,installer,installer_sha256,state,
                           silent_install,silent_uninstall)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    for (const s of SOFTWARE) {
      /*
       * Most of the catalogue is ready to deploy and a minority is still
       * being prepared. The reference's own fixture has every package in
       * draft with no installer, which leaves three of its five counters
       * reading the same number; a mix exercises the card's two states.
       */
      // Decided from the package's own id rather than the shared random
      // stream: drawing here would shift every value seeded after it.
      const ready = Math.abs(hashOf(`${s.id}:ready`)) % 100 < 68;
      const kind = INSTALLER_KINDS[Math.abs(hashOf(s.id)) % INSTALLER_KINDS.length];
      insert.run(
        s.id,
        s.title,
        s.publisher,
        s.category,
        s.latestVersion,
        s.sizeMb,
        // The catalogue is the Windows estate's, as the reference's is.
        'windows',
        // Icons are imported by an administrator, not shipped with the
        // catalogue, so every package starts without one.
        null,
        ready ? 'added' : 'missing',
        ready ? createHash('sha256').update(`${s.id}@${s.latestVersion}`).digest('hex') : null,
        ready ? 'published' : 'draft',
        kind?.[1] ?? '',
        kind?.[2] ?? '',
      );
    }
  })();
}

/** A stable small integer from a string, for choices that must not drift. */
function hashOf(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

interface PatchRow {
  id: string;
  platform: string;
  severity: string;
  category: string;
}

/** The months the update catalogue spans, newest first. */
const PATCH_MONTHS = [
  '2026-10',
  '2026-09',
  '2026-08',
  '2026-07',
  '2026-06',
  '2026-05',
  '2026-04',
  '2026-03',
] as const;

/** Roughly where in the month an update lands, so the ages spread realistically. */
const MONTH_DAYS = [6, 36, 67, 97, 128, 158, 189, 219] as const;

interface Series {
  /** The title for a given month label, e.g. "2026-10 Cumulative Update for …". */
  title: (month: string) => string;
  /** The reference for the newest entry; older ones count down from it. */
  kb: number;
  platform: string;
  severity: string;
  category: string;
  source: string;
  /** How many months of history the series carries. */
  months: number;
  rebootRequired: boolean;
}

/**
 * Windows cumulative updates, one series per servicing branch.
 *
 * Each month supersedes the one before it, which is what gives the catalogue
 * its Superseded count and lets the Approval column say "Superseded by KB…"
 * rather than leaving the state unexplained.
 */
const WINDOWS_LINES: readonly (readonly [string, number])[] = [
  ['Windows 11 Version 24H2 for x64-based Systems', 5_034_020],
  ['Windows 11 Version 23H2 for x64-based Systems', 5_034_050],
  ['Microsoft Server Operating System Version 21H2 (Server 2022)', 5_034_105],
  ['Windows Server 2019 for x64-based Systems', 5_034_137],
  ['Windows Server 2016 for x64-based Systems', 5_034_169],
  ['Windows 10 Version 22H2 for x64-based Systems', 5_034_201],
];

const OS_SERIES: readonly Series[] = [
  ...WINDOWS_LINES.map(([label, kb]) => ({
    title: (month: string) => `${month} Cumulative Update for ${label}`,
    kb,
    platform: 'windows',
    severity: 'critical',
    category: 'os',
    source: 'Microsoft Corporation',
    months: 8,
    rebootRequired: true,
  })),
  {
    title: (month) => `${month} Cumulative Update for .NET Framework 3.5 and 4.8.1`,
    kb: 5_034_233,
    platform: 'windows',
    severity: 'high',
    category: 'os',
    source: 'Microsoft Corporation',
    months: 8,
    rebootRequired: true,
  },
  {
    title: (month) => `${month} Servicing Stack Update for Windows`,
    kb: 5_034_265,
    platform: 'windows',
    severity: 'high',
    category: 'os',
    source: 'Microsoft Corporation',
    months: 6,
    rebootRequired: false,
  },
  {
    title: (month) => `Microsoft Defender Antivirus platform update (${month})`,
    kb: 5_034_297,
    platform: 'windows',
    severity: 'medium',
    category: 'os',
    source: 'Microsoft Corporation',
    months: 8,
    rebootRequired: false,
  },
  {
    title: (month) => `Windows Malicious Software Removal Tool x64 (${month})`,
    kb: 5_034_329,
    platform: 'windows',
    severity: 'low',
    category: 'os',
    source: 'Microsoft Corporation',
    months: 8,
    rebootRequired: false,
  },
];

/** macOS and Linux ship point releases and advisories rather than monthly rollups. */
const MAC_RELEASES: readonly (readonly [string, string, string, number])[] = [
  ['VRF-125', 'macOS 15.7', 'critical', 0],
  ['VRF-126', 'macOS 15.6.1', 'high', 1],
  ['VRF-127', 'macOS 15.6', 'high', 2],
  ['VRF-128', 'macOS 15.5', 'medium', 3],
  ['VRF-129', 'macOS 14.7.6 (Sonoma)', 'high', 1],
  ['VRF-130', 'macOS 14.7.5 (Sonoma)', 'medium', 3],
  ['VRF-131', 'Safari 18.6 security update', 'high', 2],
  ['VRF-132', 'Xcode Command Line Tools 16.4', 'low', 4],
];

const LINUX_RELEASES: readonly (readonly [string, string, string, string, number])[] = [
  ['USN-7860-1', 'sudo security update (USN-7860-1)', 'critical', 'Canonical', 0],
  [
    'RHSA-2026:8842',
    'Red Hat Enterprise Linux security update (RHSA-2026:8842)',
    'critical',
    'Red Hat',
    0,
  ],
  [
    'RHSA-2026:8810',
    'Red Hat Enterprise Linux security update (RHSA-2026:8810)',
    'high',
    'Red Hat',
    1,
  ],
  ['USN-7849-1', 'Linux Kernel security update (USN-7849-1)', 'high', 'Canonical', 1],
  [
    'RHSA-2026:7711',
    'Red Hat Enterprise Linux security update (RHSA-2026:7711)',
    'medium',
    'Red Hat',
    2,
  ],
  ['USN-7855-1', 'OpenSSL security update (USN-7855-1)', 'medium', 'Canonical', 2],
  ['USN-7788-1', 'Linux Kernel security update (USN-7788-1)', 'critical', 'Canonical', 3],
  ['RHSA-2026:7520', 'openssl security update (RHSA-2026:7520)', 'high', 'Red Hat', 3],
  ['USN-7122-1', 'Linux kernel vulnerabilities (USN-7122-1)', 'high', 'Canonical', 4],
  ['USN-7098-2', 'curl vulnerability (USN-7098-2)', 'medium', 'Canonical', 5],
];

/** Firmware is published per hardware model, so it is its own small catalogue. */
const FIRMWARE: readonly (readonly [string, string, string, string, string, number])[] = [
  ['DELL-BIOS-1.22.0', 'Dell Latitude 5440 BIOS 1.22.0', 'critical', 'bios', 'Dell', 0],
  ['DELL-BIOS-1.28.0', 'Dell Latitude 5450 System BIOS 1.28.0', 'high', 'bios', 'Dell', 1],
  ['LEN-BIOS-N3VET48W', 'ThinkPad T14 Gen 5 BIOS N3VET48W', 'medium', 'bios', 'Lenovo', 2],
  ['INTEL-NIC-29.1', 'Intel Ethernet Adapter driver 29.1', 'medium', 'driver', 'Intel', 1],
  ['INTEL-GFX-31.0', 'Intel Arc and Iris Xe graphics driver 31.0', 'low', 'driver', 'Intel', 2],
  [
    'REALTEK-AUD-6.0',
    'Realtek High Definition Audio driver 6.0.9666',
    'low',
    'driver',
    'Realtek',
    3,
  ],
];

/**
 * How an update is approved, by what it is.
 *
 * OS updates come through the monthly policy already approved; third-party
 * updates sit in review until someone looks at them; a couple are declined
 * outright. The rings follow the policies the same seed writes.
 */
const APPROVAL_BY_CATEGORY: Record<string, string> = {
  os: 'approved',
  'third-party': 'review',
  'driver-bios': 'review',
};

/** The two CVEs the fixture marks as exploited before the fix shipped. */
const ZERO_DAY_KBS = new Set(['USN-7860-1', 'VRF-125']);

function seedPatches(db: Db, rng: Rng): PatchRow[] {
  const rows: PatchRow[] = [];
  const insert = db.prepare(
    `INSERT INTO patches (id,title,kb,platform,severity,category,subcategory,source,approval,superseded_by,ring,zero_day,released_at,reboot_required)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  const idOf = (kb: string): string => `pt-${kb.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const ring = (): string =>
    rng.weighted([
      ['late', 70],
      ['broad', 20],
      ['pilot', 10],
    ] as const);

  /**
   * Writes one update. `current` decides whether endpoints are evaluated
   * against it: a superseded update stays in the catalogue, but no device is
   * still waiting for it, so it draws no device_patches rows.
   */
  const write = (
    kb: string,
    title: string,
    platform: string,
    severity: string,
    category: string,
    subcategory: string,
    source: string,
    approval: string,
    supersededBy: string | null,
    releasedDaysAgo: number,
    rebootRequired: boolean,
    current: boolean,
  ): void => {
    const id = idOf(kb);
    insert.run(
      id,
      title,
      kb,
      platform,
      severity,
      category,
      subcategory,
      source,
      approval,
      supersededBy,
      ring(),
      ZERO_DAY_KBS.has(kb) ? 1 : 0,
      daysAgo(releasedDaysAgo),
      rebootRequired ? 1 : 0,
    );
    if (current) rows.push({ id, platform, severity, category });
  };

  db.transaction(() => {
    for (const series of OS_SERIES) {
      for (let m = 0; m < series.months; m += 1) {
        const month = PATCH_MONTHS[m] ?? PATCH_MONTHS[PATCH_MONTHS.length - 1] ?? '2026-03';
        const kb = `KB${series.kb - m}`;
        const newer = `KB${series.kb - m + 1}`;
        write(
          kb,
          series.title(month),
          series.platform,
          series.severity,
          series.category,
          '',
          series.source,
          m === 0 ? 'approved' : 'superseded',
          m === 0 ? null : newer,
          MONTH_DAYS[m] ?? 219,
          series.rebootRequired,
          m === 0,
        );
      }
    }

    for (const [kb, title, severity, monthIndex] of MAC_RELEASES) {
      write(
        kb,
        title,
        'macos',
        severity,
        'os',
        '',
        'Apple Inc.',
        monthIndex === 0 ? 'approved' : 'superseded',
        monthIndex === 0 ? null : 'VRF-125',
        MONTH_DAYS[monthIndex] ?? 219,
        true,
        monthIndex <= 1,
      );
    }

    for (const [kb, title, severity, source, monthIndex] of LINUX_RELEASES) {
      write(
        kb,
        title,
        'linux',
        severity,
        'os',
        '',
        source,
        'approved',
        null,
        MONTH_DAYS[monthIndex] ?? 219,
        true,
        monthIndex <= 2,
      );
    }

    /*
     * Third-party updates: the newest version of every catalogue title, plus
     * the two it replaced. The publisher is the software's own, so the Vendor
     * filter lists real publishers rather than one invented name.
     */
    for (const [index, s] of SOFTWARE.entries()) {
      for (let back = 0; back < 3; back += 1) {
        const version = back === 0 ? s.latestVersion : agePatchVersion(s.latestVersion, rng);
        const kb = `VRF-${200 + index * 3 + back}`;
        write(
          kb,
          `${s.title} ${version}`,
          index % 3 === 0 ? 'windows' : index % 3 === 1 ? 'macos' : 'linux',
          back === 0 ? (index % 4 === 0 ? 'critical' : 'high') : 'medium',
          'third-party',
          '',
          s.publisher,
          back === 0 ? (APPROVAL_BY_CATEGORY['third-party'] ?? 'review') : 'superseded',
          back === 0 ? null : `VRF-${200 + index * 3}`,
          MONTH_DAYS[back] ?? 219,
          false,
          back === 0,
        );
      }
    }

    // Two titles are held back deliberately, so the Declined count is a
    // decision in the fixture rather than an empty column.
    for (const kb of ['VRF-200', 'VRF-203']) {
      db.prepare(`UPDATE patches SET approval = 'declined' WHERE id = ?`).run(idOf(kb));
    }

    for (const [kb, title, severity, subcategory, source, monthIndex] of FIRMWARE) {
      write(
        kb,
        title,
        'windows',
        severity,
        'driver-bios',
        subcategory,
        source,
        APPROVAL_BY_CATEGORY['driver-bios'] ?? 'review',
        null,
        MONTH_DAYS[monthIndex] ?? 219,
        true,
        true,
      );
    }
  })();

  return rows;
}

/**
 * The patch policies the Patch Policies tab lists.
 *
 * `computers` and `compliance_pct` are filled in after the devices exist, so
 * the figures agree with the estate rather than being written twice.
 */
function seedPatchPolicies(db: Db): void {
  const insert = db.prepare(
    `INSERT INTO patch_policies (id,name,content,patch_count,rollout,computers,compliance_pct,schedule,next_run_at,status)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const policies: readonly (readonly [
    string,
    string,
    string,
    string,
    string,
    string | null,
    string,
  ])[] = [
    [
      'pp-windows-monthly',
      'Windows Monthly Security',
      'OS · Critical/High',
      'pilot,broad,late',
      'Windows · Patch Tuesday + 1 day · 22:00 device time · in maintenance window',
      '2026-11-11T16:30:00.000Z',
      'active',
    ],
    [
      'pp-browsers',
      'Browsers – All OS',
      'Browser · Critical/High/Medium/Low',
      'broad',
      'Any OS · Daily · 12:00 device time',
      '2026-12-12T06:30:00.000Z',
      'active',
    ],
    [
      'pp-third-party',
      'Third-Party Apps Weekly',
      'Third-party · Critical/High/Medium',
      'broad',
      'Any OS · Every Wed · 13:00 device time',
      null,
      'suspended',
    ],
  ];

  db.transaction(() => {
    for (const [id, name, content, rollout, schedule, nextRun, status] of policies)
      insert.run(id, name, content, 0, rollout, 0, 0, schedule, nextRun, status);
  })();
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

/**
 * Patch lag by operating system, as a multiplier on the outstanding rate.
 * First match wins, so the more specific patterns come first.
 */
const PATCH_LAG: readonly (readonly [RegExp, number])[] = [
  [/Windows Server 2016/, 5],
  [/Windows Server 2019/, 3.5],
  [/Windows Server 2022/, 2.5],
  [/Windows 10/, 4],
  [/Windows 11 Enterprise 23H2/, 2],
  [/Red Hat/, 3],
  [/Ubuntu 20\.04/, 4.5],
  [/Ubuntu/, 2],
  [/Ventura|Monterey/, 3.5],
  [/macOS|Sonoma/, 1.8],
  [/AIX/, 6],
];

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
    primary_user,primary_user_name,department,ip,mac,dns_name,dns_server,architecture,manufacturer,last_boot_at,
    serial,model,cpu,ram_gb,disk_total_gb,disk_free_pct,
    agent_version,last_seen_at,enrolled_at,compliance_pct,pending_patches,critical_vulns,dex_score,
    encrypted,antivirus_ok,firewall_ok,reboot_pending,config_pass_pct
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

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
      // Hoisted out of the insert's argument list: manufacturer and
      // architecture are both read off it.
      const model = isServer ? rng.pick(SERVER_MODELS) : rng.pick(WORKSTATION_MODELS);

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

      /*
       * How far behind this OS runs. An estate does not patch uniformly:
       * servers wait for a change window, the older desktop builds are the
       * ones nobody has got to yet, and the current build is the one the
       * monthly policy actually reaches. Without this every OS version reads
       * the same percentage and the Compliance by OS Version chart says
       * nothing.
       */
      const lag = PATCH_LAG.find(([p]) => p.test(`${os.name} ${os.version}`))?.[1] ?? 1;

      for (const p of patches) {
        // Firmware is published per hardware model, so it reaches workstations
        // only; everything else follows the platform the update is built for.
        const family = os.family.startsWith('Windows')
          ? 'windows'
          : os.family === 'macOS'
            ? 'macos'
            : os.family === 'Linux'
              ? 'linux'
              : 'aix';
        const applicable = p.platform === family && (p.category !== 'driver-bios' || !isServer);
        if (!applicable || !rng.chance(0.45)) continue;

        /*
         * Per applicable patch, not per device. A device draws roughly
         * fourteen of these, so a 14% pending rate would leave only one
         * endpoint in twenty fully patched — which contradicts the ~90% mean
         * compliance the same seed gives each device. These rates put the
         * estate near 55% fully patched, which is what a managed fleet with
         * monthly patch windows actually looks like.
         */
        const state = rng.weighted([
          ['installed', 880],
          ['pending', 35 * lag],
          ['failed', 8 * lag],
          ['not-applicable', 77],
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
        `${hostname.toLowerCase()}.corp.aegis.example`,
        // Each zone resolves against its own relay.
        `10.${20 + (ZONES.indexOf(zone) % 12)}.0.10`,
        model.startsWith('Apple') ? 'arm64' : model.startsWith('IBM') ? 'ppc64le' : 'x86_64',
        // Every catalogue model is "<Manufacturer> <line> <number>", so the
        // manufacturer is the first token rather than a second invented list.
        model.split(' ')[0] ?? '',
        // A reboot cannot be more recent than the last check-in.
        iso(Math.min(lastSeen, NOW - rng.int(3_600_000, 60 * 86_400_000))),
        `SN${String(4_810_000 + i * 13)}`,
        model,
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
        // Antivirus is near-universal on Windows and macOS and rarer on the
        // Linux and AIX estate, where the control is usually a different
        // product; the firewall is on almost everywhere but servers, which are
        // more often fronted by a network appliance instead.
        os.family === 'Linux' || os.family === 'AIX'
          ? rng.chance(0.55)
            ? 1
            : 0
          : rng.chance(0.89)
            ? 1
            : 0,
        rng.chance(isServer ? 0.82 : 0.96) ? 1 : 0,
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

    /*
     * applicable_count stays "endpoints this update was evaluated against".
     * missing_count is the narrower figure the grid's Applicable column means:
     * endpoints it applies to and has not reached yet. A superseded update has
     * no device_patches rows at all, so both land on zero — the fixture has no
     * record of installs that happened before it was replaced.
     */
    UPDATE patches SET
      applicable_count = (SELECT COUNT(*) FROM device_patches WHERE device_patches.patch_id = patches.id),
      missing_count = (SELECT COUNT(*) FROM device_patches WHERE device_patches.patch_id = patches.id AND state IN ('pending', 'failed')),
      installed_count = (SELECT COUNT(*) FROM device_patches WHERE device_patches.patch_id = patches.id AND state = 'installed'),
      failed_count = (SELECT COUNT(*) FROM device_patches WHERE device_patches.patch_id = patches.id AND state = 'failed');

    /* Policy coverage, once the estate exists. */
    UPDATE patch_policies SET
      patch_count = (SELECT COUNT(*) FROM patches WHERE patches.approval <> 'superseded'
                       AND (patch_policies.id <> 'pp-windows-monthly' OR patches.platform = 'windows')
                       AND (patch_policies.id <> 'pp-third-party' OR patches.category = 'third-party')),
      computers = (SELECT COUNT(*) FROM devices
                     WHERE patch_policies.id <> 'pp-windows-monthly' OR devices.os_family LIKE 'Windows%'),
      compliance_pct = (SELECT CAST(ROUND(100.0 * SUM(pending_patches = 0) / COUNT(*)) AS INTEGER) FROM devices
                     WHERE patch_policies.id <> 'pp-windows-monthly' OR devices.os_family LIKE 'Windows%');

    UPDATE vulnerabilities SET
      affected_count = (SELECT COUNT(*) FROM device_vulnerabilities WHERE device_vulnerabilities.vulnerability_id = vulnerabilities.id AND state = 'open'),
      remediated_count = (SELECT COUNT(*) FROM device_vulnerabilities WHERE device_vulnerabilities.vulnerability_id = vulnerabilities.id AND state = 'remediated');
  `);

  rollUpPatchCells(db);
}

/**
 * Pre-computes the Patch Management aggregates.
 *
 * Grouping the device/patch join on request cost seconds, because it is half
 * a million rows and the page wants it sliced five ways. Nothing writes to
 * device_patches at runtime, so it is sliced once here instead.
 *
 * Ages are measured against the seed's own clock rather than the wall clock,
 * which is also what makes a screenshot of the age chart reproducible.
 */
function rollUpPatchCells(db: Db): void {
  const today = NOW / 86_400_000 + 2_440_587.5;
  const OPEN = `dp.state IN ('pending', 'failed')`;
  const AGE = `(${today} - julianday(p.released_at))`;
  const TAB = `CASE WHEN p.category IN ('third-party', 'driver-bios') THEN p.category ELSE p.platform END`;
  const JOIN = `FROM device_patches dp
                JOIN devices d ON d.id = dp.device_id
                JOIN patches p ON p.id = dp.patch_id`;
  const BUCKETS = [
    [0, 7],
    [8, 14],
    [15, 30],
    [31, 60],
    [61, 100_000],
  ];

  db.exec(`
    INSERT INTO patch_cells
    SELECT d.zone_id,
           d.os_name || ' ' || d.os_version,
           LOWER(REPLACE(d.os_family, ' Server', '')),
           ${TAB},
           p.source,
           p.severity,
           dp.state,
           COUNT(*),
           SUM(CASE WHEN ${OPEN} THEN ${AGE} ELSE 0 END),
           ${BUCKETS.map(([from, to]) => `SUM(${OPEN} AND ${AGE} BETWEEN ${from} AND ${to})`).join(
             ',\n           ',
           )}
    ${JOIN}
    GROUP BY 1, 2, 3, 4, 5, 6, 7;

    /* Endpoints with anything outstanding, and of those the ones with a critical. */
    INSERT INTO patch_device_counts
    SELECT zone_id, 'all', '', COUNT(*), SUM(crit > 0), 0 FROM (
      SELECT d.zone_id AS zone_id, dp.device_id, SUM(p.severity = 'critical') AS crit
      ${JOIN} WHERE ${OPEN} GROUP BY d.zone_id, dp.device_id)
    GROUP BY zone_id;

    INSERT INTO patch_device_counts
    SELECT d.zone_id, 'tab', ${TAB},
           COUNT(DISTINCT dp.device_id), 0,
           COUNT(DISTINCT CASE WHEN p.severity = 'critical' THEN p.id END)
    ${JOIN} WHERE ${OPEN} GROUP BY d.zone_id, ${TAB};

    INSERT INTO patch_device_counts
    SELECT d.zone_id, 'source', p.source,
           COUNT(DISTINCT dp.device_id), 0, COUNT(DISTINCT p.id)
    ${JOIN} WHERE ${OPEN} GROUP BY d.zone_id, p.source;

    ANALYZE;
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
    ['Google Chrome 142.0 — broad ring', 'install-software', 'Google Chrome 142.0.7204.92'],
    ['October security rollup — pilot', 'deploy-patches', 'KB5034020'],
    ['October security rollup — broad', 'deploy-patches', 'KB5034020'],
    ['CrowdStrike sensor 7.20 upgrade', 'update-software', 'CrowdStrike Falcon Sensor 7.20.19507'],
    ['Remove TeamViewer from Finance', 'uninstall-software', 'TeamViewer 15.58.4'],
    ['Disk cleanup script — low disk group', 'collect-logs', 'cleanup-temp.ps1'],
    ['RHEL 9 kernel update', 'deploy-patches', 'RHSA-2026:8842'],
    ['macOS Sequoia 15.1', 'update-software', 'macOS Sequoia 15.1'],
    ['Adobe Acrobat Reader 24.4', 'install-software', 'Adobe Acrobat Reader 24.4.20272'],
    ['BIOS 1.28.0 — Latitude 5450', 'deploy-patches', 'DELL-BIOS-1.28.0'],
    ['Netskope client rollout — Bengaluru', 'install-software', 'Netskope Client 120.0.1'],
    ['Java 21.0.5 upgrade', 'update-software', 'Oracle Java SE Runtime 21.0.5'],
    ['Zoom Workplace 6.2.11', 'install-software', 'Zoom Workplace 6.2.11'],
    ['Collect firewall state — all servers', 'collect-logs', 'get-firewall-state.ps1'],
    ['SAP GUI 8.00 PL12', 'install-software', 'SAP GUI for Windows 8.00 PL12'],
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
        ['paused', 6],
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
        status === 'completed' || status === 'paused'
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

/**
 * The built-in roles, read straight out of the contract's `x-roles` table.
 *
 * This used to be a second copy maintained by hand, and it drifted: the seeded
 * Auditor was missing `overview:read` and used names the API never checks, so
 * a perfectly valid auditor got 403 on the landing page. One table, one
 * source.
 */
function contractRoles(): { id: string; name: string; permissions: string[]; system: boolean }[] {
  const contractPath = resolve(here, '../../../../../contracts/aegis-one.openapi.yaml');
  const doc = parse(readFileSync(contractPath, 'utf8')) as {
    'x-roles'?: Record<string, string[] | string>;
  };
  const table = doc['x-roles'] ?? {};

  return Object.entries(table)
    .filter(([name, permissions]) => name !== 'description' && Array.isArray(permissions))
    .map(([name, permissions]) => ({
      id: `role-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      permissions: permissions as string[],
      system: true,
    }));
}

/** One scoped role beyond the built-ins, to exercise zone restriction. */
const SCOPED_ROLE = {
  id: 'role-zone-jaipur',
  name: 'Jaipur Branch Operator',
  permissions: [
    'overview:read',
    'devices:read',
    'devices:action',
    'patches:read',
    'patches:deploy',
    'liveops:read',
    'liveops:run',
    'deployments:read',
  ],
  system: false,
};

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

  const roles = [...contractRoles(), SCOPED_ROLE];

  db.transaction(() => {
    for (const role of roles) {
      insertRole.run(
        role.id,
        role.name,
        JSON.stringify(role.permissions),
        role.system ? 1 : 0,
        JSON.stringify(role.name === 'Jaipur Branch Operator' ? ['zn-jai-br'] : []),
        users.filter((u) => u[3] === role.name).length,
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
