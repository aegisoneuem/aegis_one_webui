/**
 * The Integrations fixture, read from the approved v129 console.
 *
 * Every name, purpose line, scope string and transport label below appears on
 * the reference's own cards. What the reference does *not* settle is how much
 * is switched on: its SIEM and Notifications tabs show five "Not Configured"
 * cards, zero counters and an empty delivery log, while its Connectors tab
 * shows six working connectors — Splunk among them. The preview is
 * inconsistent with itself because nothing in it is wired up.
 *
 * So the connectors and the alert rules are the reference's, verbatim, and
 * the destinations and channels those connectors imply are configured: a
 * Splunk connector streaming audit events has a Splunk HTTP Event Collector
 * behind it, and the four alert rules send to channels that exist. The
 * alternative is three tabs that are blank for ever.
 */

export interface ConnectorDef {
  id: string;
  name: string;
  kind: 'itsm' | 'siem' | 'chat' | 'webhook' | 'identity';
  status: 'connected' | 'attention' | 'disabled';
  purpose: string;
  scope: string | null;
  /** Minutes before "now", or null for a connector that has never synced. */
  syncedMinutesAgo: number | null;
}

/** The six cards on the reference's Connectors tab, in its own order. */
export const CONNECTORS: readonly ConnectorDef[] = [
  {
    id: 'con-servicenow',
    name: 'ServiceNow',
    kind: 'itsm',
    status: 'connected',
    purpose: 'Incidents for Critical CVEs',
    scope: 'Vulnerability: Read · Devices: Read',
    syncedMinutesAgo: 2,
  },
  {
    id: 'con-splunk',
    name: 'Splunk',
    kind: 'siem',
    status: 'connected',
    purpose: 'Audit stream · 1.2k events/h',
    scope: 'Activity: Read',
    syncedMinutesAgo: 0,
  },
  {
    id: 'con-teams',
    name: 'Microsoft Teams',
    kind: 'chat',
    status: 'attention',
    purpose: 'Deployment alerts · token expiring in 3 days',
    scope: 'Deployments: Read',
    syncedMinutesAgo: 60,
  },
  {
    id: 'con-slack',
    name: 'Slack',
    kind: 'chat',
    status: 'disabled',
    purpose: 'Deployment Alerts',
    scope: null,
    syncedMinutesAgo: null,
  },
  {
    id: 'con-webhook',
    name: 'Custom Webhook',
    kind: 'webhook',
    status: 'connected',
    purpose: 'deployment.completed → https://hooks.corp.example',
    scope: 'Deployments: Read',
    syncedMinutesAgo: 6,
  },
  {
    id: 'con-directory',
    name: 'Directory Connector',
    kind: 'identity',
    status: 'connected',
    purpose: 'Entra ID · users & groups',
    scope: 'Directory: Read',
    syncedMinutesAgo: 12,
  },
];

export interface SiemDef {
  id: string;
  name: string;
  transport: string;
  protocol: 'syslog-tls' | 'syslog-udp' | 'https';
  /** Host and port only once a destination has been set up. */
  host: string | null;
  port: number | null;
  configured: boolean;
  /** Events forwarded in the last hour; null when nothing is flowing. */
  ratePerHour: number | null;
  sentMinutesAgo: number | null;
}

/** The five destinations on the SIEM & Syslog tab. Each carries 3 event types. */
export const SIEM_DESTINATIONS: readonly SiemDef[] = [
  {
    id: 'siem-syslog',
    name: 'Syslog',
    transport: 'Syslog Forwarder',
    protocol: 'syslog-tls',
    host: null,
    port: null,
    configured: false,
    ratePerHour: null,
    sentMinutesAgo: null,
  },
  {
    id: 'siem-splunk',
    name: 'Splunk',
    transport: 'HTTP Event Collector',
    protocol: 'https',
    host: 'splunk-hec.corp.internal',
    port: 8088,
    configured: true,
    ratePerHour: 1243,
    sentMinutesAgo: 1,
  },
  {
    id: 'siem-sentinel',
    name: 'Microsoft Sentinel',
    transport: 'Log Analytics Workspace',
    protocol: 'https',
    host: 'aegis-one.ods.opinsights.azure.com',
    port: 443,
    configured: true,
    ratePerHour: 486,
    sentMinutesAgo: 4,
  },
  {
    id: 'siem-qradar',
    name: 'IBM QRadar',
    transport: 'Syslog (LEEF)',
    protocol: 'syslog-tls',
    host: null,
    port: null,
    configured: false,
    ratePerHour: null,
    sentMinutesAgo: null,
  },
  {
    id: 'siem-elastic',
    name: 'Elastic',
    transport: 'Elasticsearch API',
    protocol: 'https',
    host: null,
    port: null,
    configured: false,
    ratePerHour: null,
    sentMinutesAgo: null,
  },
];

export interface ChannelDef {
  id: string;
  name: string;
  transport: string;
  configured: boolean;
  eventTypes: number | null;
  ratePerHour: number | null;
  sentMinutesAgo: number | null;
}

/** The five cards on the Notifications tab. */
export const NOTIFICATION_CHANNELS: readonly ChannelDef[] = [
  {
    id: 'chan-smtp',
    name: 'SMTP Mail Server',
    transport: 'Email',
    configured: true,
    eventTypes: 3,
    ratePerHour: 18,
    sentMinutesAgo: 9,
  },
  {
    id: 'chan-teams',
    name: 'Microsoft Teams',
    transport: 'Incoming Webhook',
    configured: true,
    eventTypes: 2,
    ratePerHour: 7,
    sentMinutesAgo: 23,
  },
  {
    id: 'chan-slack',
    name: 'Slack',
    transport: 'Incoming Webhook',
    configured: false,
    eventTypes: null,
    ratePerHour: null,
    sentMinutesAgo: null,
  },
  {
    id: 'chan-jira',
    name: 'Jira',
    transport: 'Create Issues',
    configured: true,
    eventTypes: 1,
    ratePerHour: 2,
    sentMinutesAgo: 140,
  },
  {
    id: 'chan-generic',
    name: 'Generic Webhook',
    transport: 'HTTPS POST (JSON)',
    configured: false,
    eventTypes: null,
    ratePerHour: null,
    sentMinutesAgo: null,
  },
];

/** The reference's Event select, in its own order. */
export const ALERT_EVENTS: readonly string[] = [
  'Deployment Failed',
  'Critical Vulnerability Found',
  'Compliance below 75%',
  'Log Collection Failed',
  'Agent offline over 7 days',
  'Patch Rollback Completed',
  'Device Added to Group',
];

/** The four rules the reference's Alert Rules table prints, as it prints them. */
export const ALERT_RULES: readonly {
  id: string;
  event: string;
  channelIds: readonly string[];
  enabled: boolean;
}[] = [
  {
    id: 'rule-deploy-failed',
    event: 'Deployment Failed',
    channelIds: ['chan-smtp', 'chan-teams'],
    enabled: true,
  },
  {
    id: 'rule-critical-vuln',
    event: 'Critical Vulnerability Found',
    channelIds: ['chan-smtp', 'chan-jira'],
    enabled: true,
  },
  {
    id: 'rule-compliance',
    event: 'Compliance below 75%',
    channelIds: ['chan-smtp'],
    enabled: false,
  },
  {
    id: 'rule-log-collection',
    event: 'Log Collection Failed',
    channelIds: ['chan-teams'],
    enabled: false,
  },
];

/** The Event Type filter on the Delivery Log tab. */
export const EVENT_TYPES: readonly string[] = ['Audit Trail', 'Deployments', 'Compliance'];

/**
 * The event names the log shows, by family. These are the names the console's
 * own audit trail and deployment pipeline emit, so the log reads as a record
 * of this console rather than a list of invented strings.
 */
export const EVENT_NAMES: Readonly<Record<string, readonly string[]>> = {
  'Audit Trail': [
    'user.signed-in',
    'role.assigned',
    'token.created',
    'policy.updated',
    'device.group.changed',
    'export.requested',
  ],
  Deployments: [
    'deployment.started',
    'deployment.completed',
    'deployment.failed',
    'patch.rollback.completed',
    'package.published',
  ],
  Compliance: [
    'compliance.drifted',
    'benchmark.failed',
    'encryption.missing',
    'agent.offline',
    'vulnerability.critical.found',
  ],
};
