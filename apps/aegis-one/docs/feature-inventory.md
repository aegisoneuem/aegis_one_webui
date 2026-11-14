# Aegis One feature inventory

Source: `Aegis-One-Console-v129.html` (11.4 MB), opened in Chrome and walked page by page on
2026-11-01. Every item below was observed in the running build unless it is marked **not observed**.
The reference is a simulation: sample data is 32 devices, 4 zones, 200 software packages, and the
deployment wizard says "Preview mode · The action is stored in this browser. No commands are sent
to computers."

Method: Playwright scripts (kept outside the repo) clicked every sidebar entry, every tab, the
header actions and the drawers and dialogs they open, and recorded headings, table columns, filters
and button labels. Screenshots of each view were taken for the walk and are not committed
(11.4 MB build, roughly 80 images); the three Phase 1 screenshots of the new console are in
`docs/screenshots/`.

Sections 1 to 4 are the inventory. Section 5 lists where the brief and the reference disagree and
needs a decision before Phase 4. Section 6 is the Remote Desktop audit.

---

## 1. Application shell

| Element      | Behaviour in the reference                                                                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar      | Collapsible, 238 px open, icons only when collapsed. Six groups (Console, Operations, Security, Experience, Infrastructure, Organization). Console and Operations open by default, the other four closed. Each group toggles. Items: icon plus label. "Beta" tag on Configuration and AEGIS Insight. |
| Brand block  | Bronze angular mark plus "AEGIS ONE" wordmark and a second line "Endpoint management". Clicking it goes to Overview.                                                                                                                                                                                 |
| Top bar      | Back, Home, a divider, the breadcrumb (`Overview › Devices`), then right-aligned: Search console, notifications, Help, avatar "AA". Search, notifications, Help and the user menu did not open anything visible in the walk (**not observed**).                                                      |
| History      | Back and Home buttons. Alt+Left behaviour is a brief requirement; it was not tested in the reference.                                                                                                                                                                                                |
| Footer strip | "AEGIS ONE / Endpoint Control", "Snapshot · simulated data".                                                                                                                                                                                                                                         |
| Setup chip   | "Setup 3/7" next to the Overview title. The checklist it opens was not captured (**not observed**).                                                                                                                                                                                                  |

## 2. Pages

Counts and sample values are the reference's seed data, quoted so the mock server can reproduce the
shapes. They are not targets for the 50k seed.

### home — Overview

- Header counters: 16 Device Groups, 200 Software Packages, 487 Patch Updates, 7 Deployments, 4 Zones.
- Actions: Custom Widget, Customize, Export, New Action.
- "Ask Aegis" text box ("offline laptops in Mumbai") with five suggestion chips: Windows 10 devices missing critical patches · Offline Laptops in Mumbai · Devices Without Antivirus · Not Encrypted Finance Devices · Low Disk Space. Refresh overview button. "Updated 04:28 AM" stamp.
- Filters: Zone (All, Bengaluru, Delhi, Jaipur, Mumbai), Platform (All, Windows, macOS, Linux), Department (All, Engineering, Finance, Operations, Support).
- KPI tiles: Managed Endpoints, Online Now (with %), Patch Compliance, High-Risk Endpoints.
- Widgets (each has a View select and a Chart Type select):
  - **Overall Health Score** — 71/100, band "Fair", "14 points below Healthy (85)", Biggest Gains (Patching +7.8, Agent Health +3.4), Thresholds link, "How it's calculated" panel. Views: Score by Measure, Points to Healthy. Chart: Column or Bar. Measures and weights: Patching 30 %, Security Posture 25 %, Agent Health 20 %, Experience (DEX) 15 %, Content Delivery 10 %.
  - **Patch Compliance** — Views: Device Compliance, Missing Patches by Severity, Last Install Result, Compliance by OS Family, Devices Needing Patches by OS. Chart: Donut, Pie, Column or Bar. Side lists: Compliant/Non-compliant, Missing Patches (Critical/High/Medium), Last Install Result (Successful, Restart Needed, Pending, Failed), Compliance by OS (Windows, macOS, Linux).
  - **Security Posture** — Views: All Controls, Disk Encryption, Antivirus, Firewall. Chart: Rings, Column or Bar. Each control shows "24 of 32 protected" and "20 pts to target".
  - **Deployment Status** — Views: Device Results, By Current Status. Chart: Donut, Pie, Column or Bar.
  - **Expiring Soon** — 7 items: enrollment tokens and API tokens with expiry age (e.g. "Q3 imaging batch · Enrollment Token · 93 days ago"). Buckets: Expired, Within 10 days, Within 30 days, Later.
  - **Needs Attention** — prioritised rows with severity, count, title, detail and an action button: Antivirus Missing or Outdated (Install Antivirus), Disk Not Fully Encrypted (Review), High-Risk Endpoints (Review), Deployment Failed (Open Failures), End-Of-Support OS (Review), Not seen for 7+ days (Refresh Details). "Show 4 more" expander.
  - **Recent Activity** — latest deployments with id, target count, status and time; "All Deployments" link.
- **Customize Overview** drawer: Start From a Layout (Default, Security Focus, Patch Focus, Executive Summary), widget list with reorder arrows (Key Metrics, Status Checks, the seven widgets above), Create Custom Widget, Preview As Role (Administrator, Endpoint Administrator, Patch operator · Mumbai HQ, Delhi, Security Analyst, Read-Only Viewer), Colour Thresholds (85/70 default, 80/65, 75/60), Compliance Target %, Reset to Default, Done.
- **Create Custom Widget** wizard, 6 steps: Start, Data, Measure, Views, Filters, Display, with a live preview. Templates: Unencrypted Devices by Department, Average Compliance by OS, Offline Devices by Location, Critical Patches Still Applicable, Failing Checks by Category, Deployments by Status, Top 10 Installed Applications, Low Disk Laptops, Average DEX Score by Model, Devices With Reboot Pending, or Start From Blank.
- The brief mentions a widget preset named "Endpoint Operations". No preset with that name appeared; the four layouts above are the presets in this build (see section 5).

### devices — Devices

- Header counters: All Endpoints 32, Online 27, Offline 5, Locations 4. Actions: Export (menu: PDF "Charts and readable, paginated tables", CSV "Rows and Columns From This View", HTML "Standalone Report for Your Browser"), Create Action.
- Toolbar: search ("name, IP, MAC, DNS, user or any field"), Saved views select, Device group, Device location, Device platform, Device status, Filters, **Columns 20** (of 80), **Advanced Filter**, Devices per page select, select-this-page checkbox, per-row checkboxes.
- Table, default 20 columns, all sortable: Computer Name (required), OS (required), IP Address (required), Hostname, MAC Address, DNS Name, Location, User, Status, Last Seen, OS Version, Department, Computer Type, Manufacturer, Model, Serial Number, RAM (GB), Last Boot, Agent Version, DNS Server.
- Remaining 60 columns (available in the column chooser, the advanced filter and Reports): Device ID, Asset Tag, Domain, Ownership, Chassis, OS Build, Architecture, OS Install Date, Uptime, Time Zone, Processor, CPU Cores, Disk size (GB), Free space (GB), Free space %, BIOS Version, BIOS Date, TPM, Secure Boot, Graphics, Battery Health, Purchase Date, Warranty Until, Connection Type, Subnet, Gateway, Wi-Fi Network, Public IP, VPN, Antivirus, Antivirus Product, Antivirus Definitions, Last Scan, Disk Encryption, Encryption Type, Firewall, USB Storage, Local Admins, Risk, Open Vulnerabilities, Missing Patches, Critical Missing, Update Status, Last Patched, Patch Ring, Reboot Pending, Agent Health, Content Source, Last Logged-In User, Compliance %, Failed Checks, DEX Score, CPU %, Memory %, Boot time (s), Performance, Storage Health, Last Reported, Readiness, Last Deployment.
- **Choose Device Columns** dialog: "20 of 80 columns visible", search that includes hidden columns, per-column up/down reorder and drag handle, Required columns locked, Show All / Required Only / Done.
- **Advanced Filter** dialog: "All rules must match · 80 fields"; each rule is Field, Operator (contains, Does Not Contain, is, Is Not, Starts With, Is Empty, Is Not Empty, >, <) and Value; Add Rule, Clear Rules, live count ("32 of 32 devices match"), Cancel, Apply.
- **Device drawer** (opens on row click): title is the computer name, subtitle "OS version · Location / Department". Sections: Identity (Computer Name, Device ID, Hostname, DNS Name, User, Department), Network (IP, MAC, DNS Server, Location, Zone, Status, Last Seen), System (OS, OS Version, Computer Type, Manufacturer, Model, Serial Number, Processor, RAM, Last Boot, Agent Version), Security & Health (Updates Missing, Missing Patches count, Antivirus, Disk Encryption, Firewall, Risk, CPU Usage, Memory Usage, Free Disk), Device Groups (membership chips), Security Gaps, and a Create Action button.
- Device names follow `<TYPE>-<CITY>-<NNN>`: PC-MUM-101, SRV-DEL-106, MAC-BLR-107, LNX-JPR-108.

### groups — Device groups

- Header counters: Groups 9, Sub-Groups 7, Endpoints Grouped 32/32, Not Grouped 0. Actions: Import CSV (file input), Directory Sync, Create Group.
- Left tree: All Computers 32, then groups with a D (dynamic) or S (static) badge and member count, expandable to sub-groups. Seed: Windows Workstations (Windows 11, Windows 10, Finance), macOS Fleet, Linux Endpoints, Mumbai HQ, Delhi Branch, Bengaluru, Jaipur Branch (each with a Subnet 10.24.1x.0/24 child), Pilot Ring (static), Security Gaps.
- Group header: name, DYNAMIC/STATIC badge, actions Add Sub-Group and Edit; stats Members, Online, Offline, Missing Patches, Sub-Groups.
- Tabs: **Members** (search; columns Device Name, Device ID, IP Address, OS, User, Location, Connection, Patch Status, Manage), **Patches** (Deploy Selected; columns Patch, Severity, Released, Applicable, Remediated, Status, Deploy), **Software** (columns Package, Platform, Version, Installed, Not Installed, Installer, Deploy), **Sub-Groups**, **Membership** (rule list, "Match All Rules (AND)", Edit Membership), **Policies** (Patch Ring: Pilot/Broad/Late, Security Profile: Windows Security/macOS Security; Remove, Choose a Policy), **History** (Time, Changed By, Change, Detail).
- **Create Group** dialog: Group Name, Parent Group (None or any group), Membership Dynamic (Rules) or Static (Manual), rule builder (Add Rule By: IP Subnet, Location, Operating System, Department, Hostname, Device Type; Match All or Any; fields Platform, Operating System, OS Version, Location, Department, Device Type, Status, Risk, Antivirus, Encryption, Firewall, Agent Version, and more).

### enrollment — Enrollment

- Header counters: Enrolled Endpoints 32, On Latest Agent 10/32, Active Tokens 0, Not Checking in 3. Action: Create Token.
- Enrollment Methods: Agent Installer (Ready), Directory Auto-Enroll (Configured), Imaging & VDI (Available), Bulk Import (Not Configured).
- Enrolled by Platform: Windows 22, macOS 3, Linux 7.
- Install Command: tabs Windows, macOS, Linux; `msiexec /i AegisAgent.msi /qn ENROLL_TOKEN="<ENROLLMENT_TOKEN>" SERVER="https://<CONSOLE_HOST>"`; Copy Command; reminder "Never paste real tokens into tickets or chat."
- Enrollment Tokens table: Name, Target Group, Created, Expires, Uses (e.g. 6 / 25), Status (Expired, Active), row menu.
- **New Enrollment Token** dialog: Name, Add Devices to Group, Expires after (days), Maximum Uses; Cancel, Create Token.

### patches — Patches

- Header actions: Patch Policies, "Patch critical (30)". Tabs: **Overview**, **Patch Policies**, **Windows**, **macOS**, **Linux**, **Third-Party Apps**, **Drivers & BIOS**, **All Patches**.
- Overview: KPI tiles Patch Compliance (19 of 32 fully patched), Missing Critical (30 endpoints exposed), Awaiting Approval (19), Failed Installs (5). Widgets: Compliance by OS Version, Missing by Severity, Missing Patch Age, Top Missing Patches (Patch, Severity, Devices), Devices Needing Attention (Device, OS Version, Critical, Missing), Compliance by Platform, Missing Patches, Critical Exposure Age, Updates by Source (Source, Updates, Missing, Critical, Endpoints Affected, Compliance), Priority Updates (Update, Severity, Endpoints, Approval, Deploy). The three chart widgets have a chart-type select.
- Patch Policies: counters Active Policies 2/3, Computers Covered 32/32, Not Covered, Highly Vulnerable; status filter (All, Active, Suspended, Draft); Global Settings; New Policy; table Policy, Content, Rollout (Pilot, Broad, Late), Computers, Compliance, Next Run, Status, Open and row menu. Seed policies: Windows Monthly Security (Patch Tuesday + 1 day, 22:00 device time, in maintenance window), Browsers – All OS (daily 12:00), Third-Party Apps Weekly (Wednesday 13:00).
- Windows / macOS / Linux / Third-Party Apps tabs: compliance headline, endpoints missing updates, critical updates, updates available; filters OS Version, Severity, Vendor (about 25 vendors), Type (OS, Third-party), Released; table of updates with approval and deploy.
- Drivers & BIOS: Endpoints Needing Updates, BIOS & Firmware, Drivers, Awaiting Approval; filter chips; table Update, Type, Severity, Released, Applicable, Installed, Approval (Review, Approve, row menu). Notes such as "needs AC power".
- All Patches: counters All Patches 1103, Applicable 28, Remediated 464, Failed Patches 5, Declined Patches 3, Superseded Patches 616, Zero-Day CVEs 2.

### software — Software

- Header: Software Catalog; actions Export, Import Icons, Add package. Counters: All Packages 200, Installer Added 0, Installer Missing 200, Draft Packages 200, Publishers 150.
- Filters: search, Software category (Browser, Developer Tools, Utilities, Productivity, Collaboration, Security, Networking, Remote Access, Runtimes, Database, Media, Graphics & Design, Engineering, Cloud Storage, System Tools, Virtualization, Finance), Publisher (about 150).
- Catalogue rendered as cards with package logo; per-package actions Edit Package, Deploy, Uninstall, row menu. Bulk Uninstall with a count.
- Package detail drawer and the Add package form were not captured (**not observed**; the walk opened the card but nothing rendered as a separate view).

### liveops — Live Activity

- Tabs: Console, Log Collection, Task Results, Task History (count), Audit Trail.
- **Console**: three request types as cards — Live Data ("Request fresh facts from selected computers"), Run Script ("PowerShell, Shell, Python or Command Prompt"), Collect Logs ("Retrieve agent, system or custom log files"). Configure Request: Task Name, Reason / ticket (optional), Timeout (seconds), Output limit per target (KB).
  - Live Data: Data to Request checklist: Hostname, Operating System, IP Address, Agent Status, Last Seen, CPU Usage, Memory Usage, Free Disk Space.
  - Run Script: Script Runtime (PowerShell, Shell, Python, Command Prompt), Custom Script editor, Load Inventory Example, Import Script. Notes: "PowerShell and Command Prompt target Windows; Shell targets Unix platforms. Python availability is verified by the agent."
  - Collect Logs: Log Source (Agent Logs, System Logs, Application Logs, Custom Path). Note: "The server enforces permitted paths and redacts secrets before returning content."
  - Select Targets: search, platform filter (All Platforms, Windows 11, Windows Server 2016/2019/2022, Windows 10, macOS, Ubuntu, RHEL 8/9), Add Device Group select, Select all applicable (32), Clear Selection, device table. Review Request button.
- **Log Collection**: actions Export List, New Schedule, Collect Now. Counters: Bundles Stored, Hosts Covered 0/32, Failed or Waiting, Storage Used, Next Scheduled. Sub-tabs Collected Logs, Schedules, Storage & Mail. Filters Status (Uploaded, Waiting, Failed, Skipped), Log type (Agent, System / Event, Application, Security, Patch & Update, Custom Path), Hostname, Collected (24 h, 7 d, 30 d). Table Hostname, File Types, Status, Size, Collected, Emailed; Download All (ZIP).
- **Task Results**: empty until a task is opened ("No Task Selected").
- **Task History**: table Task, Type (query, collecting logs, script), Targets, Status, Created. Seed: Endpoint Health Investigation, Agent Diagnostic Collection, Inventory Script Validation.
- **Audit Trail**: Export; table Time, Actor, Action, Target, Result.

### deployments — Deployments

- Header: Export, New action. Status chips: All Actions 7, Active / waiting, Scheduled, Completed, With Failures, Paused / cancelled. Search ("action, package or hostname"), Hide Examples toggle, type filter (Install Software, Update Software, Uninstall Software, Repair Software, Deploy Patches, Refresh Computer Details, Vulnerability Scan, Collect Logs, Restart Devices, Roll Back Patches, Remediate Configuration).
- Table: Action / Package, Computers (count plus first two hostnames), Status, Results (done, failed, pending, "n / m Results Recorded"), Triggered By / Time, View Details.
- **Deploy an Action** dialog, 3 steps: **Choose Action** (action type list and package list with version and platform), **Select Computers** (tabs Select Computers, Device Groups, Paste Hostnames; location filter; "Select all applicable (22)"; table Computer / Hostname, OS / IP Address, Location, Connection; other-platform machines greyed with "Different platform"), **Review & Trigger** (Action Name, Action, Package, Platform, Targets list, Connection split, Queue Now or Schedule for Later, Pre-Deployment Checks: Free Disk ≥ 10 %, On AC Power (Laptops), No Pending Restart; Pre-Script and Post-Script select: None, Create Restore Point, Close Outlook and Teams, Clear Update Cache, Suspend BitLocker for One Restart, Verify Services After Install, Send Completion Notice; Wake Offline Computers First (Wake-on-LAN); Notes; Back; Create Action).
- Creating an action adds a row immediately (id `DEP-xxxxxxxx`) and an audit entry; the reference then returns to the list. A separate "deployment created" success page and a deployment details page were **not observed** (View Details did not navigate in the walk).

### vulns — Vulnerabilities

- Header counters: 31 Open Findings, 6 Known Exploited, 13 SLA Overdue, 30/32 Devices Scanned, 2 Projects. Actions: Export CSV, New Scan. Severity chips Critical 61, High 103, Medium 87, Low 0.
- KPI tiles: Exposure Score 558 / 1000 (Grade D), Open Findings (31 on 32 devices), Critical & High (22, 71 %), Known Exploited (6), SLA Overdue (13, 42 %), Scan Coverage (94 %, 30 / 32).
- Widgets with view and chart-type selects: Open Findings Trend (By Severity, By Platform, By Detection, Total; Column, Bar, Donut, Line; 12-week series), SLA Status (All severities, Critical only, High only; Within SLA, Due soon, Overdue), Top Priorities (table Check ID, Finding, Severity, Priority, Devices; severity filter; "All findings →"), Vulnerability Age, Top Fixes Out of Compliance (Fix, Findings, Devices Missing It; "Remediations →"), Threat Indicators (Known exploited, Ransomware, Public exploit, Wormable, Zero-day; platform filter).
- Tabs: **Findings** (Columns 10; filters search by name/CVE/check id/product, Severity, Detection, Threat, Status, SLA, State, Platform; columns Severity, Priority, CVSS, Finding, Threats, Detection, Devices, Age, SLA, State; Previous / Next paging), **Devices**, **Remediations** (Fix, Findings, Devices Missing It; platform filter), **Projects**, **Scans** (table Scan, Template, Targets, Status, Started, Duration, Devices, New Findings, Fixed).
- **New Scan** drawer: Scan Name, Template (Full Vulnerability Scan, Critical & Exploited Quick Scan, Configuration Audit, Discovery), Targets (All Devices, Platform: Windows/macOS/Ubuntu, Site: Mumbai/Delhi/Bengaluru/Jaipur, Device group: Servers), Schedule (Run Now, Daily 03:00, Weekly Friday 02:00, Monthly 1st 01:00), Authenticated scan checkbox, Cancel, Start Scan. The reference uses "Site" in scan targets where the rest of the console says "Zone".
- Finding detail drawer: not observed.

### profiles — Configuration (Beta)

- Header: Export, Custom Check, Evaluate Now, overflow menu. Tabs: Overview, Checks, Devices, Exceptions, Benchmarks, Profiles.
- KPI tiles: Overall Compliance 80 %, Checks in Scope 200, Failing Checks 165, Non-Compliant Devices 28/32, Exceptions 0.
- Overview widgets: Compliance by Framework, Compliance by Platform, Device Compliance (bands 90–100 %, 75–89 %, Below 75 %), Compliance by Category (about 20 categories: Account Policies, Antivirus & Defender, Audit Policy, Boot & Kernel, Browser & Office, Credential Protection, Disk Encryption, Event Logs, Filesystem, Firewall, Integrity and more), Top Failing Checks (table Check, Platform, Severity, Frameworks, Failing, Compliance; "All Failing Checks"), Configuration Profiles (PREVIEW) with Create Profile and a table Profile, Platform, Assigned Devices, Compliance, Status, Last Modified; Security Posture (Disk Encryption, Antivirus, Firewall: Protected, Needs Review, Not Protected).
- Shared filters on the tabs: search (check id, title, category), Framework (CIS, DISA STIG, PCI DSS, HIPAA), Platform (Windows, macOS, Linux), Device Group, Category, Severity, Result.
- Profiles tab: Security Posture counts, Configuration Compliance 81.3 %, **Version History — Windows Security Profile** (Setting × V6/V7/V8/Current, e.g. Password Length 8/10/14, USB Storage Allowed→Blocked, Screen Lock 15→10 min; Rollback to v7), platform filter, profile table.

### dex — DEX

- Header: "Digital Employee Experience", action Investigate in Live Activity.
- Experience Score 76/100, Distribution Good 10 / Warning 10 / Poor 12, Score Breakdown (Boot, CPU, Memory, Disk and others), Top Experience Issues, Endpoints With the Lowest Scores (table Computer, Score, Boot, CPU, Memory, Disk Free), How the Score Works (table Measure, Threshold, Points).

### insight — AEGIS Insight (Beta)

- "New Diagnosis": endpoint context line ("PC-MUM-101 · Neha Rao · Windows 11 · DEX 38"), Describe the Problem textarea, Run Diagnostics, Save Diagnostic Template. Result panels: Diagnostic Checks, Recommended Actions, Run Remediation, and a "Verified — remediation successful" state. Empty state "No Diagnosis Yet". A "Review" action was present in the markup.
- Licensing lists it as "Preview · Not Counted in Licensed Seats".

### sites — Aegis Zones

- Action: Refresh Discovery; "Open data summary" link. Headline stats: WAN Saved 71 %, WAN Avoided This Week 184 GB, Peer Cache Hit Rate 86 %, Direct Downloads 14 %, Avg Local Delivery 18 MB/s.
- Delivery Distribution (86 % local cached, 14 % direct central), Aegis Zone Delivery Efficiency (per-zone %), Content Delivery Path (Central Repository 412 GB served → Aegis Zone Peer Cache 184 GB avoided → Local Peer 96 GB shared → Endpoint 32 targets).
- Table: Aegis Zone, Devices, Connectivity, Bandwidth, Peer Cache (Not Required, Peer Cache Active), Last Sync, Status.

### peercache — Peer cache

- Table: Aegis Zone, Current Peer Cache (host), Agent Health, Content Cached (list), Cache Size, Last Transfer, Status; row actions Re-elect, Disable, Activity, overflow menu.

### reports — Reports

- Actions: Custom report. Leadership & Review strip: Computers in View, Offline Computers, Pending Updates, Security Issues, SEBI, RBI, CISO Security, Compliance, Leadership Summary. Grid/List toggle, Favorites, search, Sort (Default Order, Name A–Z, Recently Opened, Favorites First). Category chips: All Reports 20, Computers & Software 5, Daily Operations 6, Security 4, Leadership 5.
- 20 reports: All Computers, Offline Computers, Operating Systems, Installed Software, Software Licenses, Pending Updates, Update Results, Security Issues, Antivirus Status, Disk Encryption, USB Activity, Computer Performance, Storage Space, Software Deployments, User & Computer Activity, Compliance Overview, SEBI Report, RBI Report, CISO Security Report, Leadership Summary. Each card: title, description, headline figure, "n charts · n columns", Favorite, Open Report.
- **Open Report**: not captured as a separate screen (**not observed**).
- **Create Custom Report** (breadcrumb `Overview › Reports › Custom Report`): Report Name, Description, Data Source (Computers, Deployments, Software Packages, Audit Trail), Columns in display order (Computer Name, Hostname, Operating System, IP Address, Zone, Status, User, Last Seen, CPU usage %, Memory usage %, Free disk %, Missing Patches), Filters (match all, Add filter), Summary chart / group by, Sort by and Sort Direction, live Report Preview, Save Custom Report. Export formats elsewhere: PDF, CSV, HTML; the bundle also contains html2canvas and pako for PDF and archive generation.

### integrations — Integrations

- Tabs: Connectors, SIEM & Syslog, Notifications, Delivery Log. Action: Custom Webhook.
- Connectors: filter All / Connected / Attention / Disabled; cards ServiceNow (Incidents for Critical CVEs), Splunk (Audit stream), Microsoft Teams (Attention: token expiring), Slack (Disabled), Custom Webhook, Directory Connector (Entra ID); each shows Last Sync and Scope, with Configure, Test, Activity and overflow actions.
- SIEM & Syslog: counters Connected 0/5, Events Forwarded, Retrying, Errors; destinations Syslog Forwarder, Splunk HTTP Event Collector, Microsoft Sentinel, IBM QRadar (LEEF), Elastic; Set Up / Test per destination.
- Notifications: SMTP Mail Server, Microsoft Teams, Slack, Jira, Generic Webhook (HTTPS POST JSON); Alert Rules (Deployment Failed, Critical Vulnerability Found, Compliance below target and others).
- Delivery Log: filters Connector, Event Type (Audit Trail, Deployments, Compliance), Result (Delivered, Retrying); table Time, Connector, Event Type, Event, Result; Export.

### admin — Administration

- Sections: **Identity & SSO** (Okta SAML, Microsoft Entra ID OIDC, Generic SAML 2.0, LDAP / Active Directory; each Disabled / Setup Required with Configure), **Users** (Add user; table User, Role, Access, Actions: Edit, Access, overflow; seed "Aegis Admin · admin@example.test · Administrator"), **Roles & Content Access** (Create role; role cards with Devices/Software/Deployments/Reports/Queries/Audit permissions and Endpoint Zones, Software Content, Device Groups scope; seed roles Administrator (System Role), Endpoint Administrator, Patch Operator (Mumbai HQ, Delhi; Browser, Utilities), Security Analyst, Read-Only Viewer; Edit Permissions), **Agent Enrollment** (Register endpoint; table Endpoint, Zone, Agent Version, Last Seen, Connection).
- **API access** (tokens): no screen was found in the reference. API tokens exist as data (Overview "Expiring Soon" lists "Automation Pipeline" and "Legacy Reporting" API tokens). See section 5.

### licensing — Licensing

- Header: Upload License (file input). Plan Premium, Endpoints in Use 32/50, Renews in 150 days, Modules 6/7. Seat Usage (64 %), Seats by Platform (Windows 22, macOS 3, Linux 7), License Term (Started Apr 1 2026, Ends Mar 31 2027, 59 % elapsed), Modules: Endpoint Management, Patch Management, Live Activity, Digital Employee Experience, Aegis Zones & Peer Cache, Vulnerability Management (Add-on), AEGIS Insight (Preview).

### diagnostics — Diagnostics

- Actions: Download Diagnostic Bundle, Run Health Check. Counters: Services Healthy 6/7, Degraded 1, Agents Connected 27/32, Warnings (24 h) 24.
- Services table (Console API, Agent Gateway, Patch Catalog Sync, Directory Sync, Peer Cache Controller, Notification Service, Database): Service, Status, Signal, Detail. Events, Last 24 Hours: chart with Warnings / Errors toggles, totals, Busiest Hour.

## 3. Cross-cutting behaviours

- **Charts:** every analytic widget has a View select and a Chart Type select; chart types used: Donut, Pie, Column, Bar, Rings (radial), Line.
- **Export:** PDF, CSV and HTML from list pages; the Reports module adds CSV and PDF per report.
- **Persistence:** the reference keeps state in the browser (saved views, layout, created actions). The rebuild moves all of it server-side.
- **Badges:** Beta (Configuration, AEGIS Insight), Preview (Configuration Profiles, AEGIS Insight in Licensing), DYNAMIC / STATIC on groups.
- **Status colours:** Online/Healthy/Completed green, Offline/Failed/Expired red, Warning/Paused/Degraded amber, Queued/Scheduled blue, neutral grey, matching the pill set in `tokens.css`.

## 4. Data shapes the mock must reproduce

Hostname pattern `<PC|SRV|MAC|LNX>-<MUM|DEL|JPR|BLR>-<NNN>`; IP `10.24.1<zone>.<host>`; MAC prefix `02:AE:`; OS values Windows 10/11, Windows Server 2016/2019/2022, Ubuntu 22.04 LTS, Red Hat Enterprise Linux 8/9, macOS; zones Mumbai HQ, Delhi Branch, Jaipur Branch, Bengaluru; agent versions 3.4.0–3.4.2; deployment ids `D-10nn` and `DEP-xxxxxxxx`; patch ids such as KB5071234 and DRV-2210.

## 5. Differences between the brief and the reference (decisions needed)

| #   | Brief says                                                                                                    | Reference build has                                                                                                                                                                                                                                           | Proposal (not applied until you confirm)                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | New-deployment wizard: Content → Targets → Schedule → Network → Options → Review                              | "Deploy an Action" with 3 steps: Choose Action, Select Computers, Review & Trigger. Schedule (Queue Now / Later), Wake-on-LAN, pre-checks, pre/post scripts and notes all sit on the Review step. The only 6-step wizard is Create Custom Widget on Overview. | Regroup existing fields into the 6 steps: Content = action and package; Targets = computers; Schedule = Queue Now / Later; Network = Wake-on-LAN; Options = pre-checks, pre/post steps, notes; Review. No new capability. Routes and the contract already use the 6 step names. |
| 2   | Device detail has tabs including overview, vulnerabilities, diagnostics                                       | A drawer with Identity, Network, System, Security & Health, Device Groups, Security Gaps                                                                                                                                                                      | Overview tab = the drawer content. Vulnerabilities tab = existing findings filtered to the device. Diagnostics tab = agent health and recent jobs, which the reference only hints at. The Diagnostics tab is new behaviour; confirm before building it.                         |
| 3   | "API access" (tokens) under Administration                                                                    | No such screen found; API tokens appear only as data on Overview                                                                                                                                                                                              | Build token list, create (scoped, shown once) and revoke, as specified in the contract. This is the one place the brief adds a screen the reference lacks.                                                                                                                      |
| 4   | Roles: Super Admin, Admin, Operator, Auditor, Read-only                                                       | Roles Administrator, Endpoint Administrator, Patch Operator, Security Analyst, Read-Only Viewer, plus Create role with scoping to zones, software categories and groups                                                                                       | Five built-in system roles from the brief; keep Create role for scoped custom roles. Overview's "Preview As Role" list follows the roles that exist.                                                                                                                            |
| 5   | Deployment-created success page; deployment details page                                                      | Creating an action returns to the list; View Details did not open a separate view in the walk                                                                                                                                                                 | Build both as brief sub-routes with content derived from the Deployments table row and per-endpoint results. Confirm they should exist.                                                                                                                                         |
| 6   | Setup checklist: Create Administrator → Enroll First Endpoint → Configure Aegis Zone → Run Vulnerability Scan | A "Setup 3/7" chip                                                                                                                                                                                                                                            | Four steps per the brief; the reference's seven were not captured.                                                                                                                                                                                                              |
| 7   | Widget preset "Endpoint Operations"                                                                           | Layouts Default, Security Focus, Patch Focus, Executive Summary                                                                                                                                                                                               | Ship the four layouts; add "Endpoint Operations" only if you can describe it.                                                                                                                                                                                                   |
| 8   | Ask Aegis box                                                                                                 | Free-text box with five suggestion chips on Overview                                                                                                                                                                                                          | The contract has no natural-language endpoint. Proposal: chips and typed text map to saved Devices filters client-side. Say if you want a server-side query endpoint instead.                                                                                                   |
| 9   | Zones are "Delhi Branch" etc.                                                                                 | Overview filter and the Deployments table say "Delhi", Vulnerabilities scan says "Site: Delhi"                                                                                                                                                                | Use "Delhi Branch" and the word "Zone" everywhere.                                                                                                                                                                                                                              |

Not observed and therefore not specified (the walk did not surface a separate view): notification
panel, Help, user menu, global Search console, setup checklist popover, Software package form and
detail, Report open view, Vulnerabilities finding drawer, deployment details. Phase 4 needs a
decision on each: derive from the nearest observed view, or specify first.

## 6. Remote Desktop audit (brief rule 4)

- The console UI contains **no** Remote Desktop, screen sharing, remote shell or terminal session, and no mouse or keyboard takeover. Searching the whole file for "remote desktop", "remote control", "screen share", "screen view", "remote session" and "terminal session" finds only the software catalog entries below.
- **Catalog entries** (third-party packages in the Software catalog under the category "Remote Access", plus VDI clients): AnyDesk, TeamViewer, RealVNC Viewer, TightVNC, Splashtop Business, Chrome Remote Desktop Host, Microsoft Remote Desktop, Remote Desktop Connection Manager, Citrix Workspace, Omnissa Horizon Client. They are software titles an admin can deploy, not a console capability.
- **Decision needed:** rule 4 says to remove every reference to "Remote Desktop". Three catalog titles contain those words literally. Options: (a) keep every title as ordinary catalog data; (b) drop the three literally named ones and keep the rest; (c) drop the whole Remote Access category. Until you choose, the seed will not include the three literally named titles or the Remote Access category, and the contract and RBAC list contain nothing remote-control related (checked with a grep on the contract).
- **Remote script execution is kept as in the reference:** Live Data, Run Script (PowerShell, Shell, Python, Command Prompt), Collect Logs, Task Results, Task History, Audit Trail. In the contract it is `POST /liveops/script-jobs`, `GET /liveops/script-jobs/{id}`, `GET /liveops/script-jobs/{id}/results`, with no session or socket resource.
