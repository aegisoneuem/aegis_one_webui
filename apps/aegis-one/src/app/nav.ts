import type { IconName } from '@aegis/ui';

export type PageId =
  | 'home'
  | 'devices'
  | 'groups'
  | 'enrollment'
  | 'patches'
  | 'software'
  | 'liveops'
  | 'remote'
  | 'deployments'
  | 'vulns'
  | 'profiles'
  | 'dex'
  | 'insight'
  | 'sites'
  | 'peercache'
  | 'reports'
  | 'integrations'
  | 'admin'
  | 'licensing'
  | 'diagnostics';

export interface PageDef {
  id: PageId;
  label: string;
  path: string;
  /** A glyph from the approved set, named as `packages/ui` keys it. */
  icon: IconName;
  tag?: string;
  /** One line shown under the page title. */
  summary: string;
}

export interface NavGroupDef {
  id: string;
  label: string;
  pages: PageDef[];
}

/** Six groups, twenty pages. Ids, labels and order are fixed by the product spec. */
export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'console',
    label: 'Console',
    pages: [
      {
        id: 'home',
        label: 'Overview',
        path: '/',
        icon: 'overview',
        summary: 'Fleet health, patch compliance, security posture and recent activity',
      },
      {
        id: 'devices',
        label: 'Devices',
        path: '/devices',
        icon: 'devices',
        summary: 'Endpoint inventory',
      },
      {
        id: 'groups',
        label: 'Device groups',
        path: '/groups',
        icon: 'device-groups',
        summary: 'Static and rule-based groups with sub-groups and policies',
      },
      {
        id: 'enrollment',
        label: 'Enrollment',
        path: '/enrollment',
        icon: 'enrollment',
        summary: 'Enrollment methods, install commands and tokens',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    pages: [
      {
        id: 'patches',
        label: 'Patches',
        path: '/patches',
        icon: 'patches',
        summary: 'Patch compliance, policies and update catalogue',
      },
      {
        id: 'software',
        label: 'Software',
        path: '/software',
        icon: 'software',
        summary: 'Software catalogue and packages',
      },
      {
        id: 'liveops',
        label: 'Live Activity',
        path: '/liveops',
        icon: 'live-operations',
        summary: 'Live data queries, remote scripts and log collection',
      },
      {
        id: 'remote',
        label: 'Remote Control',
        path: '/remote-control',
        icon: 'remote-control',
        summary: 'Consent-first remote sessions, their history and the policy behind them',
      },
      {
        id: 'deployments',
        label: 'Deployments',
        path: '/deployments',
        icon: 'deployments',
        summary: 'Actions, schedules and per-endpoint results',
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    pages: [
      {
        id: 'vulns',
        label: 'Vulnerabilities',
        path: '/vulns',
        icon: 'vulnerabilities',
        summary: 'Findings, remediations, projects and scans',
      },
      {
        id: 'profiles',
        label: 'Configuration',
        path: '/profiles',
        icon: 'configuration',
        tag: 'Beta',
        summary: 'Configuration compliance against CIS, STIG, PCI DSS and HIPAA',
      },
    ],
  },
  {
    id: 'experience',
    label: 'Experience',
    pages: [
      {
        id: 'dex',
        label: 'DEX',
        path: '/dex',
        icon: 'dex',
        summary: 'Digital employee experience scores',
      },
      {
        id: 'insight',
        label: 'AEGIS Insight',
        path: '/insight',
        icon: 'insight',
        tag: 'Beta',
        summary: 'Describe a problem, run diagnostics, apply remediation',
      },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    pages: [
      {
        id: 'sites',
        label: 'Aegis Zones',
        path: '/sites',
        icon: 'zones',
        summary: 'Zones, delivery distribution and content path',
      },
      {
        id: 'peercache',
        label: 'Peer cache',
        path: '/peercache',
        icon: 'peer-cache',
        summary: 'Elected peer caches per zone',
      },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    pages: [
      {
        id: 'reports',
        label: 'Reports',
        path: '/reports',
        icon: 'reports',
        summary: 'Standard, compliance, leadership and custom reports',
      },
      {
        id: 'integrations',
        label: 'Integrations',
        path: '/integrations',
        icon: 'integrations',
        summary: 'Connectors, SIEM and syslog, notifications and delivery log',
      },
      {
        id: 'admin',
        label: 'Administration',
        path: '/admin',
        icon: 'administration',
        summary: 'Identity and SSO, users, roles, agent enrollment and API access',
      },
      {
        id: 'licensing',
        label: 'Licensing',
        path: '/licensing',
        icon: 'licensing',
        summary: 'Seat usage, term and modules',
      },
      {
        id: 'diagnostics',
        label: 'Diagnostics',
        path: '/diagnostics',
        icon: 'diagnostics',
        summary: 'Service health and diagnostic bundle',
      },
    ],
  },
];

export const ALL_PAGES: PageDef[] = NAV_GROUPS.flatMap((g) => g.pages);

export const PAGE_BY_ID: Record<PageId, PageDef> = Object.fromEntries(
  ALL_PAGES.map((p) => [p.id, p]),
) as Record<PageId, PageDef>;

/**
 * Permission each page needs to be worth showing.
 *
 * The sidebar hides what a user cannot open, and the router refuses it. Both
 * are conveniences: the server checks the same permission on every request,
 * and that check is the one that matters.
 */
export const PAGE_PERMISSIONS: Record<PageId, string | undefined> = {
  home: 'overview:read',
  devices: 'devices:read',
  groups: 'groups:read',
  enrollment: 'enrollment:read',
  patches: 'patches:read',
  software: 'software:read',
  liveops: 'liveops:read',
  remote: 'remote:read',
  deployments: 'deployments:read',
  vulns: 'vulns:read',
  profiles: 'config:read',
  dex: 'dex:read',
  insight: 'insight:run',
  sites: 'zones:read',
  peercache: 'peercache:read',
  reports: 'reports:read',
  integrations: 'integrations:read',
  admin: 'admin:users',
  licensing: 'licensing:read',
  diagnostics: 'diagnostics:read',
};
