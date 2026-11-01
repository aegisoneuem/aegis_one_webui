import type { PageId } from '../app/nav';

/**
 * What each page contains, taken from docs/feature-inventory.md. The Phase 1 route skeleton renders
 * this outline; Phase 4 replaces each entry with the real page.
 */
export interface PageOutline {
  tabs?: string[];
  sections: string[];
  actions?: string[];
}

export const OUTLINES: Record<PageId, PageOutline> = {
  home: {
    sections: [
      'Overall Health Score',
      'Patch Compliance',
      'Security Posture',
      'Deployment Status',
      'Expiring Soon',
      'Needs Attention',
      'Recent Activity',
    ],
    actions: ['Custom Widget', 'Customize', 'Export', 'New Action'],
  },
  devices: {
    sections: [
      'Endpoint Inventory table (80 columns, 20 shown by default)',
      'Filters: group, location, platform, status',
      'Saved views',
      'Advanced Filter (field, operator, value rules)',
    ],
    actions: ['Export (PDF, CSV, HTML)', 'Create Action', 'Columns', 'Advanced Filter'],
  },
  groups: {
    tabs: ['Members', 'Patches', 'Software', 'Sub-Groups', 'Membership', 'Policies', 'History'],
    sections: ['Group list', 'Group summary', 'Member table'],
    actions: ['Directory Sync', 'Create Group', 'Add Sub-Group', 'Edit', 'Import groups from CSV'],
  },
  enrollment: {
    sections: [
      'Enrollment Methods',
      'Enrolled by Platform',
      'Install Command',
      'Enrollment Tokens table',
    ],
    actions: ['Create Token', 'Copy Command'],
  },
  patches: {
    tabs: [
      'Overview',
      'Patch Policies',
      'Windows',
      'macOS',
      'Linux',
      'Third-Party Apps',
      'Drivers & BIOS',
      'All Patches',
    ],
    sections: [
      'Compliance by OS Version',
      'Missing by Severity',
      'Missing Patch Age',
      'Top Missing Patches',
      'Devices Needing Attention',
      'Updates by Source',
      'Priority Updates',
    ],
    actions: ['Patch Policies', 'Patch critical', 'Deploy'],
  },
  software: {
    sections: ['Software Catalog (200 packages)', 'Package detail', 'Filters: category, publisher'],
    actions: ['Export', 'Add package', 'Edit Package', 'Deploy', 'Uninstall'],
  },
  liveops: {
    tabs: ['Console', 'Log Collection', 'Task Results', 'Task History', 'Audit Trail'],
    sections: [
      'Live Data request',
      'Run Script (PowerShell, Shell, Python, Command Prompt)',
      'Collect Logs',
      'Select Targets',
    ],
    actions: ['Review Request'],
  },
  deployments: {
    sections: ['Deployment actions table', 'Status filters', 'Action type filter'],
    actions: ['Export', 'New action', 'View Details'],
  },
  vulns: {
    tabs: ['Findings', 'Devices', 'Remediations', 'Projects', 'Scans'],
    sections: [
      'Exposure Score',
      'Open Findings Trend',
      'SLA Status',
      'Top Priorities',
      'Vulnerability Age',
      'Top Fixes Out of Compliance',
      'Threat Indicators',
    ],
    actions: ['Export CSV', 'New Scan'],
  },
  profiles: {
    tabs: ['Overview', 'Checks', 'Devices', 'Exceptions', 'Benchmarks', 'Profiles'],
    sections: [
      'Compliance by Framework',
      'Compliance by Platform',
      'Device Compliance',
      'Compliance by Category',
      'Top Failing Checks',
      'Configuration Profiles',
    ],
    actions: ['Export', 'Custom Check', 'Evaluate Now', 'Create Profile'],
  },
  dex: {
    sections: [
      'Experience Score',
      'Distribution',
      'Score Breakdown',
      'Top Experience Issues',
      'Endpoints With the Lowest Scores',
      'How the Score Works',
    ],
    actions: ['Investigate in Live Activity'],
  },
  insight: {
    sections: ['Describe the Problem', 'Diagnostic Checks', 'Recommended Actions'],
    actions: ['Run Diagnostics', 'Save Diagnostic Template', 'Run Remediation'],
  },
  sites: {
    sections: [
      'Aegis Zones table',
      'Delivery Distribution',
      'Aegis Zone Delivery Efficiency',
      'Content Delivery Path',
    ],
    actions: ['Refresh Discovery'],
  },
  peercache: {
    sections: ['Peer cache per zone table'],
    actions: ['Re-elect', 'Disable', 'Activity'],
  },
  reports: {
    sections: [
      'Leadership & Review',
      'Browse Reports (Computers & Software, Daily Operations, Security, Leadership)',
      'Favorites',
    ],
    actions: ['Custom report', 'Open Report'],
  },
  integrations: {
    tabs: ['Connectors', 'SIEM & Syslog', 'Notifications', 'Delivery Log'],
    sections: ['Connector cards'],
    actions: ['Custom Webhook', 'Configure', 'Test', 'Activity'],
  },
  admin: {
    sections: [
      'Identity & SSO',
      'Users',
      'Roles & Content Access',
      'Agent Enrollment',
      'API access',
    ],
    actions: ['Configure'],
  },
  licensing: {
    sections: ['Seat Usage', 'Seats by Platform', 'License Term', 'Modules'],
    actions: ['Upload license'],
  },
  diagnostics: {
    sections: ['System Health', 'Services table', 'Events, Last 24 Hours'],
    actions: ['Download Diagnostic Bundle', 'Run Health Check'],
  },
};
