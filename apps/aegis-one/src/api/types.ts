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

/** The device tab's own row, which is not the contract's Finding. */
export type Vulnerability = {
  id: string;
  title: string;
  severity: string;
  cvss: number;
  exploited: boolean;
  publishedAt: string;
  affects: string;
  fixedBy: string;
  state: string;
  firstSeenAt: string;
};

export type Severity = 'critical' | 'high' | 'medium' | 'low';

/** The contract's eight threat indicators, in the order the page lists them. */
export type ThreatIndicator =
  | 'known-exploited'
  | 'exploit-available'
  | 'ransomware'
  | 'wormable'
  | 'zero-day'
  | 'remote'
  | 'malware'
  | 'no-fix';

export type FindingState = 'open' | 'in-remediation' | 'accepted' | 'resolved';
export type SlaState = 'within' | 'due-soon' | 'overdue';

/** The contract's Finding — one row of the Findings grid. */
export type Finding = {
  id: string;
  cve: string | null;
  checkId: string | null;
  title: string;
  product: string;
  severity: Severity;
  cvss: number;
  priority: number;
  threats: ThreatIndicator[];
  detection: 'new' | 'active' | 'reopened';
  confidence: 'confirmed' | 'potential';
  family: string;
  solution: string;
  fixType: 'patch' | 'workaround';
  port: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  slaDueAt: string;
  projectId: string | null;
  acceptedReason: string | null;
  devices: number;
  ageDays: number;
  sla: SlaState;
  state: FindingState;
};

/** The contract's VulnerabilitySummary: the six KPIs and the six widgets. */
export type VulnerabilitySummary = {
  exposureScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  openFindings: number;
  devicesAffected: number;
  criticalAndHigh: number;
  knownExploited: number;
  slaOverdue: number;
  scanCoverage: { scanned: number; total: number };
  bySeverity: Record<Severity, number>;
  /** Twelve weeks of open findings, stacked by severity. */
  trend: {
    date: string;
    open: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }[];
  sla: { within: number; dueSoon: number; overdue: number };
  age: { bucket: string; count: number }[];
  topPriorities: Finding[];
  topFixes: { fix: string; findings: number; devicesMissing: number }[];
  threatIndicators: { indicator: ThreatIndicator; count: number }[];
};

/** One row of the Devices tab, ranked by exposure. */
export type VulnerableDevice = {
  deviceId: string;
  name: string;
  os: string;
  ip: string;
  site: string;
  criticality: number;
  scanMethod: 'agent' | 'credentialed-network' | 'not-scanned';
  exposure: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  lastScan: string;
};

/** One row of the Remediations tab: a fix, not a CVE. */
export type Remediation = {
  id: string;
  fix: string;
  highestSeverity: Severity;
  fixType: 'patch' | 'workaround';
  riskReducedPct: number;
  cves: string[];
  findings: number;
  devicesMissing: number;
};

export type VulnerabilityProject = {
  id: string;
  name: string;
  owner: string;
  due: string;
  /** Measured against the server's clock, so the page need not know "now". */
  dueInDays: number;
  progressPct: number;
  findings: number;
};

export type ScanTemplate =
  'full-vulnerability' | 'critical-and-exploited-quick' | 'configuration-audit' | 'discovery';

export type Scan = {
  id: string;
  name: string;
  template: ScanTemplate;
  schedule: string;
  status: JobStatus;
  startedAt: string;
  finishedAt: string | null;
  durationLabel: string;
  scope: string;
  devicesScanned: number;
  findingsOpened: number;
  findingsFixed: number;
};

/** The contract's DeploymentStatus. */
export type DeploymentStatus =
  'queued' | 'scheduled' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

/** The contract's DeploymentSummary, plus the fields the detail page reads. */
export type Deployment = {
  id: string;
  name: string;
  type: string;
  status: DeploymentStatus;
  package: string;
  targetCount: number;
  targetPreview: string[];
  counts: { done: number; failed: number; pending: number };
  triggeredBy: string;
  triggeredAt: string;
  startsAt: string | null;
  completedAt: string | null;
  wakeOfflineFirst: boolean;
  notes: string | null;
};

/** The six counters above the Deployments grid, one per filter tile. */
export type DeploymentsSummary = {
  all: number;
  active: number;
  scheduled: number;
  completed: number;
  withFailures: number;
  pausedOrCancelled: number;
};

export type LiveJobKind = 'live-data' | 'script' | 'log-collection';

export type JobStatus =
  'queued' | 'running' | 'completed' | 'completed-with-failures' | 'failed' | 'cancelled';

export type EndpointJobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'timed-out' | 'cancelled' | 'offline';

/** The contract's LiveJob. */
export type LiveJob = {
  id: string;
  title?: string;
  kind: LiveJobKind;
  status: JobStatus;
  targetCount: number;
  counts: {
    queued?: number;
    running?: number;
    succeeded?: number;
    failed?: number;
    timedOut?: number;
    offline?: number;
    cancelled?: number;
  };
  submittedBy: string;
  submittedAt: string;
  changeRef?: string | null;
  scriptLanguage?: string;
};

/** One endpoint's row in the Task Results grid. */
export type LiveJobResult = {
  deviceId: string;
  deviceName: string;
  status: EndpointJobStatus;
  connection?: 'online' | 'offline';
  actionId?: string;
  actionType?: 'LIVE_QUERY' | 'RUN_SCRIPT' | 'COLLECT_LOGS';
  exitCode?: number | null;
  reason?: string;
  detail?: string;
  stdout?: string | null;
  stderr?: string | null;
  queuedAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

/** The contract's Group: a node in the tree, with its rolled-up figures. */
export type DeviceGroup = {
  id: string;
  name: string;
  kind: 'static' | 'dynamic';
  parentId: string | null;
  members: number;
  online: number;
  offline: number;
  missingPatches: number;
  subGroups: number;
};

/** The contract's GroupsSummary — the four counters above the tree. */
export type GroupsSummary = {
  groups: number;
  subGroups: number;
  grouped: number;
  notGrouped: number;
};

/**
 * The contract's AuditEntry. Narrower than the console's own audit row, which
 * the Administration log reads: this is what an object's own history shows.
 */
export type GroupHistoryEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  ip?: string;
  outcome?: string;
};

/** The contract's GroupDetail: a Group plus what the detail pane's tabs read. */
export type GroupDetail = DeviceGroup & {
  rule: string | null;
  policies: string[];
  history: GroupHistoryEntry[];
};

/** The four frameworks the check library maps into. */
export type Framework = 'cis' | 'stig' | 'pci-dss' | 'hipaa';

export type PlatformFamily = 'windows' | 'macos' | 'linux' | 'aix';

/** Checks carry High, Medium or Low; the Critical step is never used here. */
export type CheckSeverity = 'high' | 'medium' | 'low';

export type FrameworkTag = { framework: Framework; ref: string };

export type ConfigCheck = {
  id: string;
  title: string;
  category: string;
  platform: PlatformFamily;
  severity: CheckSeverity;
  expected: string;
  frameworks: FrameworkTag[];
  passing: number;
  failing: number;
  exceptions: number;
  /** Null where the library has no check for any device in scope. */
  compliancePct: number | null;
  remediation: 'automatic' | 'manual';
  custom: boolean;
};

export type CheckResult = 'pass' | 'fail' | 'exception';

export type ConfigCheckDetail = {
  check: ConfigCheck;
  results: {
    deviceId: string;
    name: string;
    os: string;
    site: string;
    actual: string;
    result: CheckResult;
  }[];
};

export type ConfigDevice = {
  deviceId: string;
  name: string;
  os: string;
  site: string;
  user: string;
  compliancePct: number;
  failing: number;
  highFailing: number;
  exceptions: number;
  lastEvaluated: string;
};

export type ConfigDeviceDetail = {
  deviceId: string;
  name: string;
  os: string;
  site: string;
  user: string;
  compliancePct: number;
  passing: number;
  failing: number;
  exceptions: number;
  failedChecks: {
    id: string;
    title: string;
    category: string;
    severity: CheckSeverity;
    expected: string;
    actual: string;
    remediation: 'automatic' | 'manual';
  }[];
};

export type ConfigException = {
  id: string;
  checkId: string;
  checkTitle: string;
  scope: string;
  reason: string;
  grantedBy: string;
  grantedAt: string;
  /** Null for an exception granted with no expiry. */
  expiresAt: string | null;
};

export type Benchmark = {
  id: string;
  framework: Framework;
  name: string;
  version: string;
  /** Null for a benchmark that applies to every platform. */
  platform: PlatformFamily | null;
  assignedGroupId: string | null;
  assignedTo: string;
  devices: number;
  checks: number;
  compliancePct: number;
};

export type ConfigProfile = {
  id: string;
  name: string;
  platform: PlatformFamily;
  assignedDevices: number;
  compliancePct: number;
  status: 'active' | 'draft' | 'preview';
  modifiedAt: string;
  version: number;
};

export type ConfigProfileDetail = {
  profile: ConfigProfile;
  settings: { setting: string; values: { version: number; value: string }[] }[];
};

/** The four categories the Reports library counts. */
export type ReportCategory = 'computers-software' | 'daily-operations' | 'security' | 'leadership';

/** One card in the Reports library. */
export type ReportCard = {
  id: string;
  title: string;
  category: ReportCategory;
  description: string;
  unit: string;
  total: number;
  charts: number;
  columns: number;
  headline: { label: string; value: string };
  /** The largest group of the report's first chart. */
  secondary?: { label: string; value: string };
  /** That first breakdown, for the figure drawn on the card. */
  preview: { label: string; value: number }[];
  favorite: boolean;
};

/** A report's counters and charts, before its rows are fetched. */
export type ReportSummary = {
  id: string;
  title: string;
  description: string;
  unit: string;
  total: number;
  kpis: { label: string; value: number }[];
  charts: { title: string; field: string; data: { label: string; value: number }[] }[];
  columns: { id: string; header: string }[];
};

/** A page of a report's rows, in the catalogue's own column order. */
export type ReportRowPage = {
  columns: { id: string; header: string }[];
  rows: Record<string, string | number | boolean | null>[];
  page: { nextCursor: string | null; total: number };
};

/** One endpoint's experience measures, and what its score lost. */
export type DexDevice = {
  deviceId: string;
  name: string;
  score: number;
  bootSeconds: number;
  cpuPct: number;
  memoryPct: number;
  diskFreePct: number;
  os: string;
  site: string;
  band: 'good' | 'warning' | 'poor';
  /** Empty when every measure is inside its threshold. */
  penalties: { reason: string; points: number }[];
};

/**
 * The experience score, how it is made up, what is dragging it down, and the
 * thresholds it is scored against.
 */
export type DexSummary = {
  score: number;
  distribution: { good: number; warning: number; poor: number };
  breakdown: { measure: string; score: number }[];
  topIssues: { issue: string; endpoints: number }[];
  method: { measure: string; threshold: string; points: number }[];
};

/**
 * Everything above the Checks grid: the five counters, the four widgets and
 * the Security Posture rings on the Profiles tab.
 */
export type ConfigurationSummary = {
  overallPct: number;
  checksInScope: number;
  failingChecks: number;
  nonCompliantDevices: { count: number; total: number };
  exceptions: number;
  byFramework: { framework: Framework; compliancePct: number }[];
  byPlatform: { platform: PlatformFamily; compliancePct: number; devices: number }[];
  deviceBands: { high: number; medium: number; low: number };
  byCategory: { category: string; compliancePct: number }[];
  topFailing: ConfigCheck[];
  posture: {
    protectedCount: number;
    needsReview: number;
    notProtected: number;
    controls: {
      control: 'disk-encryption' | 'antivirus' | 'firewall';
      protectedCount: number;
      notProtected: number;
      compliancePct: number;
    }[];
    evaluatedDevices: number;
  };
};

/**
 * One diagnostic run: the endpoint it was made against, what the failing
 * checks taken together point at, every check with its own severity, and the
 * actions that would address them.
 */
export type InsightRun = {
  id: string;
  status: 'running' | 'completed' | 'remediated' | 'verified';
  device?: {
    id: string;
    name: string;
    user?: string;
    os?: string;
    dexScore?: number;
  };
  rootCause?: {
    summary: string;
    /** How far the failing checks agree, 0-100. */
    confidencePct: number;
  };
  checks: {
    name: string;
    result: 'pass' | 'fail' | 'warn' | 'pending';
    severity?: 'critical' | 'high' | 'medium' | 'low';
    detail?: string;
  }[];
  recommendations: {
    id: string;
    title: string;
    /** What the action should achieve, e.g. "+8 DEX points". */
    expected?: string;
    risk?: 'low' | 'medium' | 'high';
  }[];
};

/** A saved problem description, so a common report need not be retyped. */
export type InsightTemplate = {
  id: string;
  name: string;
  description: string;
};

export type Zone = {
  id: string;
  name: string;
  city: string;
  devices: number;
  connectivityPct: number;
  bandwidthMbps: number;
  /** "none" is a zone with no cache; "disabled" is one switched off. */
  peerCache: 'elected' | 'none' | 'disabled';
  lastSync: string;
  status: 'healthy' | 'degraded' | 'offline';
};

/**
 * Where content comes from and what that saves: the five counters, the two
 * shares behind the donut, one efficiency figure per zone, and the four hops
 * of the delivery path.
 */
export type ZoneList = {
  items: Zone[];
  summary: {
    wanSavedPct: number;
    avoidedThisWeekGb: number;
    hitRatePct: number;
    directPct: number;
    avgLocalMbps: number;
  };
  delivery: {
    distribution: { source: string; pct: number }[];
    efficiency: { zone: string; pct: number }[];
    path: { hop: number; label: string; detail: string; metric: string | null }[];
  };
};

/**
 * One zone's peer cache: the endpoint currently elected to cache for it, and
 * what that endpoint is holding. A peer cache is a regular agent, not an
 * appliance, so `deviceId` points at a device the Devices page also knows.
 */
export type PeerCache = {
  zoneId: string;
  zone: string;
  enabled: boolean;
  deviceId: string | null;
  currentPeer: string | null;
  /** null where nothing is elected: there is no agent to report on. */
  agentHealth: 'healthy' | 'degraded' | 'unreachable' | null;
  /** What the cache holds, as the Content Cached column prints it. */
  contentCached: string[];
  cacheSizeGb: number;
  lastTransfer: string | null;
  /** The health the Status column prints, not a lifecycle state. */
  status: 'healthy' | 'warning' | 'disabled';
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
  fileTypes: string[];
  status: 'uploaded' | 'waiting' | 'failed' | 'skipped';
  sizeBytes: number;
  collectedAt: string;
  emailed: boolean;
};

/** The five counters above the Log Collection grid. */
export type LogStats = {
  bundlesStored: number;
  hostsCovered: number;
  failedOrWaiting: number;
  storageUsedMb: number;
  nextScheduled: string | null;
};

export type LogSchedule = {
  id: string;
  name: string;
  sources: string[];
  targets: { deviceIds?: string[]; groupIds?: string[]; zone?: string };
  cadence: 'daily' | 'weekly' | 'monthly';
  runs?: number;
  delivery?: 'store-only' | 'email-link' | 'email-attachment';
  nextRunAt: string;
  lastRunAt?: string | null;
  enabled: boolean;
};

export type LogSettings = {
  retentionDays: number;
  emailBundles: boolean;
  recipients?: string[];
  rootPath?: string;
  folderLayout?: 'date-hostname' | 'hostname-date';
  fileNamePattern?: string;
  maxBundleSizeMb?: number;
  sendAs?: 'link' | 'attachment-when-small';
  attachmentLimitMb?: number;
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

/** Every state a connector, destination or channel can report. */
export type IntegrationStatus = 'connected' | 'attention' | 'disabled' | 'not-configured' | 'error';

/** One card on the Connectors tab: what it is for, and what it was granted. */
export type Connector = {
  id: string;
  name: string;
  kind: 'itsm' | 'siem' | 'chat' | 'webhook' | 'identity';
  status: IntegrationStatus;
  purpose: string;
  scope: string | null;
  lastActivity: string | null;
  logoUrl: string | null;
};

/** A log target on the SIEM & Syslog tab. */
export type SiemDestination = {
  id: string;
  name: string;
  transport: string;
  protocol: 'syslog-tls' | 'syslog-udp' | 'https';
  status: 'connected' | 'not-configured' | 'error';
  host: string | null;
  port: number | null;
  eventTypes: number;
  lastSentAt: string | null;
  ratePerHour: number | null;
  enabled: boolean;
};

/** A place an alert rule can send to. */
export type NotificationChannel = {
  id: string;
  name: string;
  transport: string;
  status: 'connected' | 'not-configured' | 'error';
  eventTypes: number | null;
  lastSentAt: string | null;
  ratePerHour: number | null;
};

/**
 * One row of the Alert Rules table. A rule fans out to several channels,
 * which is why Send To lists more than one and Channel Status lists a state
 * for each.
 */
export type NotificationRule = {
  id: string;
  event: string;
  channels: { id: string; name: string; status: 'connected' | 'not-configured' | 'error' }[];
  enabled: boolean;
};

/** One attempt at forwarding one event. */
export type DeliveryAttempt = {
  id: string;
  connector: string;
  eventType: string;
  event: string;
  at: string;
  outcome: 'delivered' | 'failed' | 'retrying';
  httpStatus: number | null;
};

/** The contract's User: one console account and the access it has. */
export type ConsoleUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  zoneIds: string[];
  mfaEnrolled: boolean;
  disabled: boolean;
  lastSignIn: string | null;
};

/**
 * One card on the Identity & SSO tab. A provider can be configured and
 * switched off, or switched on and not yet configured, which is why the card
 * prints STATUS and CONNECTION as two separate fields.
 */
export type IdentityProvider = {
  id: string;
  name: string;
  protocol: 'oidc' | 'saml' | 'ldap';
  description: string;
  enabled: boolean;
  status: 'connected' | 'not-configured' | 'error';
  mfaRequired: boolean;
};

/** The contract's AgentEnrollmentSettings. */
export type AgentEnrollmentSettings = {
  requireToken: boolean;
  autoAssignGroup: string | null;
  tokenMaxAgeDays: number;
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

/** The contract's EnrollmentToken. The secret is never returned after creation. */
export type EnrollmentToken = {
  id: string;
  name: string;
  targetGroup: string | null;
  createdAt: string;
  expiresAt: string;
  uses: number;
  maxUses: number | null;
  status: 'active' | 'expired' | 'revoked';
};

/** One of the four ways an endpoint can be enrolled, and where it stands. */
export type EnrollmentMethod = {
  id: string;
  name: string;
  description: string;
  state: 'ready' | 'configured' | 'available' | 'not-configured';
};

/** The contract's EnrollmentSummary: the four counters, the split and the commands. */
export type EnrollmentSummary = {
  enrolled: number;
  online: number;
  onLatestAgent: number;
  latestAgentVersion: string;
  activeTokens: number;
  totalTokens: number;
  notCheckingIn: number;
  byPlatform: { windows: number; macos: number; linux: number };
  installCommands: { windows: string; macos: string; linux: string };
  methods: EnrollmentMethod[];
};

/**
 * The contract's RoleDef. The three scope lists are what the approved card
 * prints side by side; an empty list means "everything", not "nothing".
 */
export type RoleDefinition = {
  id: string;
  name: string;
  permissions: string[];
  system: boolean;
  zoneIds: string[];
  softwareCategories: string[];
  groupIds: string[];
  userCount: number;
};

/**
 * The licence as the approved page reads it: one agreement, its seats, its
 * term and the modules it covers. Seats and the platform split are counted
 * from the estate, so they cannot disagree with the Devices page.
 */
export type License = {
  /** When the licence was read; days remaining count from this. */
  asOf: string;
  plan: string;
  seats: {
    inUse: number;
    total: number;
    /** `other` carries anything outside the three, so the split adds up. */
    byPlatform: { windows?: number; macos?: number; linux?: number; other?: number };
  };
  term: { startsAt: string; endsAt: string };
  modules: LicenseModule[];
};

/** One module card. A preview is offered but not counted against seats. */
export type LicenseModule = {
  id: string;
  name: string;
  tier: 'included' | 'add-on' | 'preview';
  enabled: boolean;
  countsAgainstSeats: boolean;
};

/**
 * The contract's Health: what the System Health page reads. Three of the
 * services' signals are counted from the estate when the page is read, so
 * they cannot drift from the Devices and Aegis Zones pages.
 */
export type Health = {
  /** When these checks ran; the events panel buckets against this. */
  asOf: string;
  summary: {
    servicesHealthy: number;
    servicesTotal: number;
    degraded: number;
    agentsConnected: number;
    agentsTotal: number;
    warnings24h: number;
  };
  services: {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    signal: string;
    detail: string;
  }[];
  events: { at: string; level: 'info' | 'warning' | 'error'; message: string }[];
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

export type InsightFinding = {
  id: string;
  severity: string;
  title: string;
  detail: string;
  action?: { label: string; page: string; filter?: Record<string, string> };
};
