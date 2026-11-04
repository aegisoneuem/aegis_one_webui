import type { TableSpec } from '@aegis/mock-core';

/**
 * What each list endpoint may be filtered, sorted and projected by.
 *
 * This is an allowlist, not documentation: a column that is not here cannot
 * reach SQL at all, whatever the client sends. Anything a page needs to sort
 * by has to be added deliberately.
 */

const id = { column: 'id' };

export const devicesSpec: TableSpec = {
  table: 'devices',
  idColumn: 'id',
  searchColumns: ['hostname', 'ip', 'serial', 'primary_user', 'primary_user_name', 'model'],
  alwaysFields: ['id', 'hostname'],
  defaultSort: { field: 'hostname' },
  columns: {
    id,
    hostname: { column: 'hostname', sortable: true, filters: ['eq', 'in', 'like'] },
    status: { column: 'status', sortable: true, filters: ['eq', 'in', 'ne'] },
    osFamily: { column: 'os_family', sortable: true, filters: ['eq', 'in'] },
    osName: { column: 'os_name', sortable: true, filters: ['eq', 'in'] },
    osVersion: { column: 'os_version', sortable: true, filters: ['eq', 'in'] },
    osBuild: { column: 'os_build' },
    kind: { column: 'kind', sortable: true, filters: ['eq', 'in'] },
    zoneId: { column: 'zone_id', filters: ['eq', 'in'] },
    zoneName: { column: 'zone_name', sortable: true, filters: ['eq', 'in'] },
    primaryUser: { column: 'primary_user', sortable: true, filters: ['eq', 'in', 'like'] },
    primaryUserName: { column: 'primary_user_name', sortable: true, filters: ['like'] },
    department: { column: 'department', sortable: true, filters: ['eq', 'in'] },
    ip: { column: 'ip', sortable: true, filters: ['eq', 'like'] },
    mac: { column: 'mac' },
    /*
     * Named as the contract's Device schema names them. The older fields
     * above still carry the mock server's own names; reconciling those means
     * moving six pages at once, and is tracked in docs/devices-restoration.md.
     */
    dnsName: { column: 'dns_name', sortable: true, filters: ['eq', 'like'] },
    dnsServer: { column: 'dns_server', sortable: true, filters: ['eq'] },
    architecture: { column: 'architecture', sortable: true, filters: ['eq', 'in'] },
    manufacturer: { column: 'manufacturer', sortable: true, filters: ['eq', 'in'] },
    lastBoot: { column: 'last_boot_at', sortable: true, filters: ['gte', 'lte'] },
    serial: { column: 'serial', sortable: true, filters: ['eq', 'like'] },
    model: { column: 'model', sortable: true, filters: ['eq', 'in'] },
    cpu: { column: 'cpu' },
    ramGb: { column: 'ram_gb', sortable: true, filters: ['eq', 'gte', 'lte'] },
    diskTotalGb: { column: 'disk_total_gb', sortable: true },
    diskFreePct: { column: 'disk_free_pct', sortable: true, filters: ['gte', 'lte'] },
    agentVersion: { column: 'agent_version', sortable: true, filters: ['eq', 'in'] },
    lastSeenAt: { column: 'last_seen_at', sortable: true, filters: ['gte', 'lte'] },
    enrolledAt: { column: 'enrolled_at', sortable: true, filters: ['gte', 'lte'] },
    compliancePct: { column: 'compliance_pct', sortable: true, filters: ['gte', 'lte'] },
    pendingPatches: { column: 'pending_patches', sortable: true, filters: ['gte', 'lte'] },
    criticalVulns: { column: 'critical_vulns', sortable: true, filters: ['gte', 'lte'] },
    dexScore: { column: 'dex_score', sortable: true, filters: ['gte', 'lte'] },
    encrypted: { column: 'encrypted', sortable: true, filters: ['eq'] },
    rebootPending: { column: 'reboot_pending', sortable: true, filters: ['eq'] },
    configPassPct: { column: 'config_pass_pct', sortable: true, filters: ['gte', 'lte'] },
  },
};

export const softwareSpec: TableSpec = {
  table: 'software',
  idColumn: 'id',
  searchColumns: ['title', 'publisher'],
  defaultSort: { field: 'installCount', desc: true },
  columns: {
    id,
    title: { column: 'title', sortable: true, filters: ['eq', 'like'] },
    publisher: { column: 'publisher', sortable: true, filters: ['eq', 'in'] },
    category: { column: 'category', sortable: true, filters: ['eq', 'in'] },
    latestVersion: { column: 'latest_version' },
    sizeMb: { column: 'size_mb', sortable: true },
    // The contract's own names, for the columns the catalogue cards read.
    platform: { column: 'platform', sortable: true, filters: ['eq', 'in'] },
    logoUrl: { column: 'logo_url' },
    installer: { column: 'installer', sortable: true, filters: ['eq', 'in'] },
    installerSha256: { column: 'installer_sha256' },
    state: { column: 'state', sortable: true, filters: ['eq', 'in'] },
    silentInstallCommand: { column: 'silent_install' },
    silentUninstallCommand: { column: 'silent_uninstall' },
    installCount: { column: 'install_count', sortable: true, filters: ['gte', 'lte'] },
    outdatedCount: { column: 'outdated_count', sortable: true, filters: ['gte', 'lte'] },
  },
};

export const patchesSpec: TableSpec = {
  table: 'patches',
  idColumn: 'id',
  searchColumns: ['title', 'kb'],
  defaultSort: { field: 'releasedAt', desc: true },
  columns: {
    id,
    title: { column: 'title', sortable: true, filters: ['like'] },
    kb: { column: 'kb', sortable: true, filters: ['eq', 'in'] },
    platform: { column: 'platform', sortable: true, filters: ['eq', 'in'] },
    severity: { column: 'severity', sortable: true, filters: ['eq', 'in'] },
    category: { column: 'category', sortable: true, filters: ['eq', 'in'] },
    // The contract's names, for the columns added with the restored page.
    subcategory: { column: 'subcategory', sortable: true, filters: ['eq', 'in'] },
    source: { column: 'source', sortable: true, filters: ['eq', 'in'] },
    approval: { column: 'approval', sortable: true, filters: ['eq', 'in'] },
    supersededBy: { column: 'superseded_by' },
    ring: { column: 'ring', sortable: true, filters: ['eq', 'in'] },
    zeroDay: { column: 'zero_day', filters: ['eq'] },
    releasedAt: { column: 'released_at', sortable: true, filters: ['gte', 'lte'] },
    // applicableCount counts every endpoint evaluated; endpointsMissing is the
    // narrower figure the grid's Applicable column means.
    applicableCount: { column: 'applicable_count', sortable: true },
    endpointsMissing: { column: 'missing_count', sortable: true, filters: ['gte'] },
    installedCount: { column: 'installed_count', sortable: true },
    failedCount: { column: 'failed_count', sortable: true, filters: ['gte'] },
    rebootRequired: { column: 'reboot_required', filters: ['eq'] },
  },
};

export const patchPoliciesSpec: TableSpec = {
  table: 'patch_policies',
  idColumn: 'id',
  searchColumns: ['name', 'content'],
  defaultSort: { field: 'name', desc: false },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    content: { column: 'content' },
    patchCount: { column: 'patch_count', sortable: true },
    rollout: { column: 'rollout' },
    computers: { column: 'computers', sortable: true },
    compliancePct: { column: 'compliance_pct', sortable: true },
    schedule: { column: 'schedule' },
    nextRunAt: { column: 'next_run_at', sortable: true },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
  },
};

/**
 * Field names are the contract's Finding, not the table's. The grid sorts on
 * Priority Rating by default, because that — not CVSS — is the order the page
 * asks an administrator to work in.
 */
export const findingsSpec: TableSpec = {
  table: 'vulnerabilities',
  idColumn: 'id',
  searchColumns: ['id', 'title', 'affects', 'check_id', 'family'],
  defaultSort: { field: 'priority', desc: true },
  columns: {
    id,
    cve: { column: 'id', sortable: true },
    checkId: { column: 'check_id', sortable: true, filters: ['like'] },
    title: { column: 'title', sortable: true, filters: ['like'] },
    product: { column: 'affects', sortable: true, filters: ['eq', 'in'] },
    severity: { column: 'severity', sortable: true, filters: ['eq', 'in'] },
    cvss: { column: 'cvss', sortable: true, filters: ['gte', 'lte'] },
    priority: { column: 'priority', sortable: true, filters: ['gte', 'lte'] },
    threats: { column: 'threats', filters: ['like'] },
    detection: { column: 'detection', sortable: true, filters: ['eq', 'in'] },
    confidence: { column: 'confidence', sortable: true, filters: ['eq'] },
    family: { column: 'family', sortable: true, filters: ['eq', 'in'] },
    solution: { column: 'solution' },
    fixType: { column: 'fix_type', sortable: true, filters: ['eq'] },
    port: { column: 'port' },
    state: { column: 'state', sortable: true, filters: ['eq', 'in'] },
    exploited: { column: 'exploited', sortable: true, filters: ['eq'] },
    publishedAt: { column: 'published_at', sortable: true, filters: ['gte', 'lte'] },
    firstDetectedAt: { column: 'first_detected_at', sortable: true, filters: ['gte', 'lte'] },
    lastDetectedAt: { column: 'last_detected_at', sortable: true },
    slaDueAt: { column: 'sla_due_at', sortable: true, filters: ['gte', 'lte'] },
    projectId: { column: 'project_id', filters: ['eq'] },
    acceptedReason: { column: 'accepted_reason' },
    fixedBy: { column: 'fixed_by' },
    devices: { column: 'affected_count', sortable: true, filters: ['gte'] },
    remediatedCount: { column: 'remediated_count', sortable: true },
  },
};

/** Field names are the contract's Scan. */
export const scansSpec: TableSpec = {
  table: 'vuln_scans',
  idColumn: 'id',
  searchColumns: ['name', 'scope'],
  defaultSort: { field: 'startedAt', desc: true },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    template: { column: 'template', sortable: true, filters: ['eq', 'in'] },
    scope: { column: 'scope', sortable: true },
    schedule: { column: 'schedule' },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    startedAt: { column: 'started_at', sortable: true, filters: ['gte', 'lte'] },
    finishedAt: { column: 'finished_at', sortable: true },
    durationLabel: { column: 'duration_label' },
    devicesScanned: { column: 'devices_scanned', sortable: true },
    findingsOpened: { column: 'findings_opened', sortable: true },
    findingsFixed: { column: 'findings_fixed', sortable: true },
  },
};

/** Field names are the contract's DeploymentSummary, not the table's. */
export const deploymentsSpec: TableSpec = {
  table: 'deployments',
  idColumn: 'id',
  searchColumns: ['name', 'package', 'target_preview'],
  defaultSort: { field: 'triggeredAt', desc: true },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    type: { column: 'type', sortable: true, filters: ['eq', 'in'] },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    package: { column: 'package' },
    targetCount: { column: 'target_count', sortable: true },
    targetPreview: { column: 'target_preview' },
    done: { column: 'done', sortable: true },
    failed: { column: 'failed', sortable: true, filters: ['gte'] },
    pending: { column: 'pending', sortable: true },
    triggeredAt: { column: 'triggered_at', sortable: true, filters: ['gte', 'lte'] },
    triggeredBy: { column: 'triggered_by', sortable: true, filters: ['eq', 'in'] },
    startsAt: { column: 'starts_at', sortable: true },
    completedAt: { column: 'completed_at', sortable: true },
    wakeOfflineFirst: { column: 'wake_offline_first' },
    notes: { column: 'notes' },
  },
};

/** Field names are the contract's LiveJob; the seven counters nest into `counts`. */
export const liveJobsSpec: TableSpec = {
  table: 'live_jobs',
  idColumn: 'id',
  searchColumns: ['title'],
  defaultSort: { field: 'submittedAt', desc: true },
  columns: {
    id,
    title: { column: 'title', sortable: true, filters: ['like'] },
    kind: { column: 'kind', sortable: true, filters: ['eq', 'in'] },
    scriptLanguage: { column: 'script_language', filters: ['eq', 'in'] },
    changeRef: { column: 'change_ref' },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    targetCount: { column: 'target_count', sortable: true },
    queued: { column: 'queued' },
    running: { column: 'running' },
    succeeded: { column: 'succeeded', sortable: true },
    failed: { column: 'failed', sortable: true, filters: ['gte'] },
    timedOut: { column: 'timed_out' },
    offline: { column: 'offline' },
    cancelled: { column: 'cancelled' },
    submittedAt: { column: 'submitted_at', sortable: true, filters: ['gte', 'lte'] },
    submittedBy: { column: 'submitted_by', sortable: true, filters: ['eq', 'in'] },
  },
};

/** Field names are the contract's Group and GroupDetail. */
export const groupsSpec: TableSpec = {
  table: 'device_groups',
  idColumn: 'id',
  searchColumns: ['name'],
  defaultSort: { field: 'name' },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    kind: { column: 'kind', sortable: true, filters: ['eq', 'in'] },
    parentId: { column: 'parent_id', filters: ['eq'] },
    rule: { column: 'rule' },
    policies: { column: 'policies' },
    members: { column: 'members', sortable: true, filters: ['gte', 'lte'] },
    online: { column: 'online', sortable: true },
    offline: { column: 'offline', sortable: true },
    missingPatches: { column: 'missing_patches', sortable: true },
    subGroups: { column: 'sub_groups', sortable: true },
    createdAt: { column: 'created_at', sortable: true },
    createdBy: { column: 'created_by', sortable: true, filters: ['eq'] },
  },
};

export const configChecksSpec: TableSpec = {
  table: 'config_checks',
  idColumn: 'id',
  searchColumns: ['title', 'benchmark'],
  defaultSort: { field: 'failCount', desc: true },
  columns: {
    id,
    title: { column: 'title', sortable: true, filters: ['like'] },
    benchmark: { column: 'benchmark', sortable: true, filters: ['eq', 'in'] },
    severity: { column: 'severity', sortable: true, filters: ['eq', 'in'] },
    platform: { column: 'platform', sortable: true, filters: ['eq', 'in'] },
    passCount: { column: 'pass_count', sortable: true },
    failCount: { column: 'fail_count', sortable: true, filters: ['gte'] },
    exceptionCount: { column: 'exception_count', sortable: true },
  },
};

export const zonesSpec: TableSpec = {
  table: 'zones',
  idColumn: 'id',
  searchColumns: ['name', 'city'],
  defaultSort: { field: 'deviceCount', desc: true },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['eq', 'in'] },
    city: { column: 'city', sortable: true, filters: ['eq', 'in'] },
    deviceCount: { column: 'device_count', sortable: true },
    peerCache: { column: 'peer_cache', filters: ['eq'] },
    bandwidthMbps: { column: 'bandwidth_mbps', sortable: true },
    relayStatus: { column: 'relay_status', sortable: true, filters: ['eq', 'in'] },
    lastSyncAt: { column: 'last_sync_at', sortable: true },
  },
};

export const peersSpec: TableSpec = {
  table: 'peers',
  idColumn: 'id',
  searchColumns: ['hostname'],
  defaultSort: { field: 'servedGb', desc: true },
  columns: {
    id,
    hostname: { column: 'hostname', sortable: true, filters: ['like'] },
    zoneId: { column: 'zone_id', filters: ['eq', 'in'] },
    zoneName: { column: 'zone_name', sortable: true, filters: ['eq', 'in'] },
    cacheSizeGb: { column: 'cache_size_gb', sortable: true },
    cacheUsedGb: { column: 'cache_used_gb', sortable: true },
    servedGb: { column: 'served_gb', sortable: true },
    peersServed: { column: 'peers_served', sortable: true },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    lastSeenAt: { column: 'last_seen_at', sortable: true },
  },
};

export const auditSpec: TableSpec = {
  table: 'audit_log',
  idColumn: 'id',
  searchColumns: ['actor', 'action', 'object_id'],
  defaultSort: { field: 'at', desc: true },
  columns: {
    id,
    at: { column: 'at', sortable: true, filters: ['gte', 'lte'] },
    actor: { column: 'actor', sortable: true, filters: ['eq', 'in'] },
    actorRole: { column: 'actor_role', sortable: true, filters: ['eq', 'in'] },
    action: { column: 'action', sortable: true, filters: ['eq', 'in', 'like'] },
    objectType: { column: 'object_type', sortable: true, filters: ['eq', 'in'] },
    objectId: { column: 'object_id', filters: ['eq'] },
    outcome: { column: 'outcome', sortable: true, filters: ['eq', 'in'] },
    ip: { column: 'ip', filters: ['eq'] },
    detail: { column: 'detail' },
  },
};

export const logBundlesSpec: TableSpec = {
  table: 'log_bundles',
  idColumn: 'id',
  searchColumns: ['hostname'],
  defaultSort: { field: 'collectedAt', desc: true },
  columns: {
    id,
    deviceId: { column: 'device_id', filters: ['eq'] },
    hostname: { column: 'hostname', sortable: true, filters: ['like'] },
    // JSON text, so a log-type filter is a substring match on the array.
    fileTypes: { column: 'file_types', filters: ['like'] },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    sizeBytes: { column: 'size_bytes', sortable: true },
    collectedAt: { column: 'collected_at', sortable: true, filters: ['gte', 'lte'] },
    emailed: { column: 'emailed', filters: ['eq'] },
  },
};

export const reportsSpec: TableSpec = {
  table: 'reports',
  idColumn: 'id',
  searchColumns: ['name', 'description'],
  defaultSort: { field: 'name' },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    category: { column: 'category', sortable: true, filters: ['eq', 'in'] },
    description: { column: 'description' },
    schedule: { column: 'schedule' },
    lastRunAt: { column: 'last_run_at', sortable: true },
    owner: { column: 'owner', sortable: true, filters: ['eq'] },
    custom: { column: 'custom', filters: ['eq'] },
  },
};

export const integrationsSpec: TableSpec = {
  table: 'integrations',
  idColumn: 'id',
  searchColumns: ['name'],
  defaultSort: { field: 'name' },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    kind: { column: 'kind', sortable: true, filters: ['eq', 'in'] },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    lastEventAt: { column: 'last_event_at', sortable: true },
    events24h: { column: 'events_24h', sortable: true },
  },
};

export const usersSpec: TableSpec = {
  table: 'users',
  idColumn: 'id',
  searchColumns: ['email', 'name'],
  defaultSort: { field: 'name' },
  columns: {
    id,
    email: { column: 'email', sortable: true, filters: ['eq', 'like'] },
    name: { column: 'name', sortable: true, filters: ['like'] },
    role: { column: 'role', sortable: true, filters: ['eq', 'in'] },
    zoneIds: { column: 'zone_ids' },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    lastSignInAt: { column: 'last_sign_in_at', sortable: true },
    createdAt: { column: 'created_at', sortable: true },
  },
};

/**
 * API tokens. `token_hash` is deliberately absent: it is not a field clients
 * may project, filter or sort by, so it cannot leave the database.
 */
export const apiTokensSpec: TableSpec = {
  table: 'api_tokens',
  idColumn: 'id',
  searchColumns: ['name'],
  defaultSort: { field: 'createdAt', desc: true },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    prefix: { column: 'prefix' },
    scopes: { column: 'scopes' },
    createdAt: { column: 'created_at', sortable: true },
    createdBy: { column: 'created_by', sortable: true, filters: ['eq'] },
    lastUsedAt: { column: 'last_used_at', sortable: true },
    expiresAt: { column: 'expires_at', sortable: true },
    revokedAt: { column: 'revoked_at', filters: ['eq'] },
  },
};
