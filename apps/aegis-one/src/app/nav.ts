import type { Icon } from '@phosphor-icons/react';
import {
  Buildings,
  ChartLineUp,
  ClipboardText,
  DeviceMobile,
  FileText,
  FirstAid,
  GearSix,
  Heartbeat,
  HardDrives,
  IdentificationBadge,
  Lightning,
  ListChecks,
  Package,
  PlugsConnected,
  Rocket,
  ShieldCheck,
  SquaresFour,
  Stethoscope,
  UsersThree,
} from '@phosphor-icons/react';

export type PageId =
  | 'home'
  | 'devices'
  | 'groups'
  | 'enrollment'
  | 'patches'
  | 'software'
  | 'liveops'
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
  icon: Icon;
  tag?: string;
  /** One line shown under the page title. */
  summary: string;
}

export interface NavGroupDef {
  id: string;
  label: string;
  pages: PageDef[];
}

/** Six groups, nineteen pages. Ids, labels and order are fixed by the product spec. */
export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'console',
    label: 'Console',
    pages: [
      {
        id: 'home',
        label: 'Overview',
        path: '/',
        icon: SquaresFour,
        summary: 'Fleet health, patch compliance, security posture and recent activity',
      },
      {
        id: 'devices',
        label: 'Devices',
        path: '/devices',
        icon: DeviceMobile,
        summary: 'Endpoint inventory',
      },
      {
        id: 'groups',
        label: 'Device groups',
        path: '/groups',
        icon: UsersThree,
        summary: 'Static and rule-based groups with sub-groups and policies',
      },
      {
        id: 'enrollment',
        label: 'Enrollment',
        path: '/enrollment',
        icon: IdentificationBadge,
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
        icon: FirstAid,
        summary: 'Patch compliance, policies and update catalogue',
      },
      {
        id: 'software',
        label: 'Software',
        path: '/software',
        icon: Package,
        summary: 'Software catalogue and packages',
      },
      {
        id: 'liveops',
        label: 'Live Activity',
        path: '/liveops',
        icon: Lightning,
        summary: 'Live data queries, remote scripts and log collection',
      },
      {
        id: 'deployments',
        label: 'Deployments',
        path: '/deployments',
        icon: Rocket,
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
        icon: ShieldCheck,
        summary: 'Findings, remediations, projects and scans',
      },
      {
        id: 'profiles',
        label: 'Configuration',
        path: '/profiles',
        icon: ListChecks,
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
        icon: Heartbeat,
        summary: 'Digital employee experience scores',
      },
      {
        id: 'insight',
        label: 'AEGIS Insight',
        path: '/insight',
        icon: Stethoscope,
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
        icon: Buildings,
        summary: 'Zones, delivery distribution and content path',
      },
      {
        id: 'peercache',
        label: 'Peer cache',
        path: '/peercache',
        icon: HardDrives,
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
        icon: ChartLineUp,
        summary: 'Standard, compliance, leadership and custom reports',
      },
      {
        id: 'integrations',
        label: 'Integrations',
        path: '/integrations',
        icon: PlugsConnected,
        summary: 'Connectors, SIEM and syslog, notifications and delivery log',
      },
      {
        id: 'admin',
        label: 'Administration',
        path: '/admin',
        icon: GearSix,
        summary: 'Identity and SSO, users, roles, agent enrollment and API access',
      },
      {
        id: 'licensing',
        label: 'Licensing',
        path: '/licensing',
        icon: FileText,
        summary: 'Seat usage, term and modules',
      },
      {
        id: 'diagnostics',
        label: 'Diagnostics',
        path: '/diagnostics',
        icon: ClipboardText,
        summary: 'Service health and diagnostic bundle',
      },
    ],
  },
];

export const ALL_PAGES: PageDef[] = NAV_GROUPS.flatMap((g) => g.pages);

export const PAGE_BY_ID: Record<PageId, PageDef> = Object.fromEntries(
  ALL_PAGES.map((p) => [p.id, p]),
) as Record<PageId, PageDef>;
