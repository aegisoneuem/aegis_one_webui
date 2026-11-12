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
  last_sync_at TEXT NOT NULL,
  -- What the approved Aegis Zones page reports. Content reaches a zone once
  -- as a seed copy, is then served locally by its peers, and whatever a
  -- device could not get locally it pulls straight from the central
  -- repository. Those three figures are what every percentage on the page is
  -- computed from, so each one is a column rather than an assumption.
  connectivity_pct INTEGER NOT NULL DEFAULT 0,
  seed_gb INTEGER NOT NULL DEFAULT 0,
  direct_gb INTEGER NOT NULL DEFAULT 0,
  avoided_week_gb INTEGER NOT NULL DEFAULT 0,
  local_mbps INTEGER NOT NULL DEFAULT 0
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
  config_pass_pct INTEGER NOT NULL,
  -- What the Vulnerabilities page needs of a device. Criticality weights the
  -- exposure score, the scan method says how the device was reached, and
  -- `exposure` is the 0-1000 figure itself: it is stored rather than summed
  -- per request because the Devices tab ranks the whole estate by it.
  criticality INTEGER NOT NULL DEFAULT 5,
  scan_method TEXT NOT NULL DEFAULT 'agent',
  last_scan_at TEXT NOT NULL DEFAULT '',
  exposure INTEGER NOT NULL DEFAULT 0,
  -- What the Configuration page needs of a device. These are rolled up from
  -- the check library once the estate is seeded, which is also where
  -- `config_pass_pct` now comes from: it used to be a random figure, so the
  -- Devices grid and this page disagreed about the same device.
  -- `config_checks_total` is 0 for a platform the library has no checks for.
  config_checks_total INTEGER NOT NULL DEFAULT 0,
  config_fail INTEGER NOT NULL DEFAULT 0,
  config_high_fail INTEGER NOT NULL DEFAULT 0,
  config_exceptions INTEGER NOT NULL DEFAULT 0,
  -- The three measures the experience score is made of. They were missing, so
  -- `dex_score` was a random figure with nothing behind it: the DEX page shows
  -- the score, its breakdown and the penalties that produced it, and all three
  -- have to agree. `dex_score` is now derived from these. See decision D-042.
  cpu_pct INTEGER NOT NULL DEFAULT 0,
  memory_pct INTEGER NOT NULL DEFAULT 0,
  boot_seconds INTEGER NOT NULL DEFAULT 0,
  -- The rest of the inventory the approved Reports grid offers as columns.
  -- The reference synthesises these per device; they are filled in by
  -- rollUpInventory from the row's own values, so no report column has to be
  -- left blank. See decision D-043.
  asset_tag TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  ownership TEXT NOT NULL DEFAULT '',
  chassis TEXT NOT NULL DEFAULT '',
  os_install_date TEXT NOT NULL DEFAULT '',
  uptime TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT '',
  cpu_cores INTEGER NOT NULL DEFAULT 0,
  bios_version TEXT NOT NULL DEFAULT '',
  bios_date TEXT NOT NULL DEFAULT '',
  tpm TEXT NOT NULL DEFAULT '',
  secure_boot TEXT NOT NULL DEFAULT '',
  gpu TEXT NOT NULL DEFAULT '',
  battery TEXT NOT NULL DEFAULT '',
  purchase_date TEXT NOT NULL DEFAULT '',
  warranty_until TEXT NOT NULL DEFAULT '',
  subnet TEXT NOT NULL DEFAULT '',
  gateway TEXT NOT NULL DEFAULT '',
  ssid TEXT NOT NULL DEFAULT '',
  public_ip TEXT NOT NULL DEFAULT '',
  vpn TEXT NOT NULL DEFAULT '',
  av_definitions TEXT NOT NULL DEFAULT '',
  av_product TEXT NOT NULL DEFAULT '',
  encryption_type TEXT NOT NULL DEFAULT '',
  usb_storage TEXT NOT NULL DEFAULT '',
  local_admins INTEGER NOT NULL DEFAULT 0,
  last_patched_at TEXT NOT NULL DEFAULT '',
  patch_ring TEXT NOT NULL DEFAULT '',
  agent_health TEXT NOT NULL DEFAULT '',
  content_source TEXT NOT NULL DEFAULT '',
  network_type TEXT NOT NULL DEFAULT ''
);

-- The one report source the estate had no table for: USB connections and the
-- ones policy refused.
CREATE TABLE usb_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  peripheral TEXT NOT NULL,
  usb_name TEXT NOT NULL,
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX idx_usb_events_device ON usb_events(device_id);

-- Which reports an administrator has starred. The reference keeps this in
-- local storage; a console with named accounts keeps it per user.
-- A diagnostic run, kept so remediation can refer back to one and so the
-- verification it reports has somewhere to live.
CREATE TABLE insight_runs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

-- Saved descriptions, so a recurring complaint does not have to be retyped.
CREATE TABLE insight_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE report_favorites (
  report_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  PRIMARY KEY (report_id, user_email)
);

CREATE INDEX idx_devices_dex ON devices(dex_score);

-- The grid's default sort. Without it every page of fifty sorts the whole
-- estate, which got noticeably dearer once the row carried the Reports
-- inventory: measured at 7ms per page unsorted against 2ms with this index.
CREATE INDEX idx_devices_last_seen ON devices(last_seen_at DESC);

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
  outdated_count INTEGER NOT NULL DEFAULT 0,
  -- What the Software Licenses report is about: how many seats a paid title
  -- is entitled to and when the agreement renews. A free title has no seats.
  seats INTEGER NOT NULL DEFAULT 0,
  renews_at TEXT NOT NULL DEFAULT ''
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

-- Columns are the contract's Finding. CVSS is the published score; `priority`
-- is the console's own Priority Rating, which is what the grid sorts on by
-- default, because a 10.0 nobody can reach outranks nothing.
CREATE TABLE vulnerabilities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  cvss REAL NOT NULL,
  priority REAL NOT NULL DEFAULT 0,
  exploited INTEGER NOT NULL,
  published_at TEXT NOT NULL,
  affects TEXT NOT NULL,
  fixed_by TEXT NOT NULL,
  check_id TEXT NOT NULL DEFAULT '',
  family TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  fix_type TEXT NOT NULL DEFAULT 'patch',
  -- A JSON array of the contract's eight threat indicators.
  threats TEXT NOT NULL DEFAULT '[]',
  detection TEXT NOT NULL DEFAULT 'active',
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  port TEXT NOT NULL DEFAULT 'local',
  first_detected_at TEXT NOT NULL DEFAULT '',
  last_detected_at TEXT NOT NULL DEFAULT '',
  sla_due_at TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES vuln_projects(id),
  accepted_reason TEXT,
  -- Rolled up from the per-device rows: a finding is open while any device
  -- still has it, accepted when someone signed it off, resolved otherwise.
  state TEXT NOT NULL DEFAULT 'open',
  affected_count INTEGER NOT NULL DEFAULT 0,
  remediated_count INTEGER NOT NULL DEFAULT 0
);

-- A remediation project groups findings behind one owner and one due date.
CREATE TABLE vuln_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  due TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0
);

-- The Scans tab's nine columns. `schedule` is the cadence in words; a scan
-- started from New Scan carries 'One-off'.
CREATE TABLE vuln_scans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  scope TEXT NOT NULL,
  schedule TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_label TEXT NOT NULL DEFAULT '—',
  devices_scanned INTEGER NOT NULL DEFAULT 0,
  findings_opened INTEGER NOT NULL DEFAULT 0,
  findings_fixed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_vuln_scans_started ON vuln_scans(started_at DESC);

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

-- The benchmark check library the Configuration page evaluates: 200 checks
-- over three platforms, each with the value it expects, the value a failing
-- device reports instead, and its mapping into the four frameworks.
--
-- `seq` is the check's position within its platform. It is the hash input for
-- the deterministic spread that decides a device's result for a setting this
-- console does not inventory, so it must stay stable across a reseed.
--
-- The three result counts are stored rather than summed per request: the grid
-- ranks 200 checks over an estate of 50,000, and recomputing that join on
-- every page would cost millions of row visits. See decision D-039.
CREATE TABLE config_checks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  platform TEXT NOT NULL,
  severity TEXT NOT NULL,
  expected TEXT NOT NULL,
  bad TEXT NOT NULL,
  check_key TEXT NOT NULL DEFAULT '',
  cis TEXT NOT NULL DEFAULT '',
  stig TEXT NOT NULL DEFAULT '',
  pci TEXT NOT NULL DEFAULT '',
  hipaa TEXT NOT NULL DEFAULT '',
  remediable INTEGER NOT NULL DEFAULT 1,
  custom INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  pass_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  exception_count INTEGER NOT NULL DEFAULT 0,
  compliance_pct INTEGER
);

CREATE INDEX idx_config_checks_platform ON config_checks(platform);
CREATE INDEX idx_config_checks_fail ON config_checks(fail_count DESC);

-- The same three counts again, per device group.
--
-- The page's Device Group filter narrows every figure on the page, not just
-- the rows, and the counts cannot be decomposed from the estate-wide ones. A
-- live aggregate over the largest group takes seven seconds, so it is rolled
-- up once here instead — 16 groups by 200 checks is 3,200 rows.
CREATE TABLE config_check_groups (
  group_id TEXT NOT NULL REFERENCES device_groups(id),
  check_id TEXT NOT NULL REFERENCES config_checks(id),
  pass_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  exception_count INTEGER NOT NULL DEFAULT 0,
  compliance_pct INTEGER,
  PRIMARY KEY (group_id, check_id)
);

-- The benchmarks the library rolls up into. `platform` is null for one that
-- applies to every platform, which is how the reference lists PCI DSS and
-- HIPAA.
CREATE TABLE config_benchmarks (
  id TEXT PRIMARY KEY,
  framework TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT,
  assigned_group_id TEXT REFERENCES device_groups(id)
);

-- An exception suppresses a check over a scope. `expires_at` is null for one
-- granted with no expiry.
CREATE TABLE config_exceptions (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES config_checks(id),
  scope_group_id TEXT REFERENCES device_groups(id),
  reason TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX idx_config_exceptions_check ON config_exceptions(check_id);

CREATE TABLE config_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  -- The group the profile is assigned to. A profile only applies to the
  -- members on its own platform, which is what `assigned_devices` counts.
  target_group_id TEXT REFERENCES device_groups(id),
  assigned_devices INTEGER NOT NULL DEFAULT 0,
  compliance_pct INTEGER NOT NULL DEFAULT 0,
  modified_at TEXT NOT NULL
);

-- One row per setting per version, which is what the Version History panel
-- lays out side by side: the setting down the left, a column per version.
CREATE TABLE config_profile_settings (
  profile_id TEXT NOT NULL REFERENCES config_profiles(id),
  setting TEXT NOT NULL,
  version INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (profile_id, setting, version)
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
-- Columns are the contract's LiveJob. The seven counters are its `counts`
-- object flattened, which is what the Task Results grid totals.
CREATE TABLE live_jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  script_language TEXT,
  script TEXT,
  change_ref TEXT,
  status TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  queued INTEGER NOT NULL DEFAULT 0,
  running INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  timed_out INTEGER NOT NULL DEFAULT 0,
  offline INTEGER NOT NULL DEFAULT 0,
  cancelled INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  finished_at TEXT,
  timeout_seconds INTEGER NOT NULL DEFAULT 300,
  output_limit_kb INTEGER NOT NULL DEFAULT 64
);
CREATE INDEX idx_live_jobs_submitted ON live_jobs(submitted_at DESC);

-- One row per endpoint a job reached: the ten columns of the Task Results grid.
CREATE TABLE live_job_results (
  job_id TEXT NOT NULL REFERENCES live_jobs(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  device_name TEXT NOT NULL,
  connection TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  reason TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  stdout TEXT,
  stderr TEXT,
  queued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  PRIMARY KEY (job_id, device_id)
);

-- Scheduled log collections, and the one row of Storage & Mail settings.
CREATE TABLE log_schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sources TEXT NOT NULL,
  targets TEXT NOT NULL,
  cadence TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  delivery TEXT NOT NULL DEFAULT 'store-only',
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE log_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  retention_days INTEGER NOT NULL,
  email_bundles INTEGER NOT NULL,
  recipients TEXT NOT NULL DEFAULT '',
  root_path TEXT NOT NULL,
  folder_layout TEXT NOT NULL,
  file_name_pattern TEXT NOT NULL,
  max_bundle_size_mb INTEGER NOT NULL,
  send_as TEXT NOT NULL,
  attachment_limit_mb INTEGER NOT NULL
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

-- A peer cache is a regular endpoint agent that was elected to cache content
-- for its zone, which is what the approved Peer Cache page says it is. So each
-- row points at a real device and takes that device's hostname; one per zone
-- carries `elected`, and re-electing moves the flag rather than building a
-- node. There are no dedicated distribution servers in this schema.
CREATE TABLE peers (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  hostname TEXT NOT NULL,
  zone_id TEXT NOT NULL REFERENCES zones(id),
  zone_name TEXT NOT NULL,
  cache_size_gb INTEGER NOT NULL,
  cache_used_gb INTEGER NOT NULL,
  served_gb INTEGER NOT NULL,
  peers_served INTEGER NOT NULL,
  status TEXT NOT NULL,
  elected INTEGER NOT NULL DEFAULT 0,
  last_transfer_at TEXT,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX idx_peers_elected ON peers(zone_id, elected);

-- What each zone's cache is holding, materialised at seed time from the
-- deployments that actually reached devices in that zone. The column prints
-- the names, so the names are stored; deriving them per request would be a
-- join across deployment_results for a line of text.
CREATE TABLE peer_cache_content (
  zone_id TEXT NOT NULL REFERENCES zones(id),
  label TEXT NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (zone_id, label)
);

-- Integrations is four different things, and the flat `integrations` table it
-- replaced could only be one of them. A connector is an outbound integration
-- with a scope; a SIEM destination is a log target; a notification channel is
-- a place an alert rule can send to; a delivery is one attempt at one event.
CREATE TABLE connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- itsm | siem | chat | webhook | identity
  status TEXT NOT NULL,               -- connected | attention | disabled | not-configured | error
  -- The card's second line: what this connector is actually for.
  purpose TEXT NOT NULL DEFAULT '',
  -- The permissions it was granted, printed verbatim on the card.
  scope TEXT,
  last_sync_at TEXT,
  seq INTEGER NOT NULL
);

CREATE TABLE siem_destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,            -- "HTTP Event Collector", "Syslog (LEEF)"
  protocol TEXT NOT NULL,             -- syslog-tls | syslog-udp | https
  status TEXT NOT NULL,               -- connected | not-configured | error
  host TEXT,
  port INTEGER,
  event_types INTEGER NOT NULL DEFAULT 0,
  last_sent_at TEXT,
  rate_per_hour INTEGER,
  enabled INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL
);

CREATE TABLE notification_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,            -- "Incoming Webhook", "Create Issues"
  status TEXT NOT NULL,               -- connected | not-configured | error
  event_types INTEGER,
  last_sent_at TEXT,
  rate_per_hour INTEGER,
  seq INTEGER NOT NULL
);

CREATE TABLE notification_rules (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL
);

-- A rule fans out to several channels, which is why the Send To column lists
-- more than one and the Channel Status column lists one state per channel.
CREATE TABLE notification_rule_channels (
  rule_id TEXT NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES notification_channels(id),
  seq INTEGER NOT NULL,
  PRIMARY KEY (rule_id, channel_id)
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  connector_name TEXT NOT NULL,
  event_type TEXT NOT NULL,           -- Audit Trail | Deployments | Compliance
  event TEXT NOT NULL,
  at TEXT NOT NULL,
  outcome TEXT NOT NULL,              -- delivered | failed | retrying
  http_status INTEGER
);

CREATE INDEX idx_deliveries_at ON deliveries(at DESC);

-- The four providers the approved Identity & SSO tab prints. A provider is
-- "enabled" when sign-in through it is switched on, and "connected" when it
-- has actually been wired up: the card prints those as two separate fields,
-- STATUS and CONNECTION, because a provider can be configured and switched
-- off, or switched on and not yet configured.
--
-- No secret is stored here. Configuring a provider accepts one and drops it;
-- there is no column for it and no route that reads one back.
CREATE TABLE identity_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,              -- oidc | saml | ldap
  description TEXT NOT NULL,           -- the line under the name
  enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,                -- connected | not-configured | error
  mfa_required INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL
);

-- One row. Agent enrollment settings are a single object in the contract, so
-- they are a single row here rather than a key-value table nobody can read.
CREATE TABLE agent_enrollment_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  require_token INTEGER NOT NULL DEFAULT 1,
  auto_assign_group TEXT,
  token_max_age_days INTEGER NOT NULL DEFAULT 30
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
  mfa_enrolled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  last_sign_in_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL,
  system INTEGER NOT NULL,
  -- The approved Roles & Content Access card prints three scopes side by
  -- side: where a role may act, what software it may touch, and which device
  -- groups it may see. An empty array means "everything", as the contract says.
  zone_ids TEXT NOT NULL DEFAULT '[]',
  software_categories TEXT NOT NULL DEFAULT '[]',
  group_ids TEXT NOT NULL DEFAULT '[]',
  user_count INTEGER NOT NULL DEFAULT 0
);

-- One licence, not a list of products.
--
-- The approved Licensing page describes a single agreement: a plan, a seat
-- count, a term, and the modules that agreement covers. The table this
-- replaced held one row per product with its own entitlement and expiry,
-- which could not answer "how many days until renewal" or "which plan is
-- this" — the two things the page leads with.
-- The estate-wide patch defaults the approved Global Settings sub-tab edits.
--
-- One row. The three thresholds are the interesting part: they do not store a
-- health verdict, they store the rule that produces one, and the counters
-- beside them are counted against the estate every time the page is read. A
-- stored "25 highly vulnerable" would be a number nobody could re-derive.
--
-- The arrays — rings, group overrides and declined vendors — are JSON because
-- they are edited and saved as wholes, never queried across.
CREATE TABLE patch_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  highly_vulnerable_critical INTEGER NOT NULL,
  highly_vulnerable_total INTEGER NOT NULL,
  vulnerable_total INTEGER NOT NULL,
  disable_built_in_updates INTEGER NOT NULL DEFAULT 1,
  hide_check_for_updates INTEGER NOT NULL DEFAULT 1,
  group_overrides TEXT NOT NULL DEFAULT '[]',
  major_versions TEXT NOT NULL,
  rings TEXT NOT NULL,
  maintenance TEXT NOT NULL,
  approval TEXT NOT NULL
);

-- What a vendor has published about a release, for the OS Versions table.
-- Reference text only, which the panel says in so many words: the console
-- cannot verify a vendor's lifecycle page and does not pretend to.
CREATE TABLE os_lifecycle (
  os TEXT NOT NULL,
  version TEXT NOT NULL,
  vendor_support TEXT,
  end_of_life INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (os, version)
);

CREATE TABLE license (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  plan TEXT NOT NULL,
  seats_total INTEGER NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);

-- What the agreement covers. `tier` is what the card's second line prints:
-- a module can be included in the plan, bought as an add-on, or offered as a
-- preview — and a preview is explicitly not counted against seats, which the
-- card says in so many words.
CREATE TABLE license_modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,                      -- included | add-on | preview
  enabled INTEGER NOT NULL DEFAULT 1,
  counts_against_seats INTEGER NOT NULL DEFAULT 1,
  seq INTEGER NOT NULL
);

-- The Services table on the approved System Health page: a name, a state, a
-- signal and a detail line. `signal` is deliberately a string rather than a
-- number, because the four services print four different kinds of signal —
-- a latency, a ratio, an age and a percentage — and forcing them into one
-- numeric column is what made the old page print "31" with no unit.
--
-- Three of the seven signals are not stored at all: the agent gateway, the
-- peer cache controller and the notification service are counted from the
-- estate when the page is read. See routes/diagnostics.ts.
CREATE TABLE service_health (
  id TEXT PRIMARY KEY,
  component TEXT NOT NULL,
  status TEXT NOT NULL,                  -- healthy | degraded | down
  signal TEXT NOT NULL,
  detail TEXT NOT NULL,
  derived TEXT,                          -- which estate figure replaces the stored signal
  checked_at TEXT NOT NULL,
  seq INTEGER NOT NULL
);

-- One row per logged event in the last day, which the Events panel buckets
-- by hour. Stored rather than derived: a warning is a thing that happened at
-- a time, and bucketing a count into twenty-four columns needs the times.
CREATE TABLE health_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  level TEXT NOT NULL,                   -- info | warning | error
  message TEXT NOT NULL
);

CREATE INDEX idx_health_events_at ON health_events(at DESC);

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
