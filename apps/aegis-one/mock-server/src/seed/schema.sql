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
  install_count INTEGER NOT NULL DEFAULT 0,
  outdated_count INTEGER NOT NULL DEFAULT 0
);

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
  applicable_count INTEGER NOT NULL DEFAULT 0,
  installed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  reboot_required INTEGER NOT NULL
);

CREATE TABLE device_patches (
  device_id TEXT NOT NULL REFERENCES devices(id),
  patch_id TEXT NOT NULL REFERENCES patches(id),
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, patch_id)
);

CREATE INDEX idx_devpatch_patch ON device_patches(patch_id, state);

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

CREATE TABLE device_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  rule TEXT,
  member_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

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

CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  content TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  succeeded INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  pending INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  scheduled_at TEXT,
  completed_at TEXT,
  wake_offline_first INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

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

CREATE TABLE enrollment_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  zone_id TEXT NOT NULL REFERENCES zones(id),
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revoked_at TEXT
);
