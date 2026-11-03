-- Aegis One mock data. Rebuilt from a seed on demand, so there are no
-- migrations and no durability guarantees: drop the file and reseed.

CREATE TABLE zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  device_count INTEGER NOT NULL DEFAULT 0,
  peer_cache INTEGER NOT NULL DEFAULT 0,
  bandwidth_mbps INTEGER NOT NULL,
  relay_status TEXT NOT NULL,
  last_sync_at TEXT NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  status TEXT NOT NULL,
  os_family TEXT NOT NULL,
  os_name TEXT NOT NULL,
  os_version TEXT NOT NULL,
  os_build TEXT NOT NULL,
  kind TEXT NOT NULL,
  zone_id TEXT NOT NULL REFERENCES zones(id),
  zone_name TEXT NOT NULL,
  primary_user TEXT NOT NULL,
  primary_user_name TEXT NOT NULL,
  department TEXT NOT NULL,
  ip TEXT NOT NULL,
  mac TEXT NOT NULL,
  -- Inventory attributes the contract's Device schema declares and the
  -- approved grid shows as columns. They were missing, so five of the twenty
  -- columns had nothing to render.
  dns_name TEXT NOT NULL DEFAULT '',
  dns_server TEXT NOT NULL DEFAULT '',
  architecture TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  last_boot_at TEXT NOT NULL DEFAULT '',
  serial TEXT NOT NULL,
  model TEXT NOT NULL,
  cpu TEXT NOT NULL,
  ram_gb INTEGER NOT NULL,
  disk_total_gb INTEGER NOT NULL,
  disk_free_pct INTEGER NOT NULL,
  agent_version TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  enrolled_at TEXT NOT NULL,
  compliance_pct INTEGER NOT NULL,
  pending_patches INTEGER NOT NULL,
  critical_vulns INTEGER NOT NULL,
  dex_score INTEGER NOT NULL,
  encrypted INTEGER NOT NULL,
  -- The Overview's Security Posture widget reports three controls side by
  -- side. Disk encryption was already here; antivirus and firewall are the
  -- other two the contract's securityPosture array names.
  antivirus_ok INTEGER NOT NULL DEFAULT 1,
  firewall_ok INTEGER NOT NULL DEFAULT 1,
  reboot_pending INTEGER NOT NULL,
  config_pass_pct INTEGER NOT NULL
);

CREATE INDEX idx_devices_zone ON devices(zone_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_os ON devices(os_family);
CREATE INDEX idx_devices_hostname ON devices(hostname);
CREATE INDEX idx_devices_lastseen ON devices(last_seen_at);

CREATE TABLE software (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  category TEXT NOT NULL,
  latest_version TEXT NOT NULL,
  size_mb INTEGER NOT NULL,
  platform TEXT NOT NULL DEFAULT 'windows',
  -- A same-origin path, filled in when an administrator imports icons. The
  -- catalogue ships without them and the card falls back to a monogram.
  logo_url TEXT,
  installer TEXT NOT NULL DEFAULT 'missing',
  installer_sha256 TEXT,
  state TEXT NOT NULL DEFAULT 'draft',
  silent_install TEXT NOT NULL DEFAULT '',
  silent_uninstall TEXT NOT NULL DEFAULT '',
  install_count INTEGER NOT NULL DEFAULT 0,
  outdated_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_software_state ON software(state, installer);
CREATE INDEX idx_software_publisher ON software(publisher);

CREATE TABLE device_software (
  device_id TEXT NOT NULL REFERENCES devices(id),
  software_id TEXT NOT NULL REFERENCES software(id),
  version TEXT NOT NULL,
  outdated INTEGER NOT NULL,
  installed_at TEXT NOT NULL,
  PRIMARY KEY (device_id, software_id)
);

CREATE INDEX idx_devsw_software ON device_software(software_id);

CREATE TABLE patches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kb TEXT,
  platform TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  released_at TEXT NOT NULL,
  subcategory TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  approval TEXT NOT NULL DEFAULT 'review',
  superseded_by TEXT,
  ring TEXT NOT NULL DEFAULT 'late',
  zero_day INTEGER NOT NULL DEFAULT 0,
  applicable_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  installed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  reboot_required INTEGER NOT NULL
);

CREATE INDEX idx_patches_approval ON patches(approval);
CREATE INDEX idx_patches_source ON patches(source);

-- Patch policies: the schedules that decide which updates reach which rings.
CREATE TABLE patch_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  patch_count INTEGER NOT NULL DEFAULT 0,
  rollout TEXT NOT NULL,
  computers INTEGER NOT NULL DEFAULT 0,
  compliance_pct INTEGER NOT NULL DEFAULT 0,
  schedule TEXT NOT NULL,
  next_run_at TEXT,
  status TEXT NOT NULL
);

CREATE TABLE device_patches (
  device_id TEXT NOT NULL REFERENCES devices(id),
  patch_id TEXT NOT NULL REFERENCES patches(id),
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, patch_id)
);

CREATE INDEX idx_devpatch_patch ON device_patches(patch_id, state);

-- The patch aggregates read the outstanding rows far more often than the rest,
-- and they are under a tenth of the table. Leading with state turns those from
-- a scan of every pair into a scan of the ones still to do.
CREATE INDEX idx_devpatch_open ON device_patches(state, patch_id, device_id);

/*
 * Materialised patch aggregates.
 *
 * device_patches is half a million rows and nothing at runtime writes to it,
 * so the figures Patch Management reads are rolled up once while seeding.
 * Grouping that join on request took seconds; these two tables are a few
 * hundred rows between them. Both carry zone_id, because counts for a
 * zone-scoped caller are the sum of their own zones' rows and a device
 * belongs to exactly one zone.
 */
CREATE TABLE patch_cells (
  zone_id TEXT NOT NULL,
  os_label TEXT NOT NULL,
  platform TEXT NOT NULL,
  tab TEXT NOT NULL,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  state TEXT NOT NULL,
  pairs INTEGER NOT NULL,
  age_sum REAL NOT NULL,
  age0 INTEGER NOT NULL,
  age1 INTEGER NOT NULL,
  age2 INTEGER NOT NULL,
  age3 INTEGER NOT NULL,
  age4 INTEGER NOT NULL
);

CREATE INDEX idx_patch_cells_zone ON patch_cells(zone_id);

-- Distinct endpoint and update counts, which cannot be added up from the
-- cells above: one endpoint appears in many of them.
CREATE TABLE patch_device_counts (
  zone_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  key TEXT NOT NULL,
  devices INTEGER NOT NULL,
  critical_devices INTEGER NOT NULL,
  updates INTEGER NOT NULL
);

CREATE INDEX idx_patch_device_counts ON patch_device_counts(dimension, zone_id);

CREATE TABLE vulnerabilities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  cvss REAL NOT NULL,
  exploited INTEGER NOT NULL,
  published_at TEXT NOT NULL,
  affects TEXT NOT NULL,
  fixed_by TEXT NOT NULL,
  affected_count INTEGER NOT NULL DEFAULT 0,
  remediated_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE device_vulnerabilities (
  device_id TEXT NOT NULL REFERENCES devices(id),
  vulnerability_id TEXT NOT NULL REFERENCES vulnerabilities(id),
  state TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (device_id, vulnerability_id)
);

CREATE INDEX idx_devvuln_vuln ON device_vulnerabilities(vulnerability_id, state);

-- Column names follow the contract's Group and GroupDetail. A group is a
-- node in a tree: parent_id is null at the top, and the five figures below
-- are rolled up from real membership rather than stated.
CREATE TABLE device_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  parent_id TEXT REFERENCES device_groups(id),
  rule TEXT,
  -- The policies applied to the group, one per line. SQLite has no array
  -- type and the contract declares a list of names, not of objects.
  policies TEXT NOT NULL DEFAULT '',
  members INTEGER NOT NULL DEFAULT 0,
  online INTEGER NOT NULL DEFAULT 0,
  offline INTEGER NOT NULL DEFAULT 0,
  missing_patches INTEGER NOT NULL DEFAULT 0,
  sub_groups INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX idx_device_groups_parent ON device_groups(parent_id);

-- Membership is materialised. A dynamic group's rule is evaluated once at
-- seed time, so the member list, the per-group figures and a deployment's
-- resolved targets all come from the same rows rather than from three
-- separate guesses.
CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES device_groups(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  PRIMARY KEY (group_id, device_id)
);

CREATE INDEX idx_group_members_device ON group_members(device_id);

CREATE TABLE config_checks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  benchmark TEXT NOT NULL,
  severity TEXT NOT NULL,
  platform TEXT NOT NULL,
  pass_count INTEGER NOT NULL,
  fail_count INTEGER NOT NULL,
  exception_count INTEGER NOT NULL
);

-- Column names follow the contract's DeploymentSummary: the action's package,
-- who triggered it and when, when a scheduled one starts, and the three result
-- counts the grid draws.
CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  package TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  -- The first few target hostnames, materialised at seed time. The grid shows
  -- them under the count on every row, and joining per row to find three names
  -- would be a scan of deployment_results for a line of secondary text.
  target_preview TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  pending INTEGER NOT NULL,
  triggered_at TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  starts_at TEXT,
  completed_at TEXT,
  wake_offline_first INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- The six counters above the grid are counted by status on every load.
CREATE INDEX idx_deployments_status ON deployments(status);

CREATE TABLE deployment_results (
  deployment_id TEXT NOT NULL REFERENCES deployments(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  state TEXT NOT NULL,
  message TEXT,
  finished_at TEXT,
  PRIMARY KEY (deployment_id, device_id)
);

-- Remote script execution. A job is submitted, polled and read back; there is
-- no session, socket or interactive channel anywhere in this schema.
CREATE TABLE live_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  language TEXT,
  script TEXT,
  reason TEXT,
  status TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  completed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  finished_at TEXT,
  output_limit_kb INTEGER NOT NULL DEFAULT 256
);

CREATE TABLE live_job_results (
  job_id TEXT NOT NULL REFERENCES live_jobs(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  hostname TEXT NOT NULL,
  state TEXT NOT NULL,
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER,
  finished_at TEXT,
  PRIMARY KEY (job_id, device_id)
);

CREATE TABLE log_bundles (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  hostname TEXT NOT NULL,
  file_types TEXT NOT NULL,
  status TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  collected_at TEXT NOT NULL,
  emailed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE peers (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  zone_id TEXT NOT NULL REFERENCES zones(id),
  zone_name TEXT NOT NULL,
  cache_size_gb INTEGER NOT NULL,
  cache_used_gb INTEGER NOT NULL,
  served_gb INTEGER NOT NULL,
  peers_served INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  last_event_at TEXT,
  events_24h INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Only the SHA-256 and a display prefix. The secret is shown once, at creation.
  token_hash TEXT NOT NULL,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  zone_ids TEXT NOT NULL,
  status TEXT NOT NULL,
  last_sign_in_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL,
  system INTEGER NOT NULL,
  zone_ids TEXT NOT NULL DEFAULT '[]',
  user_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  entitled INTEGER NOT NULL,
  consumed INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  support_tier TEXT NOT NULL
);

CREATE TABLE service_health (
  id TEXT PRIMARY KEY,
  component TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  message TEXT,
  checked_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  ip TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX idx_audit_at ON audit_log(at);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  schedule TEXT,
  last_run_at TEXT,
  owner TEXT NOT NULL,
  custom INTEGER NOT NULL DEFAULT 0
);

-- A token names the group an endpoint joins on first check-in, which is what
-- the contract's EnrollmentToken carries and what the approved grid shows.
-- The secret itself is never stored, only its hash and its prefix.
CREATE TABLE enrollment_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  zone_id TEXT NOT NULL REFERENCES zones(id),
  target_group_id TEXT REFERENCES device_groups(id),
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revoked_at TEXT
);

-- Indexes for the GROUP BY columns behind the Overview and facet aggregates.
-- Without these each one is a full scan of 50,000 rows, and better-sqlite3 is
-- synchronous, so concurrent requests queue behind it.
CREATE INDEX idx_devices_department ON devices(department);
CREATE INDEX idx_devices_agent ON devices(agent_version);
CREATE INDEX idx_devices_kind ON devices(kind);
CREATE INDEX idx_devices_encrypted ON devices(encrypted);
CREATE INDEX idx_devices_antivirus ON devices(antivirus_ok);
CREATE INDEX idx_devices_firewall ON devices(firewall_ok);
CREATE INDEX idx_devices_zone_compliance ON devices(zone_id, compliance_pct);
CREATE INDEX idx_devices_osname ON devices(os_family, os_name);
CREATE INDEX idx_devpatch_state ON device_patches(state);
