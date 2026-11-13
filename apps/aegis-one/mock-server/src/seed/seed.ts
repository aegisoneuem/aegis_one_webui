import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, openDb, type Db, type Rng } from '@aegis/mock-core';
import {
  AGENT_VERSIONS,
  CVES,
  DEPARTMENTS,
  FIRST_NAMES,
  LAST_NAMES,
  OPERATING_SYSTEMS,
  SERVER_MODELS,
  SOFTWARE,
  WORKSTATION_MODELS,
  ZONES,
  type CveDef,
} from './catalog';
import {
  ALERT_RULES,
  CONNECTORS,
  EVENT_NAMES,
  EVENT_TYPES,
  NOTIFICATION_CHANNELS,
  SIEM_DESTINATIONS,
} from './integration-catalog';
import { CONFIG_CHECKS } from './config-catalog';

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
/*
 * The fixture's "now" is the moment the seed ran.
 *
 * It used to be frozen at 2026-11-01T09:30:00+05:30, which made the database
 * byte-for-byte reproducible. The cost was that every relative timestamp in
 * the console decayed: `relative()` falls back to an absolute date past seven
 * days, so a week after seeding, every "2 min ago" and "Just Now" the
 * approved design prints read as "01 Nov 2026" instead. On Peer Cache it was
 * worse than cosmetic — staleness judged against the wall clock reported
 * every cache in the estate as stale.
 *
 * So the clock follows the run. Everything is still derived from this one
 * constant, so the *shape* of the data is unchanged and reproducible for a
 * given seed; only its absolute position on the calendar moves. Anything that
 * needs the old behaviour can pin it with AEGIS_SEED_NOW.
 */
const NOW = process.env['AEGIS_SEED_NOW'] ? Date.parse(process.env['AEGIS_SEED_NOW']) : Date.now();

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
  rollUpDex(db);
  rollUpInventory(db);
  rollUpEntitlements(db);
  seedGroups(db, rng);
  seedConfiguration(db);
  seedDeployments(db, rng);
  seedLiveJobs(db, rng);
  seedLogBundles(db, rng);
  seedLogSettings(db);
  seedScans(db, rng);
  seedPeers(db, rng);
  rollUpDelivery(db);
  seedInsightTemplates(db);
  seedIntegrations(db);
  seedUsersAndRoles(db, rng);
  seedIdentityProviders(db);
  seedTokens(db, rng);
  seedPatchSettings(db);
  seedLicenses(db, deviceStats.total);
  seedServiceHealth(db, rng);
  seedReports(db);
  seedUsbEvents(db, rng);
  seedAuditLog(db, rng);
  onProgress('operational data');

  /*
   * Last, so every index exists and every table is full when the statistics
   * are taken. Without them SQLite guesses, and on this data it guesses
   * badly: the Installed Software rows query drove `software` as the outer
   * table and sorted 630,281 joined rows in a temp B-tree, 4.6 seconds for
   * ten rows. With statistics it walks the hostname index and stops after
   * ten, in under a millisecond.
   *
   * There are ANALYZE calls inside the roll-ups too; those are for the
   * queries each one is about to run. This is the one that matters for a
   * freshly seeded database.
   */
  db.exec('ANALYZE');
  onProgress('statistics');

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

/**
 * How long a finding of each severity may stay open before it is overdue.
 * The Vulnerabilities page reports SLA state everywhere, so the due date is
 * computed once here rather than in each query that reads it back.
 */
const SLA_DAYS: Record<CveDef['severity'], number> = {
  critical: 30,
  high: 60,
  medium: 120,
  low: 180,
};

/**
 * The remediation projects, and the findings each one owns. A finding belongs
 * to at most one project, which is why the link is a column on the finding
 * rather than a join table.
 */
const VULN_PROJECTS: readonly {
  id: string;
  name: string;
  owner: string;
  dueInDays: number;
  progressPct: number;
  cves: readonly string[];
}[] = [
  {
    id: 'vp-win-cumulative',
    name: 'Windows cumulative update rollout',
    owner: 'Meera Subramanian',
    dueInDays: 10,
    progressPct: 62,
    cves: ['CVE-2026-20881', 'CVE-2026-20644', 'CVE-2026-14205'],
  },
  {
    id: 'vp-browser-hardening',
    name: 'Browser hardening',
    owner: 'Aarav Sharma',
    dueInDays: 20,
    progressPct: 35,
    cves: ['CVE-2026-19902', 'CVE-2026-17760'],
  },
];

/**
 * Risks somebody signed off rather than fixed. They stay in the grid under
 * the State filter, with the reason, because an accepted risk that disappears
 * is an accepted risk nobody reviews again.
 */
const ACCEPTED_RISKS: Record<string, string> = {
  'CVE-2026-12980':
    'Denial of service only, on a player that is not business-critical. Removed at the next desktop image refresh.',
};

function seedVulnerabilities(db: Db): void {
  const insertProject = db.prepare(
    `INSERT INTO vuln_projects (id,name,owner,due,progress_pct) VALUES (?,?,?,?,?)`,
  );
  const insert = db.prepare(
    `INSERT INTO vulnerabilities (
       id,title,severity,cvss,priority,exploited,published_at,affects,fixed_by,
       check_id,family,solution,fix_type,threats,detection,confidence,port,
       first_detected_at,last_detected_at,sla_due_at,project_id,accepted_reason
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const projectOf = new Map<string, string>();
  for (const project of VULN_PROJECTS)
    for (const cve of project.cves) projectOf.set(cve, project.id);

  db.transaction(() => {
    for (const project of VULN_PROJECTS)
      insertProject.run(
        project.id,
        project.name,
        project.owner,
        iso(NOW + project.dueInDays * 86_400_000).slice(0, 10),
        project.progressPct,
      );

    for (const c of CVES) {
      // A finding is first detected when the estate was next scanned after
      // publication, not on the day the CVE was published.
      const firstDetected = NOW - Math.max(0, c.publishedDaysAgo - 2) * 86_400_000;
      insert.run(
        c.id,
        c.title,
        c.severity,
        c.cvss,
        c.priority,
        c.exploited ? 1 : 0,
        daysAgo(c.publishedDaysAgo),
        c.affects,
        c.fixedBy,
        c.checkId,
        c.family,
        c.solution,
        c.fixType,
        JSON.stringify(c.threats),
        c.detection,
        c.confidence,
        c.port,
        iso(firstDetected),
        iso(NOW - 3_600_000),
        iso(firstDetected + SLA_DAYS[c.severity] * 86_400_000),
        projectOf.get(c.id) ?? null,
        ACCEPTED_RISKS[c.id] ?? null,
      );
    }
  })();
}

/**
 * Scan history, as the Scans tab lists it: three that have run and one still
 * to come. The device figure is the estate the scan could actually reach.
 */
function seedScans(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO vuln_scans (id,name,template,scope,schedule,status,started_at,finished_at,
                             duration_label,devices_scanned,findings_opened,findings_fixed)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const reachable =
    (
      db.prepare(`SELECT COUNT(*) AS n FROM devices WHERE status <> 'offline'`).get() as
        { n: number } | undefined
    )?.n ?? 0;

  const rows: readonly (readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    number,
    number | null,
    string,
    number,
    number,
    number,
  ])[] = [
    [
      'scan-weekly-full',
      'Weekly full scan',
      'full-vulnerability',
      'All devices',
      'Weekly \u00b7 Friday 02:00',
      'completed',
      NOW - 3_600_000,
      NOW - 1_140_000,
      '41 min',
      reachable,
      3,
      2,
    ],
    [
      'scan-exploited-sweep',
      'Exploited CVE sweep',
      'critical-and-exploited-quick',
      'All devices',
      'Daily \u00b7 03:00',
      'completed',
      NOW - 26 * 3_600_000,
      NOW - 26 * 3_600_000 + 540_000,
      '9 min',
      reachable,
      1,
      0,
    ],
    [
      'scan-server-audit',
      'Server configuration audit',
      'configuration-audit',
      'Device group: Servers',
      'Monthly \u00b7 1st 01:00',
      'completed',
      NOW - 3 * 86_400_000,
      NOW - 3 * 86_400_000 + 1_020_000,
      '17 min',
      rng.int(400, 900),
      0,
      1,
    ],
    [
      'scan-discovery',
      'Network discovery',
      'discovery',
      'Zones: all',
      'Weekly \u00b7 Thursday 22:00',
      'queued',
      NOW + 2 * 86_400_000,
      null,
      '\u2014',
      0,
      0,
      0,
    ],
  ];

  db.transaction(() => {
    for (const r of rows)
      insert.run(
        r[0],
        r[1],
        r[2],
        r[3],
        r[4],
        r[5],
        iso(r[6]),
        r[7] === null ? null : iso(r[7]),
        r[8],
        r[9],
        r[10],
        r[11],
      );
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
        // Filled in by rollUpDex from the three measures it is made of.
        0,
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
/**
 * The experience score, exactly as the reference computes it.
 *
 * Start at 100, take the penalties off, then cap by band. The caps are what
 * make the score mean something: an endpoint with one measure in the red
 * cannot score well on the strength of the other three.
 */
const DEX_SCORE_SQL = `MAX(0, MIN(
    100
      - (CASE WHEN cpu_pct >= 90 THEN 20 WHEN cpu_pct >= 75 THEN 10 ELSE 0 END)
      - (CASE WHEN memory_pct >= 90 THEN 20 WHEN memory_pct >= 75 THEN 10 ELSE 0 END)
      - (CASE WHEN boot_seconds >= 90 THEN 20 WHEN boot_seconds >= 60 THEN 10 ELSE 0 END)
      - (CASE WHEN disk_free_pct <= 10 THEN 10 ELSE 0 END),
    CASE
      WHEN cpu_pct >= 90 OR memory_pct >= 90 OR boot_seconds >= 90 THEN 55
      WHEN cpu_pct >= 75 OR memory_pct >= 75 OR boot_seconds >= 60 THEN 80
      ELSE 100
    END))`;

/** The band the three measures put an endpoint in, as the reference defines it. */
export const DEX_BAND_SQL = `CASE
    WHEN cpu_pct >= 90 OR memory_pct >= 90 OR boot_seconds >= 90 THEN 'poor'
    WHEN cpu_pct >= 75 OR memory_pct >= 75 OR boot_seconds >= 60 THEN 'warning'
    ELSE 'good'
  END`;

/**
 * Fills in the three measures and derives the score from them.
 *
 * The measures are spread from the device's own row rather than drawn from
 * the seed's random stream, so adding them does not shift every figure seeded
 * after the estate — which is how the Deployments status mix once lost its
 * scheduled action.
 */
function rollUpDex(db: Db): void {
  // A multiplicative hash through a large prime. `rowid % n` on its own is
  // periodic — it put exactly 6% of the estate in every bucket and made the
  // three measures correlate — so each measure is mixed with its own salt.
  const mix = (salt: number): string => `((devices.rowid * 2654435761 + ${salt}) % 1000000007)`;
  const cpu = mix(97);
  const mem = mix(40503);
  const boot = mix(2246822519);

  db.exec(`
    UPDATE devices SET
      cpu_pct = CASE
        WHEN ${cpu} % 100 < 6 THEN 90 + (${cpu} / 100) % 10
        WHEN ${cpu} % 100 < 18 THEN 75 + (${cpu} / 100) % 15
        ELSE 12 + (${cpu} / 100) % 50 END,
      memory_pct = CASE
        WHEN ${mem} % 100 < 5 THEN 90 + (${mem} / 100) % 10
        WHEN ${mem} % 100 < 20 THEN 75 + (${mem} / 100) % 15
        ELSE 28 + (${mem} / 100) % 44 END,
      -- A server boots slower than a workstation, and both have a long tail.
      boot_seconds = CASE
        WHEN ${boot} % 100 < 4 THEN 90 + (${boot} / 100) % 45
        WHEN ${boot} % 100 < 16 THEN 60 + (${boot} / 100) % 30
        WHEN kind = 'server' THEN 32 + (${boot} / 100) % 24
        ELSE 16 + (${boot} / 100) % 26 END;

    UPDATE devices SET dex_score = ${DEX_SCORE_SQL};
  `);
}

/**
 * Fills in the inventory attributes the approved Reports grid offers as
 * columns — asset tag, chassis, BIOS, TPM, warranty, subnet and the rest.
 *
 * The reference synthesises all of these per device when it enriches a row.
 * They are derived here from the row's own values for the same reason the
 * experience measures are (D-042): drawing them would shift the seed's random
 * stream for everything seeded after the estate, and a report column with
 * nothing behind it is a column that cannot be exported.
 */
/**
 * Seats and renewal dates for the paid titles, so Software Licenses reports
 * real assignments. Entitlement is set above the installed count for most
 * titles and below it for a couple, because an over-allocated agreement is
 * the finding the report exists to surface.
 */
function rollUpEntitlements(db: Db): void {
  db.exec(`
    UPDATE software SET
      seats = CASE
        WHEN category IN ('Browsers', 'Utilities', 'Runtimes') THEN 0
        WHEN (rowid % 7) = 0 THEN MAX(1, CAST(install_count * 0.85 AS INTEGER))
        ELSE CAST(install_count * 1.15 AS INTEGER) + 25 END,
      renews_at = date('2027-0' || (1 + rowid % 9) || '-01');
  `);
}

/**
 * The delivery figures the Aegis Zones page reports, rolled up once the peers
 * exist.
 *
 * Content reaches a zone as one seed copy, its peers then serve it locally,
 * and whatever a device could not get locally it pulls from the central
 * repository. Every percentage on the page divides two of those three
 * figures, which is why each is stored rather than assumed:
 *
 *   WAN saved     = 1 - (seed + direct) / (local + direct)
 *   hit rate      = local / (local + direct)
 *   direct share  = direct / (local + direct)
 *
 * A zone with no peer cache serves nothing locally, so it saves nothing and
 * its hit rate is zero — which is the finding the page exists to surface.
 */
/** The saved descriptions a service desk reaches for most often. */
function seedInsightTemplates(db: Db): void {
  const insert = db.prepare(
    `INSERT INTO insight_templates (id,name,description,owner,created_at) VALUES (?,?,?,?,?)`,
  );
  const templates: readonly (readonly [string, string])[] = [
    ['Slow laptop', 'User reports that the laptop is slow and applications take too long to open.'],
    [
      'Applications crashing',
      'Applications close unexpectedly several times a day, with no pattern the user can describe.',
    ],
    [
      'Will not finish updates',
      'The endpoint reports pending updates for weeks and never finishes installing them.',
    ],
  ];
  db.transaction(() => {
    templates.forEach(([name, description], i) => {
      insert.run(
        `itpl-${String(i + 1).padStart(3, '0')}`,
        name,
        description,
        'Meera Subramanian',
        daysAgo(40 - i * 9),
      );
    });
  })();
}

function rollUpDelivery(db: Db): void {
  db.exec(`
    UPDATE zones SET
      -- Connectivity is the share of this zone's endpoints that checked in.
      connectivity_pct = COALESCE((
        SELECT CAST(ROUND(100.0 * SUM(d.status <> 'offline') / COUNT(*)) AS INTEGER)
          FROM devices d WHERE d.zone_id = zones.id), 0),
      -- One seed copy per zone, sized by the catalogue it has to carry.
      seed_gb = CASE WHEN peer_cache = 1 THEN 420 ELSE 0 END,
      -- Without a cache every byte comes from central; with one, only what the
      -- peers could not serve.
      direct_gb = CASE
        WHEN peer_cache = 1 THEN CAST(device_count * 0.9 AS INTEGER)
        ELSE CAST(device_count * 5.5 AS INTEGER) END,
      local_mbps = CASE
        WHEN peer_cache = 0 THEN 0
        WHEN bandwidth_mbps >= 1000 THEN 22
        WHEN bandwidth_mbps >= 500 THEN 18
        ELSE 11 END;

    UPDATE zones SET avoided_week_gb = COALESCE((
      SELECT CAST(ROUND(SUM(p.served_gb) / 8.0) AS INTEGER)
        FROM peers p WHERE p.zone_id = zones.id), 0);
  `);
}

function rollUpInventory(db: Db): void {
  const mix = (salt: number): string => `((devices.rowid * 2654435761 + ${salt}) % 1000000007)`;
  const h = mix(7919);

  db.exec(`
    UPDATE devices SET
      asset_tag = 'AST-' || (5000 + rowid),
      domain = 'corp.aegis.example',
      ownership = CASE WHEN ${h} % 9 = 4 THEN 'BYOD' ELSE 'Corporate' END,
      chassis = CASE kind WHEN 'laptop' THEN 'Notebook' WHEN 'server' THEN 'Rack' ELSE 'Desktop' END,
      os_install_date = date(enrolled_at),
      uptime = CASE WHEN status = 'offline' THEN '—'
                    ELSE (1 + ${h} % 12) || ' days' END,
      timezone = 'Asia/Kolkata (IST)',
      cpu_cores = CASE WHEN manufacturer = 'Apple' THEN 8
                       WHEN kind = 'server' THEN 16 + (${h} % 3) * 8
                       ELSE 8 + (${h} % 2) * 4 END,
      bios_version = CASE WHEN manufacturer = 'Apple' THEN 'Apple Firmware'
                          ELSE '1.' || (20 + ${h} % 20) || '.0' END,
      bios_date = CASE WHEN manufacturer = 'Apple' THEN '—'
                       ELSE '2026-0' || (1 + ${h} % 9) || '-1' || (${h} % 9) END,
      tpm = CASE WHEN manufacturer = 'Apple' THEN 'Secure Enclave' ELSE '2.0' END,
      secure_boot = CASE WHEN os_family = 'Linux' AND ${h} % 3 = 0 THEN 'Off'
                         WHEN ${h} % 10 = 3 THEN 'Off' ELSE 'On' END,
      gpu = CASE WHEN manufacturer = 'Apple' THEN 'Apple M3 GPU' ELSE 'Intel Iris Xe' END,
      battery = CASE WHEN kind = 'laptop' THEN (74 + ${h} % 26) || '%' ELSE '—' END,
      purchase_date = date(enrolled_at, '-' || (30 + ${h} % 400) || ' days'),
      warranty_until = date(enrolled_at, '+' || (700 + ${h} % 400) || ' days'),
      -- Strip the last octet: rtrim leaves "10.28.3." to build on.
      subnet = rtrim(ip, '0123456789') || '0/24',
      gateway = rtrim(ip, '0123456789') || '1',
      network_type = CASE WHEN kind = 'server' THEN 'Ethernet'
                          WHEN ${h} % 3 = 0 THEN 'Ethernet' ELSE 'Wi-Fi' END,
      public_ip = '203.0.113.' || (10 + ${h} % 40),
      vpn = CASE WHEN ${h} % 6 = 2 THEN 'Connected' ELSE 'Not connected' END,
      av_product = CASE WHEN os_family = 'macOS' THEN 'XProtect'
                        WHEN os_family = 'Linux' THEN 'ClamAV'
                        ELSE 'Microsoft Defender' END,
      av_definitions = CASE WHEN antivirus_ok = 0 THEN '—'
                            ELSE '1.419.' || (200 + ${h} % 400) END,
      encryption_type = CASE WHEN os_family = 'macOS' THEN 'FileVault'
                             WHEN os_family = 'Linux' THEN 'LUKS'
                             ELSE 'BitLocker' END,
      usb_storage = CASE WHEN ${h} % 4 = 0 THEN 'Allowed' ELSE 'Blocked' END,
      local_admins = 1 + ${h} % 3,
      patch_ring = CASE WHEN ${h} % 50 = 0 THEN 'Pilot'
                        WHEN os_family IN ('Linux', 'AIX') THEN 'Late' ELSE 'Broad' END,
      agent_health = CASE WHEN status = 'offline' THEN 'Not reporting' ELSE 'Healthy' END,
      content_source = CASE WHEN ${h} % 4 = 0 THEN 'Peer cache' ELSE 'Aegis server' END,
      last_patched_at = CASE WHEN pending_patches > 0
                             THEN date(last_seen_at, '-' || (40 + ${h} % 60) || ' days')
                             ELSE date(last_seen_at, '-' || (${h} % 20) || ' days') END;

    UPDATE devices SET ssid = CASE WHEN network_type = 'Wi-Fi' THEN 'AEGIS-CORP' ELSE '—' END;
  `);
}

/**
 * The USB connections the Security category's USB Activity report lists. It
 * is the one report source the estate had no table for.
 */
function seedUsbEvents(db: Db, rng: Rng): void {
  const PERIPHERALS: readonly (readonly [string, string])[] = [
    ['Mass storage', 'SanDisk Cruzer 32 GB'],
    ['Mass storage', 'Kingston DataTraveler 64 GB'],
    ['Mass storage', 'Seagate Portable 1 TB'],
    ['Input device', 'Logitech MX Keys'],
    ['Input device', 'Dell KB216 Keyboard'],
    ['Imaging', 'Canon LiDE 300 Scanner'],
    ['Phone', 'Samsung Galaxy S24'],
    ['Network adapter', 'TP-Link UE300 Ethernet'],
  ];

  const devices = db.prepare(`SELECT id FROM devices ORDER BY hostname LIMIT 400`).all() as {
    id: string;
  }[];

  const insert = db.prepare(
    `INSERT INTO usb_events (id,device_id,peripheral,usb_name,action,occurred_at)
     VALUES (?,?,?,?,?,?)`,
  );

  db.transaction(() => {
    for (let i = 0; i < 1200; i++) {
      const device = devices[i % devices.length];
      const peripheral = PERIPHERALS[i % PERIPHERALS.length];
      if (!device || !peripheral) continue;
      // Mass storage is what policy blocks; everything else connects.
      const blocked = peripheral[0] === 'Mass storage' && rng.chance(0.55);
      insert.run(
        `usb-${String(i + 1).padStart(5, '0')}`,
        device.id,
        peripheral[0],
        peripheral[1],
        blocked ? 'Blocked' : 'Allowed',
        daysAgo(rng.int(0, 29)),
      );
    }
  })();
}

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

    UPDATE vulnerabilities SET state = CASE
      WHEN accepted_reason IS NOT NULL THEN 'accepted'
      WHEN affected_count = 0 THEN 'resolved'
      ELSE 'open' END;

    /* How much a device matters, which weights its exposure score. */
    UPDATE devices SET
      criticality = CASE
        WHEN kind = 'server' THEN 9
        WHEN department IN ('Finance', 'Legal & Compliance') THEN 8
        WHEN department = 'IT Infrastructure' THEN 7
        ELSE 4 + (rowid % 3) END,
      scan_method = CASE
        WHEN status = 'offline' THEN 'not-scanned'
        WHEN rowid % 6 = 3 THEN 'credentialed-network'
        ELSE 'agent' END,
      last_scan_at = last_seen_at;

    /*
     * Exposure 0-1000. Each open finding contributes its Priority Rating
     * times a severity weight, raised where the flaw is exploited in the
     * wild; the total is then scaled by how much the device matters. A
     * device nothing has scanned keeps 0, and the page says "Not scanned"
     * rather than reporting that as a clean result.
     */
    UPDATE devices SET exposure = (
      SELECT MIN(1000, CAST(ROUND(COALESCE(SUM(
               v.priority
               * CASE v.severity WHEN 'critical' THEN 10 WHEN 'high' THEN 6
                                 WHEN 'medium' THEN 3 ELSE 1 END
               * CASE WHEN v.exploited = 1 THEN 1.3 ELSE 1.0 END), 0)
             * (0.55 + devices.criticality * 0.06) * 1.05) AS INTEGER))
        FROM device_vulnerabilities dv
        JOIN vulnerabilities v ON v.id = dv.vulnerability_id
       WHERE dv.device_id = devices.id AND dv.state = 'open')
      WHERE scan_method <> 'not-scanned';
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

/**
 * The group tree, and the membership behind it.
 *
 * A group is a node: `parent` names its parent, and `where` is the predicate
 * that decides membership. Dynamic groups are evaluated once here against the
 * real device rows, so the member list, the five per-group figures and a
 * deployment's resolved targets all read the same table instead of agreeing
 * by coincidence.
 *
 * The shape follows the approved design — a platform tree, two more platform
 * groups, one tree per major zone, a static ring and a posture group —
 * against this estate's own zones.
 */
interface GroupDef {
  readonly id: string;
  readonly name: string;
  readonly kind: 'static' | 'dynamic';
  readonly parent?: string;
  /** The membership rule in words, which the detail pane shows verbatim. */
  readonly rule: string;
  /** The same rule as SQL over `devices`. */
  readonly where: string;
  readonly policies?: readonly string[];
}

/**
 * One tree per zone that carries a peer cache, each with the first /24 of its
 * own range beneath it. Device addresses are 10.(20 + zoneIndex).x.y, so the
 * subnet is a real predicate rather than a label.
 */
function zoneGroups(): GroupDef[] {
  const out: GroupDef[] = [];
  for (const name of ['Mumbai HQ', 'Delhi Branch', 'Bengaluru Campus', 'Jaipur Branch']) {
    const zone = ZONES.find((z) => z.name === name);
    if (!zone) continue;
    const slug = zone.id.replace(/^zn-/, '');
    const prefix = `10.${20 + (ZONES.indexOf(zone) % 12)}.0.`;
    const quoted = `'${zone.name.replace(/'/g, "''")}'`;
    out.push(
      {
        id: `grp-${slug}`,
        name: zone.name,
        kind: 'dynamic',
        rule: `zoneName is ${zone.name}`,
        where: `zone_name = ${quoted}`,
      },
      {
        id: `grp-${slug}-net`,
        name: `Subnet ${prefix}0/24`,
        kind: 'dynamic',
        parent: `grp-${slug}`,
        rule: `zoneName is ${zone.name} and ip is within ${prefix}0/24`,
        where: `zone_name = ${quoted} AND ip LIKE '${prefix}%'`,
      },
    );
  }
  return out;
}

const GROUPS: readonly GroupDef[] = [
  {
    id: 'grp-win-ws',
    name: 'Windows Workstations',
    kind: 'dynamic',
    rule: 'osFamily is Windows and kind is workstation',
    where: `os_family = 'Windows' AND kind = 'workstation'`,
    policies: ['Windows Baseline 2026.1', 'Monthly Patch Ring — Broad'],
  },
  {
    id: 'grp-win-11',
    name: 'Windows 11',
    kind: 'dynamic',
    parent: 'grp-win-ws',
    rule: 'osFamily is Windows, kind is workstation and osName starts with Windows 11',
    where: `os_family = 'Windows' AND kind = 'workstation' AND os_name LIKE 'Windows 11%'`,
    policies: ['Windows Baseline 2026.1'],
  },
  {
    id: 'grp-win-10',
    name: 'Windows 10',
    kind: 'dynamic',
    parent: 'grp-win-ws',
    rule: 'osFamily is Windows, kind is workstation and osName starts with Windows 10',
    where: `os_family = 'Windows' AND kind = 'workstation' AND os_name LIKE 'Windows 10%'`,
    policies: ['Windows Baseline 2026.1', 'End-of-life OS watch'],
  },
  {
    id: 'grp-finance',
    name: 'Finance',
    kind: 'dynamic',
    parent: 'grp-win-ws',
    rule: 'osFamily is Windows, kind is workstation and department is Finance',
    where: `os_family = 'Windows' AND kind = 'workstation' AND department = 'Finance'`,
    policies: ['Finance data handling', 'Windows Baseline 2026.1'],
  },
  {
    id: 'grp-macos',
    name: 'macOS Fleet',
    kind: 'dynamic',
    rule: 'osFamily is macOS',
    where: `os_family = 'macOS'`,
    policies: ['macOS Baseline 2026.1'],
  },
  {
    id: 'grp-linux',
    name: 'Linux Endpoints',
    kind: 'dynamic',
    rule: 'osFamily is Linux',
    where: `os_family = 'Linux'`,
    policies: ['Linux Baseline 2026.1'],
  },
  ...zoneGroups(),
  {
    id: 'grp-pilot',
    name: 'Pilot Ring',
    kind: 'static',
    rule: 'Members chosen individually',
    // Every 125th row, which spreads the ring across the whole estate rather
    // than taking one zone's worth off the top.
    where: `rowid % 125 = 0`,
    policies: ['Monthly Patch Ring — Pilot'],
  },
  {
    id: 'grp-gaps',
    name: 'Security Gaps',
    kind: 'dynamic',
    rule: 'encrypted is false or criticalVulns is above 0',
    where: `(encrypted = 0 OR critical_vulns > 0)`,
  },
];

function seedGroups(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO device_groups (id,name,kind,parent_id,rule,policies,created_at,created_by)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const audit = db.prepare(
    `INSERT INTO audit_log (id,at,actor,actor_role,action,object_type,object_id,outcome,ip,detail)
     VALUES (?,?,?,?,?,'group',?,'success',?,?)`,
  );
  const addr = (): string => `10.${rng.int(20, 32)}.0.${rng.int(2, 254)}`;

  db.transaction(() => {
    GROUPS.forEach((g, i) => {
      const actor = rng.pick(['r.deshpande', 'a.iyer', 's.kulkarni']);
      const createdAt = daysAgo(rng.int(30, 700));
      insert.run(
        g.id,
        g.name,
        g.kind,
        g.parent ?? null,
        g.rule,
        (g.policies ?? []).join('\n'),
        createdAt,
        actor,
      );

      // The detail pane's History tab reads the audit log, so a group nobody
      // has touched since it was made still shows its own creation.
      audit.run(
        `aud-grp-${String(i).padStart(3, '0')}-a`,
        createdAt,
        actor,
        'admin',
        'group.create',
        g.id,
        addr(),
        `${g.kind} group`,
      );
      if (g.kind === 'dynamic' && rng.chance(0.4)) {
        audit.run(
          `aud-grp-${String(i).padStart(3, '0')}-b`,
          daysAgo(rng.int(1, 29)),
          rng.pick(['r.deshpande', 'a.iyer']),
          'admin',
          'group.update',
          g.id,
          addr(),
          'membership rule edited',
        );
      }
    });

    for (const g of GROUPS) {
      db.prepare(
        `INSERT INTO group_members (group_id, device_id) SELECT ?, id FROM devices WHERE ${g.where}`,
      ).run(g.id);
    }
  })();

  rollUpGroups(db);
}

/**
 * The five figures a group shows, counted from its materialised membership.
 *
 * Correlated subqueries rather than a query per group: SQLite runs this once
 * over sixteen rows, and the alternative is sixteen round trips that each
 * scan the same quarter of a million membership rows.
 */
function rollUpGroups(db: Db): void {
  db.exec(`
    UPDATE device_groups SET
      members = (SELECT COUNT(*) FROM group_members m
                  WHERE m.group_id = device_groups.id),
      online = (SELECT COUNT(*) FROM group_members m JOIN devices d ON d.id = m.device_id
                 WHERE m.group_id = device_groups.id AND d.status = 'online'),
      offline = (SELECT COUNT(*) FROM group_members m JOIN devices d ON d.id = m.device_id
                  WHERE m.group_id = device_groups.id AND d.status <> 'online'),
      missing_patches = (SELECT COUNT(*) FROM group_members m JOIN devices d ON d.id = m.device_id
                          WHERE m.group_id = device_groups.id AND d.pending_patches > 0),
      sub_groups = (SELECT COUNT(*) FROM device_groups c WHERE c.parent_id = device_groups.id);
    ANALYZE;
  `);
}

/**
 * A device's result for one check, as one SQL expression.
 *
 * Where a check names an inventory column the answer is read from it, so a
 * device that is genuinely unencrypted fails the encryption check. For a
 * setting this console does not inventory the answer is spread
 * deterministically over the device row and the check's position, at the
 * reference's own pass rates — higher severities are configured more often,
 * and a device already carrying critical vulnerabilities fares worse.
 *
 * It is one expression, used both to roll the counts up at seed time and to
 * list the devices behind a check in the drawer, so a figure and the rows
 * behind it can never disagree.
 */
export const CHECK_PASS_SQL = `CASE c.check_key
    WHEN 'firewall'   THEN d.firewall_ok
    WHEN 'av'         THEN d.antivirus_ok
    WHEN 'avAge'      THEN d.antivirus_ok
    WHEN 'enc'        THEN d.encrypted
    WHEN 'patch'      THEN (d.pending_patches = 0)
    WHEN 'usb'        THEN ((d.rowid * 7919 + c.seq * 40503) % 4 <> 0)
    WHEN 'secureBoot' THEN ((d.rowid * 7919 + c.seq * 40503) % 10 <> 3)
    ELSE ((d.rowid * 7919 + c.seq * 40503) % 100)
         < (CASE c.severity WHEN 'high' THEN 88 WHEN 'medium' THEN 82 ELSE 76 END
            - CASE WHEN d.critical_vulns > 0 THEN 12 ELSE 0 END)
  END`;

/**
 * Which devices a check applies to. The library covers three platforms; the
 * estate also holds AIX servers, which simply have no checks, so they are
 * absent from the figures rather than counted as passing.
 */
export const CHECK_APPLIES_SQL = `(
    (c.platform = 'windows' AND d.os_family IN ('Windows', 'Windows Server'))
    OR (c.platform = 'macos' AND d.os_family = 'macOS')
    OR (c.platform = 'linux' AND d.os_family = 'Linux')
  )`;

/** Whether an exception covers this device for this check. */
export const CHECK_EXCEPTED_SQL = `EXISTS (
    SELECT 1 FROM config_exceptions x
     WHERE x.check_id = c.id
       AND (x.expires_at IS NULL OR x.expires_at >= date('now'))
       AND (x.scope_group_id IS NULL
            OR EXISTS (SELECT 1 FROM group_members gm
                        WHERE gm.group_id = x.scope_group_id AND gm.device_id = d.id))
  )`;

const BENCHMARKS: readonly (readonly [string, string, string, string, string | null])[] = [
  ['b-cis-win', 'cis', 'CIS Windows Workstation L1', 'v3.0.0', 'windows'],
  ['b-stig-win', 'stig', 'DISA STIG Windows 11', 'v2r4', 'windows'],
  ['b-pci', 'pci-dss', 'PCI DSS Endpoint', 'v4.0', null],
  ['b-hipaa', 'hipaa', 'HIPAA Endpoint', '2013 Omnibus', null],
  ['b-cis-mac', 'cis', 'CIS Apple macOS', 'v1.0.0', 'macos'],
  ['b-cis-lnx', 'cis', 'CIS Ubuntu Linux', 'v2.0.0', 'linux'],
];

/**
 * The version history the Profiles tab lays out: one row per setting, one
 * column per version, with the newest marked current.
 */
const PROFILE_SETTINGS: Readonly<Record<string, readonly (readonly [number, string])[]>> = {
  'Password Length': [
    [6, '8'],
    [7, '10'],
    [8, '14'],
  ],
  'USB Storage': [
    [6, 'Allowed'],
    [7, 'Allowed'],
    [8, 'Blocked'],
  ],
  'Screen Lock': [
    [6, '15 min'],
    [7, '10 min'],
    [8, '10 min'],
  ],
};

/** name, platform, status, version, days since last change, target group. */
const PROFILES: readonly (readonly [string, string, string, number, number, string])[] = [
  ['Windows Security Profile', 'windows', 'active', 8, 2, 'grp-win-ws'],
  ['Developer Workstation', 'windows', 'active', 3, 6, 'grp-pilot'],
  ['Executive macOS', 'macos', 'active', 2, 12, 'grp-macos'],
  ['Linux Workstation Profile', 'linux', 'active', 4, 1, 'grp-linux'],
];

function seedConfiguration(db: Db): void {
  const insertCheck = db.prepare(
    `INSERT INTO config_checks
       (id,title,category,platform,severity,expected,bad,check_key,cis,stig,pci,hipaa,remediable,seq)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const seqOf: Record<string, number> = { windows: 0, macos: 0, linux: 0 };
  db.transaction(() => {
    for (const c of CONFIG_CHECKS) {
      seqOf[c.platform] = (seqOf[c.platform] ?? 0) + 1;
      insertCheck.run(
        c.id,
        c.title,
        c.category,
        c.platform,
        c.severity,
        c.expected,
        c.bad,
        c.key,
        c.cis,
        c.stig,
        c.pci,
        c.hipaa,
        c.remediable ? 1 : 0,
        seqOf[c.platform] ?? 0,
      );
    }
  })();

  const groupIds = (
    db.prepare(`SELECT id FROM device_groups ORDER BY id LIMIT 2`).all() as { id: string }[]
  ).map((r) => r.id);

  const insertBenchmark = db.prepare(
    `INSERT INTO config_benchmarks (id,framework,name,version,platform,assigned_group_id)
     VALUES (?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    for (const [id, framework, name, version, platform] of BENCHMARKS) {
      insertBenchmark.run(id, framework, name, version, platform, null);
    }
  })();

  // One exception, so the Exceptions tab and the Exc. column have something
  // to show. The reference starts empty and fills from its own drawer; this
  // build cannot write one back, so it is seeded instead.
  const excepted = CONFIG_CHECKS.find((c) => c.id === 'AEG-WIN-030');
  if (excepted) {
    db.prepare(
      `INSERT INTO config_exceptions
         (id,check_id,scope_group_id,reason,granted_by,granted_at,expires_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(
      'cex-001',
      excepted.id,
      groupIds[0] ?? null,
      'Signed off by the audit committee for the trading floor build; the control is met by a compensating network rule. Review AUD-2026-114.',
      'Meera Subramanian',
      daysAgo(14),
      daysAgo(-120).slice(0, 10),
    );
  }

  const insertProfile = db.prepare(
    `INSERT INTO config_profiles
       (id,name,platform,status,version,target_group_id,assigned_devices,compliance_pct,modified_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  const insertSetting = db.prepare(
    `INSERT INTO config_profile_settings (profile_id,setting,version,value) VALUES (?,?,?,?)`,
  );
  db.transaction(() => {
    PROFILES.forEach(([name, platform, status, version, changedDaysAgo, groupId], i) => {
      const id = `cp-${String(i + 1).padStart(3, '0')}`;
      insertProfile.run(
        id,
        name,
        platform,
        status,
        version,
        groupId,
        0,
        0,
        daysAgo(changedDaysAgo),
      );
      // Only the first profile carries a version history; the reference shows
      // one profile's history and names it in the panel title.
      if (i === 0) {
        for (const [setting, versions] of Object.entries(PROFILE_SETTINGS)) {
          for (const [v, value] of versions) insertSetting.run(id, setting, v, value);
        }
      }
    });
  })();

  rollUpConfiguration(db);
}

/**
 * Rolls the check library up over the estate, once.
 *
 * Two passes over the same join — 200 checks against the devices each applies
 * to — give the per-check counts the grid ranks on and the per-device counts
 * the Devices tab ranks on. `config_pass_pct` is recomputed here too: it used
 * to be a random figure, so the Devices grid and this page disagreed about
 * the same device.
 */
function rollUpConfiguration(db: Db): void {
  const pass = CHECK_PASS_SQL;
  const applies = CHECK_APPLIES_SQL;
  const excepted = CHECK_EXCEPTED_SQL;

  db.exec(`
    UPDATE config_checks SET
      pass_count = (SELECT COUNT(*) FROM devices d, config_checks c
                     WHERE c.id = config_checks.id AND ${applies}
                       AND NOT ${excepted} AND ${pass}),
      fail_count = (SELECT COUNT(*) FROM devices d, config_checks c
                     WHERE c.id = config_checks.id AND ${applies}
                       AND NOT ${excepted} AND NOT ${pass}),
      exception_count = (SELECT COUNT(*) FROM devices d, config_checks c
                          WHERE c.id = config_checks.id AND ${applies} AND ${excepted});

    UPDATE config_checks SET compliance_pct = CASE
      WHEN pass_count + fail_count = 0 THEN NULL
      ELSE CAST(ROUND(pass_count * 100.0 / (pass_count + fail_count)) AS INTEGER) END;
  `);

  db.exec(`
    UPDATE devices SET
      config_checks_total = (SELECT COUNT(*) FROM config_checks c
                              WHERE ${applies.replace(/\bd\./g, 'devices.')}),
      config_fail = (SELECT COUNT(*) FROM config_checks c, devices d
                      WHERE d.id = devices.id AND ${applies}
                        AND NOT ${excepted} AND NOT ${pass}),
      config_high_fail = (SELECT COUNT(*) FROM config_checks c, devices d
                           WHERE d.id = devices.id AND ${applies} AND c.severity = 'high'
                             AND NOT ${excepted} AND NOT ${pass}),
      config_exceptions = (SELECT COUNT(*) FROM config_checks c, devices d
                            WHERE d.id = devices.id AND ${applies} AND ${excepted});

    UPDATE devices SET config_pass_pct = CASE
      WHEN config_checks_total - config_exceptions <= 0 THEN 0
      ELSE CAST(ROUND((config_checks_total - config_exceptions - config_fail) * 100.0
                      / (config_checks_total - config_exceptions)) AS INTEGER) END;
  `);

  // The same counts again, per group, for the Device Group filter. One
  // statement per group: a single statement over every membership at once
  // builds a far larger intermediate result than SQLite handles well.
  const perGroup = db.prepare(
    `INSERT INTO config_check_groups (group_id, check_id, pass_count, fail_count, exception_count)
     SELECT ?, c.id,
            SUM(CASE WHEN NOT ${excepted} AND ${pass} THEN 1 ELSE 0 END),
            SUM(CASE WHEN NOT ${excepted} AND NOT ${pass} THEN 1 ELSE 0 END),
            SUM(CASE WHEN ${excepted} THEN 1 ELSE 0 END)
       FROM config_checks c
       JOIN group_members gm ON gm.group_id = ?
       JOIN devices d ON d.id = gm.device_id
      WHERE ${applies}
      GROUP BY c.id`,
  );
  const groups = db.prepare(`SELECT id FROM device_groups`).all() as { id: string }[];
  for (const g of groups) perGroup.run(g.id, g.id);

  db.exec(`
    UPDATE config_check_groups SET compliance_pct = CASE
      WHEN pass_count + fail_count = 0 THEN NULL
      ELSE CAST(ROUND(pass_count * 100.0 / (pass_count + fail_count)) AS INTEGER) END;
  `);

  // A profile covers the members of its group that run its own platform, so
  // the four profiles report four different populations.
  const inProfile = `d.config_checks_total > 0
       AND EXISTS (SELECT 1 FROM group_members gm
                    WHERE gm.group_id = config_profiles.target_group_id
                      AND gm.device_id = d.id)
       AND ((config_profiles.platform = 'windows' AND d.os_family IN ('Windows', 'Windows Server'))
         OR (config_profiles.platform = 'macos' AND d.os_family = 'macOS')
         OR (config_profiles.platform = 'linux' AND d.os_family = 'Linux'))`;

  db.exec(`
    UPDATE config_profiles SET
      assigned_devices = (SELECT COUNT(*) FROM devices d WHERE ${inProfile}),
      compliance_pct = COALESCE(
        (SELECT CAST(ROUND(AVG(d.config_pass_pct)) AS INTEGER) FROM devices d WHERE ${inProfile}), 0);
  `);
}

function seedDeployments(db: Db, rng: Rng): void {
  const insert = db.prepare(`INSERT INTO deployments
    (id,name,type,status,package,target_count,done,failed,pending,triggered_at,triggered_by,starts_at,completed_at,wake_offline_first,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  // One per plan below, in the same order: seven completed, three running,
  // two scheduled, and one each failed, cancelled and paused.
  const DEPLOYMENT_STATUSES = [
    'completed',
    'completed',
    'scheduled',
    'running',
    'completed',
    'failed',
    'completed',
    'running',
    'cancelled',
    'completed',
    'scheduled',
    'paused',
    'completed',
    'running',
    'completed',
  ] as const;

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
    plans.forEach(([name, type, packageLabel], i) => {
      const targets = rng.int(60, 9800);
      // Fixed per row rather than drawn at random. The page's six counters
      // each have to have rows behind them, and a weighted draw over fifteen
      // actions left that to luck: a seed that happened to roll no scheduled
      // action gave the Scheduled counter nothing to open. The mix still
      // follows the intended weights.
      const status = DEPLOYMENT_STATUSES[i] ?? 'completed';

      // How many endpoints have reported at all. The contract splits that into
      // `done` and `failed`, and whatever has not reported is `pending`.
      const attempted =
        status === 'scheduled'
          ? 0
          : status === 'running'
            ? Math.round(targets * rng.next() * 0.8)
            : targets;
      const failed =
        status === 'scheduled'
          ? 0
          : Math.round(attempted * (status === 'failed' ? 0.72 : rng.next() * 0.07));
      const created = rng.recentMs(NOW, 45);

      insert.run(
        `dep-${String(1000 + i)}`,
        name,
        type,
        status,
        packageLabel,
        targets,
        attempted - failed,
        failed,
        targets - attempted,
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

  rollUpTargetPreviews(db);
}

/**
 * The first three target hostnames per action, stored on the row.
 *
 * The grid prints them under the endpoint count on every row. Reading them per
 * row would be a join into deployment_results for a line of secondary text,
 * and the targets of a seeded action do not change, so they are materialised
 * once here. A scheduled action has reported nothing yet, so it falls back to
 * the head of the estate rather than showing no targets at all.
 */
function rollUpTargetPreviews(db: Db): void {
  const fallback = db.prepare(`SELECT hostname FROM devices ORDER BY hostname LIMIT 3`).all() as {
    hostname: string;
  }[];
  const names = db.prepare(
    `SELECT d.hostname FROM deployment_results r JOIN devices d ON d.id = r.device_id
      WHERE r.deployment_id = ? ORDER BY d.hostname LIMIT 3`,
  );
  const update = db.prepare(`UPDATE deployments SET target_preview = ? WHERE id = ?`);
  const rows = db.prepare(`SELECT id FROM deployments`).all() as { id: string }[];

  db.transaction(() => {
    for (const { id } of rows) {
      const hit = names.all(id) as { hostname: string }[];
      const preview = (hit.length ? hit : fallback).map((r) => r.hostname);
      update.run(preview.join(','), id);
    }
  })();
}

/**
 * Live Activity jobs.
 *
 * Submitted, polled, and read back per endpoint. Nothing here is a session:
 * there is no channel to attach to and no way to send a second command to a
 * running job.
 *
 * Column names, the seven counters and the per-endpoint columns are the
 * contract's LiveJob and LiveJobResult.
 */
function seedLiveJobs(db: Db, rng: Rng): void {
  const insertJob = db.prepare(`INSERT INTO live_jobs
    (id,title,kind,script_language,script,change_ref,status,target_count,
     queued,running,succeeded,failed,timed_out,offline,cancelled,
     submitted_at,submitted_by,finished_at,timeout_seconds,output_limit_kb)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertResult = db.prepare(`INSERT INTO live_job_results
    (job_id,device_id,device_name,connection,action_id,action_type,status,exit_code,
     reason,detail,stdout,stderr,queued_at,started_at,finished_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const jobs: readonly (readonly [
    string,
    'live-data' | 'script' | 'log-collection',
    string | null,
    string | null,
  ])[] = [
    ['Endpoint Health Investigation', 'live-data', null, null],
    [
      'Clear Windows Update cache',
      'script',
      'powershell',
      'Stop-Service wuauserv\nRemove-Item "$env:SystemRoot\\SoftwareDistribution\\Download\\*" -Recurse -Force\nStart-Service wuauserv',
    ],
    ['Agent Diagnostic Collection', 'log-collection', null, null],
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
    ['Inventory refresh — Jaipur Branch', 'live-data', null, null],
    ['Collect crash dumps — Engineering', 'log-collection', null, null],
    [
      'Inventory Script Validation',
      'script',
      'powershell',
      'Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, LastBootUpTime | ConvertTo-Json',
    ],
  ];

  /** The agent's own name for the command, which the grid shows verbatim. */
  const ACTION_TYPE = {
    'live-data': 'LIVE_QUERY',
    script: 'RUN_SCRIPT',
    'log-collection': 'COLLECT_LOGS',
  } as const;

  /** Why a row reads as it does: a few words, then the same in a sentence. */
  const EXPLAIN: Record<string, readonly [string, string]> = {
    succeeded: ['Output returned', 'Output returned and stored against this endpoint.'],
    failed: [
      'Command exited non-zero',
      'The command ran and exited with a non-zero code. Output is kept for review.',
    ],
    'timed-out': [
      'No result before the timeout',
      'The agent accepted the command but returned nothing before the job timeout elapsed.',
    ],
    offline: [
      'Agent unreachable',
      'The agent did not answer and the endpoint is not reporting as offline either.',
    ],
    queued: [
      'Device offline · runs at next check-in',
      'Endpoint is offline. The request stays queued and runs when the agent next checks in.',
    ],
    running: ['In progress', 'The agent has accepted the command and is running it.'],
    cancelled: ['Cancelled before start', 'The job was cancelled before this endpoint began.'],
  };

  const devices = db
    .prepare(`SELECT id, hostname, status FROM devices ORDER BY rowid LIMIT 400`)
    .all() as { id: string; hostname: string; status: string }[];

  db.transaction(() => {
    jobs.forEach(([title, kind, language, script], i) => {
      // Every target gets a materialised row, so the Targets column, the seven
      // counters and the rows behind them are one set of figures.
      const targets = rng.int(18, 120);
      const status = rng.weighted([
        ['completed', 50],
        ['running', 20],
        ['queued', 10],
        ['completed-with-failures', 8],
        ['failed', 6],
        ['cancelled', 6],
      ] as const);
      const submitted = rng.recentMs(NOW, 14);
      const jobId = `job-${String(2000 + i)}`;

      // The per-endpoint rows are drawn up first and inserted after the job,
      // because the job's counters are their tally: the figure the console
      // shows and the rows behind it cannot disagree.
      const counts: Record<string, number> = {
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        'timed-out': 0,
        offline: 0,
        cancelled: 0,
      };

      const sample = status === 'queued' ? [] : devices.slice(0, targets);
      const resultRows: unknown[][] = [];
      sample.forEach((device, n) => {
        const offline = device.status !== 'online';
        // The approved page shows an offline endpoint as QUEUED with an
        // offline connection, not as a separate status: the request has not
        // failed, it is waiting for the agent to check in.
        const resultStatus = offline
          ? 'queued'
          : status === 'cancelled'
            ? 'cancelled'
            : status === 'running' && rng.chance(0.35)
              ? 'running'
              : rng.weighted([
                  ['succeeded', status === 'failed' ? 10 : 86],
                  ['failed', status === 'failed' ? 80 : 9],
                  ['timed-out', 5],
                ] as const);
        counts[resultStatus] = (counts[resultStatus] ?? 0) + 1;

        const explain = EXPLAIN[resultStatus] ?? ['', ''];
        const started =
          resultStatus === 'queued' || resultStatus === 'cancelled'
            ? null
            : submitted + rng.int(1, 60) * 1000;
        const finished =
          started !== null && resultStatus !== 'running' ? started + rng.int(240, 42_000) : null;

        resultRows.push([
          jobId,
          device.id,
          device.hostname,
          offline ? 'offline' : 'online',
          // The agent's own id for this endpoint's copy of the command.
          `${ACTION_TYPE[kind].split('_')[0]}-${jobId.slice(4)}-C${String(n + 1).padStart(3, '0')}`,
          ACTION_TYPE[kind],
          resultStatus,
          resultStatus === 'succeeded'
            ? 0
            : resultStatus === 'failed'
              ? rng.pick([1, 2, 1603])
              : null,
          explain[0],
          explain[1],
          resultStatus === 'succeeded' ? sampleStdout(kind, rng) : null,
          resultStatus === 'failed' ? 'Access is denied. (0x80070005)' : null,
          iso(submitted),
          started === null ? null : iso(started),
          finished === null ? null : iso(finished),
        ]);
      });

      insertJob.run(
        jobId,
        title,
        kind,
        language,
        script,
        rng.chance(0.5) ? 'INC-0092144' : null,
        status,
        targets,
        (counts['queued'] ?? 0) + Math.max(0, targets - sample.length),
        counts['running'] ?? 0,
        counts['succeeded'] ?? 0,
        counts['failed'] ?? 0,
        counts['timed-out'] ?? 0,
        counts['offline'] ?? 0,
        counts['cancelled'] ?? 0,
        iso(submitted),
        rng.pick(['r.deshpande', 'a.iyer', 'n.banerjee']),
        status === 'queued' || status === 'running'
          ? null
          : iso(submitted + rng.int(20, 900) * 1000),
        300,
        64,
      );

      for (const row of resultRows) insertResult.run(...row);
    });
  })();
}

/**
 * Storage and mail settings for collected logs. One row, read from v129's
 * Storage & Mail panel; the root path stays a placeholder because a real one
 * names a server.
 */
function seedLogSettings(db: Db): void {
  db.prepare(
    `INSERT INTO log_settings
      (id,retention_days,email_bundles,recipients,root_path,folder_layout,
       file_name_pattern,max_bundle_size_mb,send_as,attachment_limit_mb)
     VALUES (1,?,?,?,?,?,?,?,?,?)`,
  ).run(
    90,
    1,
    'endpoint-ops@example.internal',
    '\\\\<ROOT_SERVER>\\AegisLogs',
    'date-hostname',
    '{hostname}_{type}_{yyyyMMdd-HHmm}.zip',
    200,
    'link',
    10,
  );
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

/**
 * Peer caches, elected from the estate's own endpoints.
 *
 * The approved Peer Cache page states the rule in its own words: no dedicated
 * distribution servers, a regular endpoint agent is elected to cache content
 * for its zone. So each row points at a real device and borrows that device's
 * hostname — the previous fixture invented appliances called DEL-CACHE-01,
 * which contradicted the page it was feeding.
 *
 * The candidate is the zone's steadiest endpoint: online, on the current
 * agent, with the most free disk. That is also the election a real
 * implementation would make, so the stored choice and the Re-elect route
 * agree on what "best" means.
 */
function seedPeers(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO peers
       (id,device_id,hostname,zone_id,zone_name,cache_size_gb,cache_used_gb,
        served_gb,peers_served,status,elected,last_transfer_at,last_seen_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  /*
   * Candidates per zone, best first. `disk_free_pct DESC` is the tie-break
   * that matters: a cache fills a hundred gigabytes, and electing an endpoint
   * that is nearly full would be electing a failure.
   */
  const candidates = db.prepare(
    `SELECT id, hostname FROM devices
      WHERE zone_id = ? AND status = 'online'
      ORDER BY disk_free_pct DESC, dex_score DESC, rowid
      LIMIT ?`,
  );

  db.transaction(() => {
    let n = 0;
    for (const zone of ZONES) {
      if (!zone.peerCache) continue;
      const count = Math.max(2, Math.round(zone.weight / 4));
      const picks = candidates.all(zone.id, count) as { id: string; hostname: string }[];

      picks.forEach((device, i) => {
        const size = rng.pick([100, 200, 500]);
        insert.run(
          `peer-${String(300 + n++)}`,
          device.id,
          device.hostname,
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
          // The first candidate is the one currently serving the zone.
          i === 0 ? 1 : 0,
          iso(NOW - rng.int(30_000, 7_200_000)),
          iso(NOW - rng.int(30_000, 7_200_000)),
        );
      });
    }

    seedPeerCacheContent(db);
  })();
}

/**
 * What each zone's cache is holding: the packages that actually reached
 * devices in that zone, most recent first. A cache holds what was delivered
 * through it, so this is read from `deployment_results` rather than drawn.
 */
function seedPeerCacheContent(db: Db): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO peer_cache_content (zone_id,label,seq) VALUES (?,?,?)`,
  );

  /*
   * A deployment's package is a KB for a patch and a title for an application,
   * which is exactly the two forms the Content Cached column prints. Only
   * succeeded results count: a pending deployment has not been cached yet,
   * and a failed one may never have arrived.
   *
   * Only the three types that carry a payload count. A script or a log
   * collection is a few kilobytes sent to each endpoint — there is nothing
   * for a cache to hold, and listing one would misdescribe what the cache
   * is doing.
   */
  const delivered = db.prepare(
    `SELECT DISTINCT d.package AS label, MAX(dr.finished_at) AS at
       FROM deployment_results dr
       JOIN deployments d ON d.id = dr.deployment_id
       JOIN devices dev ON dev.id = dr.device_id
      WHERE dev.zone_id = ?
        AND dr.state = 'succeeded'
        AND dr.finished_at IS NOT NULL
        AND d.type IN ('deploy-patches', 'install-software', 'update-software')
      GROUP BY d.package
      ORDER BY at DESC
      LIMIT 4`,
  );

  for (const zone of ZONES) {
    if (!zone.peerCache) continue;
    const rows = delivered.all(zone.id) as { label: string }[];
    rows.forEach((row, i) => insert.run(zone.id, row.label, i));
  }
}

/**
 * Integrations, as four kinds of thing rather than one flat list.
 *
 * Nothing here draws from the shared rng. The delivery log is derived from a
 * multiplicative hash of the row index, so a destination's mix of delivered,
 * retrying and failed attempts is stable across reseeds and does not shift
 * every other fixture's random stream.
 */
function seedIntegrations(db: Db): void {
  const minutesAgo = (m: number | null): string | null =>
    m === null ? null : iso(NOW - m * 60_000);

  db.transaction(() => {
    const connector = db.prepare(
      `INSERT INTO connectors (id,name,kind,status,purpose,scope,last_sync_at,seq)
       VALUES (?,?,?,?,?,?,?,?)`,
    );
    CONNECTORS.forEach((c, i) =>
      connector.run(
        c.id,
        c.name,
        c.kind,
        c.status,
        c.purpose,
        c.scope,
        minutesAgo(c.syncedMinutesAgo),
        i,
      ),
    );

    const siem = db.prepare(
      `INSERT INTO siem_destinations
         (id,name,transport,protocol,status,host,port,event_types,last_sent_at,rate_per_hour,enabled,seq)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    SIEM_DESTINATIONS.forEach((d, i) =>
      siem.run(
        d.id,
        d.name,
        d.transport,
        d.protocol,
        d.configured ? 'connected' : 'not-configured',
        d.host,
        d.port,
        // Every destination subscribes to the three event families; the
        // reference prints "Events 3 types" on all five of its cards.
        EVENT_TYPES.length,
        minutesAgo(d.sentMinutesAgo),
        d.ratePerHour,
        d.configured ? 1 : 0,
        i,
      ),
    );

    const channel = db.prepare(
      `INSERT INTO notification_channels
         (id,name,transport,status,event_types,last_sent_at,rate_per_hour,seq)
       VALUES (?,?,?,?,?,?,?,?)`,
    );
    NOTIFICATION_CHANNELS.forEach((c, i) =>
      channel.run(
        c.id,
        c.name,
        c.transport,
        c.configured ? 'connected' : 'not-configured',
        c.eventTypes,
        minutesAgo(c.sentMinutesAgo),
        c.ratePerHour,
        i,
      ),
    );

    const rule = db.prepare(
      `INSERT INTO notification_rules (id,event,enabled,seq) VALUES (?,?,?,?)`,
    );
    const ruleChannel = db.prepare(
      `INSERT INTO notification_rule_channels (rule_id,channel_id,seq) VALUES (?,?,?)`,
    );
    ALERT_RULES.forEach((r, i) => {
      rule.run(r.id, r.event, r.enabled ? 1 : 0, i);
      r.channelIds.forEach((id, j) => ruleChannel.run(r.id, id, j));
    });

    seedDeliveryLog(db);
  })();
}

/**
 * One row per forwarded event over the last 24 hours, for the destinations
 * and channels that are actually configured. A destination that was never set
 * up has no deliveries, which is why the log's empty state exists.
 */
function seedDeliveryLog(db: Db): void {
  const targets = [
    ...SIEM_DESTINATIONS.filter((d) => d.configured).map((d) => ({
      id: d.id,
      name: d.name,
      perHour: d.ratePerHour ?? 0,
    })),
    ...NOTIFICATION_CHANNELS.filter((c) => c.configured).map((c) => ({
      id: c.id,
      name: c.name,
      perHour: c.ratePerHour ?? 0,
    })),
  ];

  const insert = db.prepare(
    `INSERT INTO deliveries (id,connector_id,connector_name,event_type,event,at,outcome,http_status)
     VALUES (?,?,?,?,?,?,?,?)`,
  );

  let n = 0;
  for (const target of targets) {
    /*
     * The stored rate is per hour; the log keeps a sampled slice rather than
     * a full day of it, because 1,243 events an hour is 29,832 rows nobody
     * reads. One in forty is enough to fill every filter combination.
     */
    const rows = Math.max(6, Math.round((target.perHour * 24) / 40));
    for (let i = 0; i < rows; i++) {
      n += 1;
      const mix = (salt: number): number => (n * 2654435761 + salt) % 1000000007;
      const family = EVENT_TYPES[mix(11) % EVENT_TYPES.length] ?? 'Audit Trail';
      const names = EVENT_NAMES[family] ?? [];
      const event = names[mix(23) % Math.max(1, names.length)] ?? 'event';
      // Delivery is the normal case; a small tail retries, and a smaller one
      // gives up. 93 / 5 / 2 across the estate.
      const roll = mix(37) % 100;
      const outcome = roll < 93 ? 'delivered' : roll < 98 ? 'retrying' : 'failed';
      insert.run(
        `del-${String(n).padStart(6, '0')}`,
        target.id,
        target.name,
        family,
        event,
        iso(NOW - (mix(53) % (24 * 60)) * 60_000),
        outcome,
        outcome === 'delivered' ? 200 : outcome === 'retrying' ? 503 : 500,
      );
    }
  }
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
    `INSERT INTO roles
       (id,name,permissions,system,zone_ids,software_categories,group_ids,user_count)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const insertUser = db.prepare(
    `INSERT INTO users (id,email,name,role,zone_ids,mfa_enrolled,status,last_sign_in_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
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
        /*
         * One role is narrowed on all three axes, because a card where every
         * scope reads "All" tells you nothing about what the scoping does.
         * A branch operator who may install browsers and utilities but not
         * security agents is the case the approved design exists for.
         */
        JSON.stringify(role.name === 'Jaipur Branch Operator' ? ['Browser', 'Utilities'] : []),
        JSON.stringify([]),
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
        // The disabled account never finished enrolling a second factor,
        // which is why it is disabled.
        id === 'usr-008' ? 0 : 1,
        id === 'usr-008' ? 'disabled' : 'active',
        id === 'usr-008' ? daysAgo(96) : iso(rng.recentMs(NOW, 10)),
        daysAgo(rng.int(120, 1100)),
      );
    }
  })();
}

/**
 * The four identity providers the approved Identity & SSO tab prints, with
 * the descriptive line each card carries under its name.
 *
 * All four ship switched off and unconfigured, which is what the reference
 * shows: STATUS "Disabled", CONNECTION "Setup Required". That is also the
 * truthful state of this estate — the console's own sign-in is the built-in
 * OIDC provider in `@aegis/mock-core`, not any of these four, and claiming
 * Okta was connected would be claiming a federation that does not exist.
 */
function seedIdentityProviders(db: Db): void {
  const providers: readonly (readonly [string, string, string, string, boolean])[] = [
    ['idp-okta', 'Okta', 'saml', 'SAML · Federated Identity', false],
    [
      'idp-entra',
      'Microsoft Entra ID',
      'oidc',
      'OIDC · Microsoft Authenticator Via Entra MFA',
      true,
    ],
    ['idp-saml', 'Generic SAML 2.0', 'saml', 'SAML · Federated Identity', false],
    ['idp-ldap', 'LDAP / Active Directory', 'ldap', 'LDAP · Directory Authentication', false],
  ];

  const insert = db.prepare(
    `INSERT INTO identity_providers
       (id,name,protocol,description,enabled,status,mfa_required,seq)
     VALUES (?,?,?,?,0,'not-configured',?,?)`,
  );
  db.transaction(() => {
    providers.forEach(([id, name, protocol, description, mfa], i) =>
      insert.run(id, name, protocol, description, mfa ? 1 : 0, i),
    );
    db.prepare(
      `INSERT INTO agent_enrollment_settings (id,require_token,auto_assign_group,token_max_age_days)
       VALUES (1,1,NULL,30)`,
    ).run();
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
    (id,name,platform,zone_id,target_group_id,prefix,token_hash,uses,max_uses,expires_at,created_at,created_by,revoked_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  /*
   * A token names the group an endpoint joins on first check-in, so each one
   * points at a group that exists. The reference's own three tokens have all
   * expired, which leaves its Active Tokens counter reading zero and never
   * exercises the other two states; ours carries one of each.
   */
  const enrolments: readonly (readonly [
    string,
    string,
    string,
    'active' | 'expired' | 'revoked',
  ])[] = [
    ['Branch laptops — standard build', 'windows', 'grp-win-ws', 'active'],
    ['Mac onboarding', 'macos', 'grp-macos', 'active'],
    ['Linux build agents', 'linux', 'grp-linux', 'active'],
    ['Q3 imaging batch', 'windows', 'grp-win-10', 'expired'],
    ['Contractor laptops — withdrawn', 'windows', 'grp-pilot', 'revoked'],
  ];

  db.transaction(() => {
    enrolments.forEach(([name, platform, groupId, state], i) => {
      const secret = `enr_${randomUUID().replace(/-/g, '')}`;
      // The zone column predates the contract's EnrollmentToken, which names
      // a group rather than a zone. It is kept and filled round-robin.
      const zone = ZONES[i % ZONES.length];
      if (!zone) return;
      insertEnrol.run(
        `enr-${String(800 + i)}`,
        name,
        platform,
        zone.id,
        groupId,
        secret.slice(0, 11),
        createHash('sha256').update(secret).digest('hex'),
        rng.int(4, 1840),
        rng.chance(0.5) ? 5000 : null,
        state === 'expired' ? daysAgo(rng.int(5, 60)) : iso(NOW + rng.int(10, 180) * 86_400_000),
        daysAgo(rng.int(70, 400)),
        'r.deshpande',
        state === 'revoked' ? daysAgo(rng.int(1, 40)) : null,
      );
    });
  })();
}

/**
 * The licence: one agreement, its seats, its term and the modules it covers.
 *
 * The seven modules and their tiers are the approved Licensing page's own —
 * five included, Vulnerability Management as an add-on, AEGIS Insight as a
 * preview that is explicitly not counted against seats. Six of seven are
 * active, which is what the panel's own count says.
 *
 * Seats are sized above the estate rather than at it. A licence with exactly
 * as many seats as endpoints has no headroom, and the page's whole purpose is
 * to show how much is left — a donut reading 100% would say nothing.
 */
/**
 * The estate-wide patch defaults, and the vendor lifecycle text beside them.
 *
 * Every value is the approved Global Settings sub-tab's own: three rings at
 * 0/2, 7/7 and 14/10 days, a 20:00–02:00 window on Tuesday to Thursday,
 * prompt-and-force restarts, three postponements, and third-party updates
 * held for admin approval after a five-day observation.
 *
 * The lifecycle rows are reference text, which is why the panel says so:
 * the console cannot verify a vendor's published dates and does not pretend
 * to. Only Windows 10's is a hard fact with a date attached, because it has
 * actually ended.
 */
function seedPatchSettings(db: Db): void {
  /*
   * The rings target real device groups. The reference's own ids belong to
   * its fixture, not this one, so each ring takes a group the console
   * actually has — a ring pointing at a group that does not exist patches
   * nobody, and every ring would read "0 endpoints".
   */
  const rings = [
    {
      id: 'ring-pilot',
      name: 'Pilot',
      groupId: 'grp-finance',
      deferDays: 0,
      deadlineDays: 2,
      excludedPatchIds: [],
    },
    {
      id: 'ring-broad',
      name: 'Broad',
      groupId: 'grp-win-ws',
      deferDays: 7,
      deadlineDays: 7,
      excludedPatchIds: [],
    },
    {
      id: 'ring-late',
      name: 'Late',
      groupId: 'grp-linux',
      deferDays: 14,
      deadlineDays: 10,
      excludedPatchIds: [],
    },
  ];

  db.prepare(
    `INSERT INTO patch_settings
       (id, highly_vulnerable_critical, highly_vulnerable_total, vulnerable_total,
        disable_built_in_updates, hide_check_for_updates,
        group_overrides, major_versions, rings, maintenance, approval)
     VALUES (1,?,?,?,1,1,'[]',?,?,?,?)`,
  ).run(
    2,
    6,
    2,
    JSON.stringify({
      windows: { holdDays: 90, stayOnVersion: null },
      macos: { holdDays: 60, stayOnVersion: null },
      linux: { holdDays: 30, stayOnVersion: null },
    }),
    JSON.stringify(rings),
    JSON.stringify({
      // Tuesday to Thursday, as the reference highlights them.
      days: [1, 2, 3],
      from: '20:00',
      to: '02:00',
      restartBehaviour: 'prompt',
      wakeOnLan: false,
      userPostponesAllowed: 3,
    }),
    JSON.stringify({
      autoApproveAfterFirstRing: true,
      observationDays: 5,
      thirdPartyUpdates: 'approval',
      catalogSyncHours: 24,
      declinedVendors: ['Zoom'],
    }),
  );

  /*
   * Keyed on what the estate reports — `os_family` and `os_version` — not on
   * the vendor's marketing name. A row reading "Windows 11" joins nothing
   * when every device says "Windows" and "24H2", which is how this table
   * first rendered a column of dashes.
   */
  const lifecycle: readonly (readonly [string, string, string | null, boolean])[] = [
    ['Windows', '24H2', 'Oct 2027 (Enterprise/Education) · Oct 2026 (Home/Pro)', false],
    ['Windows', '23H2', 'Nov 2026 (Enterprise/Education) · Nov 2025 (Home/Pro)', false],
    ['Windows', '22H2', 'Ended 14 Oct 2025 · security only with ESU', true],
    ['Windows Server', '21H2', 'Mainstream to Oct 2026 · extended to Oct 2031', false],
    ['Windows Server', '1809', 'Ended 9 Jan 2024', true],
    ['Windows Server', '1607', 'Extended support to Jan 2027', false],
    ['macOS', '15.1', 'Apple does not publish dates; recent versions get security updates', false],
    ['macOS', '14.7', 'Apple does not publish dates; recent versions get security updates', false],
    ['macOS', '13.7', 'Two releases behind; security updates are not guaranteed', true],
    ['Linux', '9.4', 'Standard support to Apr 2029', false],
    ['Linux', '8.10', 'Standard support to May 2029', false],
    ['Linux', '24.04 LTS', 'Standard support to Apr 2029', false],
    ['Linux', '22.04 LTS', 'Standard support to Apr 2027', false],
    ['Linux', '20.04 LTS', 'Ended 31 May 2025 · ESM only', true],
    ['AIX', '7.3 TL2', 'Supported; verify the technology level with IBM', false],
  ];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO os_lifecycle (os,version,vendor_support,end_of_life) VALUES (?,?,?,?)`,
  );
  db.transaction(() => {
    for (const [os, version, support, eol] of lifecycle)
      insert.run(os, version, support, eol ? 1 : 0);
  })();
}

function seedLicenses(db: Db, deviceCount: number): void {
  const modules: readonly (readonly [string, string, 'included' | 'add-on' | 'preview'])[] = [
    ['mod-endpoint', 'Endpoint Management', 'included'],
    ['mod-patch', 'Patch Management', 'included'],
    ['mod-liveops', 'Live Activity', 'included'],
    ['mod-dex', 'Digital Employee Experience', 'included'],
    ['mod-zones', 'Aegis Zones & Peer Cache', 'included'],
    ['mod-vuln', 'Vulnerability Management', 'add-on'],
    ['mod-insight', 'AEGIS Insight', 'preview'],
  ];

  db.transaction(() => {
    /*
     * The term runs a financial year and the page counts the days left from
     * it. Both ends are stored, so "renews in N days" is arithmetic against
     * the clock rather than a number anyone had to maintain.
     */
    db.prepare(
      `INSERT INTO license (id,plan,seats_total,starts_at,ends_at) VALUES (1,?,?,?,?)`,
    ).run(
      'Premium',
      Math.round(deviceCount * 1.1),
      iso(NOW - 226 * 86_400_000).slice(0, 10),
      iso(NOW + 138 * 86_400_000).slice(0, 10),
    );

    const insert = db.prepare(
      `INSERT INTO license_modules (id,name,tier,enabled,counts_against_seats,seq)
       VALUES (?,?,?,?,?,?)`,
    );
    modules.forEach(([id, name, tier], i) =>
      insert.run(
        id,
        name,
        tier,
        // A preview is offered, not active: six of seven, as the page counts.
        tier === 'preview' ? 0 : 1,
        tier === 'preview' ? 0 : 1,
        i,
      ),
    );
  })();
}

/**
 * The seven services the approved System Health page lists, in its order.
 *
 * Three of the seven carry no stored signal: the agent gateway, the peer
 * cache controller and the notification service are counted from the estate
 * when the page is read, because the console already knows how many agents
 * are online, how many zones are delivering badly and how many notifications
 * are queued. Storing those would be storing an answer that can go stale
 * against the data it came from. `derived` names which figure replaces the
 * placeholder.
 */
function seedServiceHealth(db: Db, rng: Rng): void {
  const insert = db.prepare(
    `INSERT INTO service_health (id,component,status,signal,detail,derived,checked_at,seq)
     VALUES (?,?,?,?,?,?,?,?)`,
  );

  const services: readonly (readonly [string, string, string, string, string | null])[] = [
    ['Console API', 'healthy', '31 ms', 'Responding Normally', null],
    ['Agent Gateway', 'healthy', '—', 'Agents Connected', 'agents'],
    ['Patch Catalog Sync', 'healthy', '25 min ago', 'Last Successful Sync', null],
    ['Directory Sync', 'healthy', '7 min ago', 'Entra ID and LDAP', null],
    ['Peer Cache Controller', 'degraded', '—', 'Below delivery threshold', 'peercache'],
    ['Notification Service', 'healthy', '—', 'Email and Webhooks', 'notifications'],
    ['Database', 'healthy', '59% used', 'Storage and Backups', null],
  ];

  db.transaction(() => {
    services.forEach(([component, status, signal, detail, derived], i) =>
      insert.run(
        `svc-${i + 1}`,
        component,
        status,
        signal,
        detail,
        derived,
        // Checked a few minutes ago, as a health page's own figures are.
        iso(NOW - rng.int(60_000, 600_000)),
        i,
      ),
    );

    seedHealthEvents(db, rng);
  })();
}

/**
 * A day of logged events for the Events panel.
 *
 * Warnings cluster and errors are rare, which is what a real day looks like:
 * a handful of noisy hours rather than an even spread. The panel's whole
 * point is to show when something went wrong, so an even spread would hide
 * the only thing it has to say.
 */
function seedHealthEvents(db: Db, rng: Rng): void {
  const insert = db.prepare(`INSERT INTO health_events (id,at,level,message) VALUES (?,?,?,?)`);

  const warnings = [
    'Agent check-in retried after timeout',
    'Patch catalogue sync slower than expected',
    'Peer cache delivery below threshold in Jaipur Branch',
    'Notification webhook retried',
    'Directory page fetch retried',
  ];
  const errors = [
    'Peer cache election failed, retrying',
    'Notification webhook gave up after 3 attempts',
    'Patch catalogue sync failed',
  ];

  let n = 0;
  for (let hour = 23; hour >= 0; hour--) {
    /*
     * Four hours of the day are busy and the rest are quiet. The busy hours
     * are picked from the hour index rather than drawn, so the shape of the
     * chart is the same for a given seed.
     */
    const busy = hour % 7 === 2 || hour % 11 === 3;
    const warningCount = busy ? rng.int(3, 5) : rng.int(0, 2);
    const errorCount = busy && hour % 7 === 2 ? 1 : 0;

    for (let i = 0; i < warningCount; i++) {
      n += 1;
      insert.run(
        `evt-${String(n).padStart(4, '0')}`,
        iso(NOW - hour * 3_600_000 - rng.int(0, 3_500_000)),
        'warning',
        warnings[n % warnings.length] ?? 'Warning',
      );
    }
    for (let i = 0; i < errorCount; i++) {
      n += 1;
      insert.run(
        `evt-${String(n).padStart(4, '0')}`,
        iso(NOW - hour * 3_600_000 - rng.int(0, 3_500_000)),
        'error',
        errors[n % errors.length] ?? 'Error',
      );
    }
  }
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
