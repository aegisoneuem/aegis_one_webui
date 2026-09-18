import { originalDevices } from '../data/devices';
export interface ReportTemplate {
  id: string;
  title: string;
  description: string;
  group: 'Patch & Vulnerability' | 'Other Reports';
  columns: string[];
  rows: string[][];
  metrics: [string, string][];
  note: string;
}
const note = 'Demo snapshot from the approved console. Preview and exports contain the displayed sample rows, not a live fleet extract.';
export const templates: ReportTemplate[] = [{
  id: 'patch-compliance',
  title: 'Patch Compliance Report',
  description: 'Compliance by platform for the current reporting cycle.',
  group: 'Patch & Vulnerability',
  columns: ['Platform', 'Endpoints', 'Compliant', 'Missing', 'Compliance'],
  rows: [['Windows', '14,200', '13,490', '710', '95.0%'], ['macOS', '5,200', '4,836', '364', '93.0%'], ['Linux', '5,440', '5,074', '366', '93.3%']],
  metrics: [['24,840', 'Fleet endpoints'], ['94.2%', 'Patch compliance']],
  note
}, {
  id: 'missing-patch',
  title: 'Missing Patch Report',
  description: 'Endpoints with outstanding updates.',
  group: 'Patch & Vulnerability',
  columns: ['Endpoint', 'Platform', 'Patch state', 'Risk', 'Last check-in'],
  rows: originalDevices.filter(d => d.patch !== 'Compliant').map(d => [d.id, d.os, d.patch, d.risk, d.seen]),
  metrics: [['1,440', 'Fleet endpoints missing updates']],
  note
}, {
  id: 'vulnerability',
  title: 'Vulnerability Summary Report',
  description: 'Security posture of the affected endpoint examples.',
  group: 'Patch & Vulnerability',
  columns: ['Endpoint', 'Risk', 'Platform', 'Patch state'],
  rows: originalDevices.filter(d => d.risk !== 'Low').map(d => [d.id, d.risk, d.os, d.patch]),
  metrics: [['312', 'Critical exposure · fleet']],
  note
}, {
  id: 'cve',
  title: 'CVE Exposure Report',
  description: 'Patch-linked exposure by platform.',
  group: 'Patch & Vulnerability',
  columns: ['Platform', 'Critical exposures', 'Ready for remediation'],
  rows: [['Windows', '54', '42'], ['macOS', '18', '11'], ['Linux', '12', '8']],
  metrics: [['84', 'Platform critical exposures'], ['61', 'Ready for remediation']],
  note: 'Demo platform-level exposure summary from Patch management. CVE-level records require the vulnerability API; no CVE identifiers are fabricated here.'
}, {
  id: 'software',
  title: 'Software Inventory Report',
  description: 'Software inventory preview for the selected endpoint.',
  group: 'Other Reports',
  columns: ['Endpoint', 'Product', 'Inventory state'],
  rows: [],
  metrics: [],
  note: 'Software inventory requires an inventory API result. No installed-product records have been inferred from package catalog entries.'
}, {
  id: 'license',
  title: 'Software License Report',
  description: 'Installed seats against purchased entitlements.',
  group: 'Other Reports',
  columns: ['Product', 'Licensed seats', 'Installed seats', 'Utilization'],
  rows: [],
  metrics: [],
  note: 'Connect entitlement and software inventory data to generate this report. Console licensing is separate from third-party software license compliance.'
}, {
  id: 'device',
  title: 'Device Inventory Report',
  description: 'Endpoint ownership, platform and connectivity.',
  group: 'Other Reports',
  columns: ['Endpoint', 'User', 'Platform', 'Connectivity', 'Aegis Zone', 'Last check-in'],
  rows: originalDevices.map(d => [d.id, d.user, d.os, d.status, d.site === 'Delhi' ? 'Delhi Branch' : d.site, d.seen]),
  metrics: [['24,840', 'Fleet endpoints'], ['2,230', 'Offline · fleet']],
  note
}, {
  id: 'not-seen',
  title: 'Devices Not Checked-In Report',
  description: 'Sample endpoints without a recent heartbeat.',
  group: 'Other Reports',
  columns: ['Endpoint', 'Platform', 'Aegis Zone', 'Last check-in'],
  rows: originalDevices.filter(d => d.status === 'Offline').map(d => [d.id, d.os, d.site, d.seen]),
  metrics: [['2,230', 'Offline · fleet']],
  note
}, {
  id: 'dex',
  title: 'Experience (DEX) Report',
  description: 'Experience posture for workstation examples.',
  group: 'Other Reports',
  columns: ['Endpoint', 'User', 'Platform', 'Experience state'],
  rows: originalDevices.filter(d => d.dex !== '-').map(d => [d.id, d.user, d.os, d.dex]),
  metrics: [['82 / 100', 'Overall fleet score']],
  note
}, {
  id: 'rollout',
  title: 'Agent Rollout Report',
  description: 'Enrollment-token progress from the console.',
  group: 'Other Reports',
  columns: ['Enrollment token', 'Scope', 'Enrolled', 'Capacity', 'State'],
  rows: [['Finance laptops — Sep rollout', 'Mumbai HQ · Finance Windows', '0', '500', 'Active'], ['Pilot Ring — Q3', 'All Aegis Zones · Pilot Ring', '23', '50', 'Active'], ['Data Center servers', 'Data Center', '1,210', '1,500', 'Expired']],
  metrics: [],
  note: 'Enrollment counts from the approved console sample. These represent token utilization, not verified installation success.'
}, {
  id: 'audit',
  title: 'Admin Audit Trail Report',
  description: 'Report configuration changes made in this browser.',
  group: 'Other Reports',
  columns: ['Time', 'Action', 'Schedule', 'Details'],
  rows: [],
  metrics: [],
  note: 'Local report activity only. The production audit API must supply console-wide, protected audit records.'
}];
export type Frequency = 'One-time' | 'Daily' | 'Weekly' | 'Monthly';
export type ExportFormat = 'CSV' | 'XLSX' | 'PDF';
export interface Schedule {
  id: string;
  name: string;
  template: string;
  email: string;
  frequency: Frequency;
  format: ExportFormat;
  next: string;
  last: string;
  paused: boolean;
}
export interface ReportEvent {
  time: string;
  action: string;
  name: string;
  detail: string;
}
export const initialSchedules: Schedule[] = [['patch-compliance', 'Patch Compliance Report', 'it-ops@company.com', 'Weekly', '2026-09-24T08:00'], ['license', 'Software License Report', 'procurement@company.com', 'Monthly', '2026-10-01T09:00'], ['vulnerability', 'Vulnerability Summary Report', 'secops@company.com', 'Daily', '2026-09-18T07:00'], ['not-seen', 'Devices Not Checked-In Report', 'fleet-admin@company.com', 'Weekly', '2026-09-24T17:00'], ['audit', 'Admin Audit Trail Report', 'compliance@company.com', 'Monthly', '2026-09-30T23:00'], ['device', 'Device Inventory Report', 'it-ops@company.com', 'Daily', '2026-09-18T06:00']].map((r, i) => ({
  id: `schedule-${i + 1}`,
  template: r[0],
  name: r[1],
  email: r[2],
  frequency: r[3] as Frequency,
  format: 'CSV',
  next: r[4],
  last: '',
  paused: i === 3
}));
