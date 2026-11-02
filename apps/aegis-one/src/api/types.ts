/**
 * Row shapes the console reads.
 *
 * These are type aliases rather than interfaces on purpose: TanStack Table's
 * `RowData` constraint is `Record<string, any> | any[]`, and an interface has
 * no implicit index signature, so an interface would not satisfy it.
 */

export type Device = {
  id: string;
  hostname: string;
  status: string;
  osFamily: string;
  osName: string;
  osVersion: string;
  osBuild: string;
  kind: string;
  zoneId: string;
  zoneName: string;
  primaryUser: string;
  primaryUserName: string;
  department: string;
  ip: string;
  mac: string;
  /** Fully-qualified name, e.g. lnx-blr-131.corp.aegis.example. */
  dnsName: string;
  dnsServer: string;
  architecture: string;
  manufacturer: string;
  lastBoot: string;
  serial: string;
  model: string;
  cpu: string;
  ramGb: number;
  diskTotalGb: number;
  diskFreePct: number;
  agentVersion: string;
  lastSeenAt: string;
  enrolledAt: string;
  compliancePct: number;
  pendingPatches: number;
  criticalVulns: number;
  dexScore: number;
  encrypted: boolean;
  rebootPending: boolean;
  configPassPct: number;
};

export type SoftwareTitle = {
  id: string;
  title: string;
  publisher: string;
  category: string;
  latestVersion: string;
  sizeMb: number;
  platform: string;
  /** A same-origin path, set once an administrator imports icons. */
  logoUrl: string | null;
  installer: 'missing' | 'added';
  installerSha256: string | null;
  state: 'draft' | 'published';
  silentInstallCommand: string;
  silentUninstallCommand: string;
  installCount: number;
  outdatedCount: number;
};

/** The five counters above the catalogue. They describe the whole catalogue. */
export type SoftwareCounts = {
  all: number;
  installerAdded: number;
  installerMissing: number;
  draft: number;
  publishers: number;
};

export type PatchApproval = 'approved' | 'test' | 'review' | 'declined' | 'superseded';

export type Patch = {
  id: string;
  title: string;
  kb: string | null;
  platform: string;
  severity: string;
  category: string;
  /** Only set for driver-bios, which the Drivers & BIOS tab splits in two. */
  subcategory: string;
  /** The publisher, shown in the Vendor column. */
  source: string;
  approval: PatchApproval;
  supersededBy: string | null;
  ring: string;
  zeroDay: boolean;
  releasedAt: string;
  /** Endpoints it applies to and has not reached. The grid's Applicable column. */
  endpointsMissing: number;
  /** Endpoints evaluated against it, whatever the outcome. */
  applicableCount: number;
  /** Endpoints it is installed on. The grid's Remediated column. */
  installedCount: number;
  failedCount: number;
  rebootRequired: boolean;
};

export type PatchPolicy = {
  id: string;
  name: string;
  content: string;
  patchCount: number;
  rollout: string[];
  computers: number;
  compliancePct: number;
  schedule: string;
  nextRunAt: string | null;
  status: 'active' | 'suspended' | 'draft';
};

export type PatchTabStats = {
  key: string;
  compliancePct: number;
  endpointsMissing: number;
  endpointsTotal: number;
  criticalUpdates: number;
  updatesAvailable: number;
  updatesMissing: number;
};

export type PatchSummary = {
  compliancePct: number;
  missingCritical: number;
  /** Distinct critical updates still outstanding, which is what the header counts. */
  criticalUpdates: number;
  awaitingApproval: number;
  failedInstalls: number;
  installed: number;
  missing: number;
  devicesTotal: number;
  devicesMissing: number;
  criticalDevices: number;
  averageAgeDays: number;
  devicesAwaitingRestart: number;
  vendors: string[];
  byOsVersion: { label: string; platform: string; compliantPct: number; endpoints: number }[];
  bySeverity: { critical: number; high: number; medium: number; low: number };
  byAge: { bucket: string; count: number }[];
  topMissing: Patch[];
  devicesNeedingAttention: {
    deviceId: string;
    name: string;
    osVersion: string;
    critical: number;
    missing: number;
  }[];
  bySource: {
    source: string;
    updates: number;
    missing: number;
    critical: number;
    endpointsAffected: number;
    compliancePct: number;
  }[];
  tabs: {
    platforms: PatchTabStats[];
    driversBios: {
      endpointsNeeding: number;
      endpointsTotal: number;
      bios: number;
      drivers: number;
      awaitingApproval: number;
    };
    all: {
      total: number;
      applicable: number;
      remediated: number;
      failed: number;
      declined: number;
      superseded: number;
      zeroDayCves: number;
    };
  };
  policies: {
    active: number;
    total: number;
    computersCovered: number;
    computersTotal: number;
    highlyVulnerable: number;
  };
};

export type Vulnerability = {
  id: string;
  title: string;
  severity: string;
  cvss: number;
  exploited: boolean;
  publishedAt: string;
  affects: string;
  fixedBy: string;
  affectedCount: number;
  remediatedCount: number;
};

export type Deployment = {
  id: string;
  name: string;
  type: string;
  status: string;
  content: string;
  targetCount: number;
  succeeded: number;
  failed: number;
  pending: number;
  createdAt: string;
  createdBy: string;
  scheduledAt: string | null;
  completedAt: string | null;
  wakeOfflineFirst: boolean;
  notes: string | null;
};

export type LiveJob = {
  id: string;
  name: string;
  kind: string;
  language: string | null;
  reason: string | null;
  status: string;
  targetCount: number;
  completed: number;
  failed: number;
  createdAt: string;
  createdBy: string;
  finishedAt: string | null;
  outputLimitKb: number;
};

export type LiveJobResult = {
  deviceId: string;
  hostname: string;
  state: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  durationMs: number | null;
  finishedAt: string | null;
};

export type DeviceGroup = {
  id: string;
  name: string;
  kind: string;
  rule: string | null;
  memberCount: number;
  createdAt: string;
  createdBy: string;
};

export type ConfigCheck = {
  id: string;
  title: string;
  benchmark: string;
  severity: string;
  platform: string;
  passCount: number;
  failCount: number;
  exceptionCount: number;
};

export type Zone = {
  id: string;
  name: string;
  city: string;
  deviceCount: number;
  peerCache: boolean;
  bandwidthMbps: number;
  relayStatus: string;
  lastSyncAt: string;
};

export type Peer = {
  id: string;
  hostname: string;
  zoneId: string;
  zoneName: string;
  cacheSizeGb: number;
  cacheUsedGb: number;
  servedGb: number;
  peersServed: number;
  status: string;
  lastSeenAt: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  actorRole: string;
  action: string;
  objectType: string;
  objectId: string;
  outcome: string;
  ip: string;
  detail: string | null;
};

export type LogBundle = {
  id: string;
  deviceId: string;
  hostname: string;
  fileTypes: string;
  status: string;
  sizeBytes: number;
  collectedAt: string;
  emailed: boolean;
};

export type Report = {
  id: string;
  name: string;
  category: string;
  description: string;
  schedule: string | null;
  lastRunAt: string | null;
  owner: string;
  custom: boolean;
};

export type Integration = {
  id: string;
  name: string;
  kind: string;
  status: string;
  lastEventAt: string | null;
  events24h: number;
};

export type ConsoleUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  zoneIds: string[];
  status: string;
  lastSignInAt: string | null;
  createdAt: string;
};

export type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type EnrollmentToken = {
  id: string;
  name: string;
  platform: string;
  zoneId: string;
  prefix: string;
  uses: number;
  maxUses: number | null;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
};

export type RoleDefinition = {
  id: string;
  name: string;
  permissions: string[];
  system: boolean;
  zoneIds: string[];
  userCount: number;
};

export type License = {
  id: string;
  product: string;
  entitled: number;
  consumed: number;
  expiresAt: string;
  supportTier: string;
};

export type ServiceHealth = {
  id: string;
  component: string;
  status: string;
  latencyMs: number;
  message: string | null;
  checkedAt: string;
};

export type HealthMeasure = { id: string; label: string; weight: number; score: number };

export type SecurityControl = {
  control: 'disk-encryption' | 'antivirus' | 'firewall';
  protected: number;
  total: number;
};

export type ExpiringItem = {
  kind: 'enrollment-token' | 'api-token' | 'certificate' | 'license';
  name: string;
  expiresAt: string;
};

export type AttentionItem = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  title: string;
  detail: string;
  action: string;
};

export type ActivityItem = {
  id: string;
  name: string;
  type: string;
  status: string;
  targetCount: number;
  counts: { done: number; failed: number; pending: number };
  triggeredBy: string;
  triggeredAt: string;
};

/**
 * The Overview aggregate, in the shape `components.schemas.Overview` declares.
 * Nothing on the page may read a field that is not here, and nothing is here
 * that the contract does not define.
 */
/** The four counts above the inventory grid. */
export type DevicesSummary = {
  all: number;
  online: number;
  offline: number;
  locations: number;
};

export type Overview = {
  counts: {
    managedEndpoints: number;
    online: number;
    highRiskEndpoints: number;
    deviceGroups: number;
    softwarePackages: number;
    patchUpdates: number;
    deployments: number;
    zones: number;
  };
  health: { score: number; band: 'healthy' | 'fair' | 'poor'; measures: HealthMeasure[] };
  patchCompliance: {
    compliantPct: number;
    compliant: number;
    nonCompliant: number;
    missingBySeverity: { critical: number; high: number; medium: number; low: number };
    lastInstall: { successful: number; restartNeeded: number; pending: number; failed: number };
    byOs: { family: string; compliantPct: number }[];
  };
  securityPosture: SecurityControl[];
  deploymentStatus: {
    completed: number;
    queuedOrScheduled: number;
    running: number;
    failed: number;
    paused: number;
  };
  expiring: ExpiringItem[];
  attention: AttentionItem[];
  recentActivity: ActivityItem[];
  updatedAt: string;
};

export type DexSummary = {
  overall: { score: number };
  byDepartment: { department: string; score: number; devices: number }[];
  byZone: { zoneName: string; score: number; devices: number }[];
  distribution: { band: string; devices: number }[];
  lowestScoring: Pick<
    Device,
    'id' | 'hostname' | 'zoneName' | 'department' | 'dexScore' | 'diskFreePct' | 'ramGb'
  >[];
};

export type InsightFinding = {
  id: string;
  severity: string;
  title: string;
  detail: string;
  action?: { label: string; page: string; filter?: Record<string, string> };
};
