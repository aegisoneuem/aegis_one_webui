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
    releasedAt: { column: 'released_at', sortable: true, filters: ['gte', 'lte'] },
    applicableCount: { column: 'applicable_count', sortable: true },
    installedCount: { column: 'installed_count', sortable: true },
    failedCount: { column: 'failed_count', sortable: true, filters: ['gte'] },
    rebootRequired: { column: 'reboot_required', filters: ['eq'] },
  },
};

export const vulnerabilitiesSpec: TableSpec = {
  table: 'vulnerabilities',
  idColumn: 'id',
  searchColumns: ['id', 'title', 'affects'],
  defaultSort: { field: 'cvss', desc: true },
  columns: {
    id,
    title: { column: 'title', sortable: true, filters: ['like'] },
    severity: { column: 'severity', sortable: true, filters: ['eq', 'in'] },
    cvss: { column: 'cvss', sortable: true, filters: ['gte', 'lte'] },
    exploited: { column: 'exploited', sortable: true, filters: ['eq'] },
    publishedAt: { column: 'published_at', sortable: true, filters: ['gte', 'lte'] },
    affects: { column: 'affects', sortable: true, filters: ['eq', 'in'] },
    fixedBy: { column: 'fixed_by' },
    affectedCount: { column: 'affected_count', sortable: true, filters: ['gte'] },
    remediatedCount: { column: 'remediated_count', sortable: true },
  },
};

export const deploymentsSpec: TableSpec = {
  table: 'deployments',
  idColumn: 'id',
  searchColumns: ['name', 'content'],
  defaultSort: { field: 'createdAt', desc: true },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    type: { column: 'type', sortable: true, filters: ['eq', 'in'] },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    content: { column: 'content' },
    targetCount: { column: 'target_count', sortable: true },
    succeeded: { column: 'succeeded', sortable: true },
    failed: { column: 'failed', sortable: true, filters: ['gte'] },
    pending: { column: 'pending', sortable: true },
    createdAt: { column: 'created_at', sortable: true, filters: ['gte', 'lte'] },
    createdBy: { column: 'created_by', sortable: true, filters: ['eq', 'in'] },
    scheduledAt: { column: 'scheduled_at', sortable: true },
    completedAt: { column: 'completed_at', sortable: true },
    wakeOfflineFirst: { column: 'wake_offline_first' },
    notes: { column: 'notes' },
  },
};

export const liveJobsSpec: TableSpec = {
  table: 'live_jobs',
  idColumn: 'id',
  searchColumns: ['name'],
  defaultSort: { field: 'createdAt', desc: true },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    kind: { column: 'kind', sortable: true, filters: ['eq', 'in'] },
    language: { column: 'language', filters: ['eq', 'in'] },
    reason: { column: 'reason' },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    targetCount: { column: 'target_count', sortable: true },
    completed: { column: 'completed', sortable: true },
    failed: { column: 'failed', sortable: true, filters: ['gte'] },
    createdAt: { column: 'created_at', sortable: true, filters: ['gte', 'lte'] },
    createdBy: { column: 'created_by', sortable: true, filters: ['eq', 'in'] },
    finishedAt: { column: 'finished_at', sortable: true },
    outputLimitKb: { column: 'output_limit_kb' },
  },
};

export const groupsSpec: TableSpec = {
  table: 'device_groups',
  idColumn: 'id',
  searchColumns: ['name'],
  defaultSort: { field: 'name' },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    kind: { column: 'kind', sortable: true, filters: ['eq', 'in'] },
    rule: { column: 'rule' },
    memberCount: { column: 'member_count', sortable: true, filters: ['gte', 'lte'] },
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
    action: { column: 'action', sortable: true, filters: ['eq', 'in'] },
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
    fileTypes: { column: 'file_types' },
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

export const enrollmentTokensSpec: TableSpec = {
  table: 'enrollment_tokens',
  idColumn: 'id',
  searchColumns: ['name'],
  defaultSort: { field: 'createdAt', desc: true },
  columns: {
    id,
    name: { column: 'name', sortable: true, filters: ['like'] },
    platform: { column: 'platform', sortable: true, filters: ['eq', 'in'] },
    zoneId: { column: 'zone_id', filters: ['eq', 'in'] },
    prefix: { column: 'prefix' },
    uses: { column: 'uses', sortable: true },
    maxUses: { column: 'max_uses' },
    expiresAt: { column: 'expires_at', sortable: true },
    createdAt: { column: 'created_at', sortable: true },
    createdBy: { column: 'created_by', filters: ['eq'] },
    revokedAt: { column: 'revoked_at', filters: ['eq'] },
  },
};
