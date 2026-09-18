import { enhanceControls, reviewAction, showInfo } from "./functionality";
import {originalDevices} from "./data/devices";
import React from 'react';
import { renderConsole } from './screens';
const UX_PLATFORMS: any = [{
  name: 'Windows',
  icon: 'W',
  total: 14200,
  compliant: 13490,
  critical: 54,
  online: 48,
  applicable: 45,
  ready: 42,
  restart: 132,
  failed: 14,
  backlog: [54, 162, 480, 650],
  aging: [23, 19, 8, 4],
  failures: [6, 4, 3, 1],
  sla: [16, 2.1, 5.8]
}, {
  name: 'macOS',
  icon: 'M',
  total: 5200,
  compliant: 4836,
  critical: 18,
  online: 14,
  applicable: 13,
  ready: 11,
  restart: 36,
  failed: 4,
  backlog: [18, 48, 182, 255],
  aging: [9, 6, 2, 1],
  failures: [2, 1, 1, 0],
  sla: [22, 2.8, 6.5]
}, {
  name: 'Linux',
  icon: 'L',
  total: 5440,
  compliant: 5074,
  critical: 12,
  online: 10,
  applicable: 10,
  ready: 8,
  restart: 16,
  failed: 3,
  backlog: [12, 37, 169, 221],
  aging: [6, 4, 2, 0],
  failures: [1, 0, 1, 1],
  sla: [20, 2.6, 6.7]
}];
const UX_UPDATES: any = [{
  id: 'kb5071234',
  name: 'September security update',
  product: 'Windows 11 · KB5071234',
  severity: 'Critical',
  byPlatform: {
    Windows: 54
  },
  installed: '13,490',
  failed: '6',
  status: 'Approved',
  released: 'Sep 8, 2026',
  cves: 'Security update · sample catalog'
}, {
  id: 'mac-security',
  name: 'macOS security update',
  product: 'macOS · security release',
  severity: 'Critical',
  byPlatform: {
    macOS: 18
  },
  installed: '4,836',
  failed: '2',
  status: 'Approved',
  released: 'Sep 9, 2026',
  cves: 'Security update · sample catalog'
}, {
  id: 'linux-kernel',
  name: 'Linux kernel security update',
  product: 'Linux · kernel maintenance',
  severity: 'Critical',
  byPlatform: {
    Linux: 12
  },
  installed: '5,074',
  failed: '1',
  status: 'Approved',
  released: 'Sep 10, 2026',
  cves: 'Security update · sample catalog'
}, {
  id: 'chrome145',
  name: 'Google Chrome 145.0.2',
  product: 'Google Chrome',
  severity: 'High',
  byPlatform: {
    Windows: 82,
    macOS: 32
  },
  installed: '18,096',
  failed: '4',
  status: 'Available',
  released: 'Sep 11, 2026',
  cves: 'Browser security update · sample catalog'
}, {
  id: 'firefox146',
  name: 'Firefox 146',
  product: 'Mozilla Firefox',
  severity: 'Medium',
  byPlatform: {
    Windows: 96,
    macOS: 12,
    Linux: 6
  },
  installed: '2,148',
  failed: '0',
  status: 'Available',
  released: 'Sep 12, 2026',
  cves: 'Browser update · sample catalog'
}];
const UX_TREND_OFFSETS: any = [-2.4, -2.32, -2.42, -2.14, -2.13, -2.01, -1.8, -1.85, -1.52, -1.49, -1.55, -1.36, -1.28, -1.02, -1.12, -.96, -.76, -.65, -.69, -.48, -.49, -.35, -.4, -.21, -.29, -.19, -.14, -.18, -.04, 0];
const PILL: any = {
  green: ['#E9F6EE', '#19845B'],
  amber: ['#FFF5D6', '#896400'],
  red: ['#FCEBEC', '#B52D35'],
  blue: ['#EEF0F2', '#5C6470'],
  gray: ['#EEF0F2', '#5C6470'],
  bronze: ['#FFF5D6', '#7F6038']
};
const P: any = (k: any): any => ({
  bg: PILL[k][0],
  c: PILL[k][1]
});
const pill: any = (t: any, k: any): any => ({
  t,
  bg: PILL[k][0],
  c: PILL[k][1]
});
const DOT: any = {
  green: '#19845B',
  amber: '#D6A009',
  red: '#D34249',
  blue: '#69717D',
  gray: '#8A9099'
};
const CRUMBS: any = {
  liveops: 'Live Operations',
  insight: 'AEGIS Insight',
  profiles: 'Configuration Profiles',
  home: 'Overview',
  devices: 'Devices',
  device: 'Devices / LAPTOP-001',
  groups: 'Device Groups',
  enrollment: 'Enrollment',
  patches: 'Patches',
  software: 'Software',
  deployments: 'Deployments',
  deployment: 'Deployments / DEP-1039',
  wizard: 'Deployments / Create',
  success: 'Deployments / Created',
  vulns: 'Vulnerabilities',
  dex: 'DEX',
  sites: "Aegis Zones",
  peercache: 'Peer Cache',
  reports: 'Reports',
  activity: 'Activity',
  integrations: 'Integrations',
  api: 'API Access',
  admin: 'Administration',
  licensing: 'Licensing',
  diagnostics: 'Diagnostics'
};
const PAGES: any = Object.keys(CRUMBS);
const DEVICES = originalDevices;
const K: any = (v: any): any => ({
  Online: 'green',
  Offline: 'gray',
  Healthy: 'green',
  Warning: 'amber',
  Critical: 'red',
  Compliant: 'green',
  'Missing Patches': 'amber',
  Missing: 'red',
  Low: 'green',
  High: 'amber',
  Medium: 'amber',
  Poor: 'red',
  '-': 'gray',
  Running: 'amber',
  Queued: 'gray',
  Pending: 'amber',
  Completed: 'green',
  Failed: 'red',
  Scheduled: 'gray',
  Available: 'gray',
  Approved: 'green',
  Ready: 'green',
  Testing: 'gray',
  Success: 'green',
  Active: 'green',
  Connected: 'green',
  Attention: 'amber',
  'Not Configured': 'gray',
  Constrained: 'amber',
  Good: 'green'
} as Record<string, any>)[v] || 'gray';
const PATCHES: any = UX_UPDATES.map((p: any): any => ({
  ...p,
  applicable: Object.values<number>(p.byPlatform).reduce((a: any, b: any): any => a + b, 0).toLocaleString('en-US')
}));
const VULNS: any = [{
  cve: 'CVE-2026-41001',
  cvss: '9.8',
  severity: 'Critical',
  devices: '124',
  software: 'Windows 11',
  first: 'Today',
  last: '2 min ago',
  fix: 'Fix Available',
  patch: 'KB5071234',
  desc: 'Remote code execution in the Windows kernel via crafted network packets.'
}, {
  cve: 'CVE-2026-39008',
  cvss: '8.1',
  severity: 'High',
  devices: '321',
  software: 'Google Chrome',
  first: 'Yesterday',
  last: '14 min ago',
  fix: 'Fix Available',
  patch: 'Chrome 145.0.1',
  desc: 'Use-after-free in the V8 engine allowing sandbox escape.'
}, {
  cve: 'CVE-2026-37712',
  cvss: '6.5',
  severity: 'Medium',
  devices: '88',
  software: '7-Zip',
  first: '3 days ago',
  last: '1 h ago',
  fix: 'Fix Available',
  patch: '7-Zip 24.09',
  desc: 'Path traversal when extracting crafted archives.'
}, {
  cve: 'CVE-2026-35120',
  cvss: '3.9',
  severity: 'Low',
  devices: '1,102',
  software: 'OpenSSL',
  first: '8 days ago',
  last: '3 h ago',
  fix: 'No Fix',
  patch: '—',
  desc: 'Timing side channel in RSA decryption.'
}];
const DEPLOYS: any = [{
  id: 'DEP-1039',
  name: 'September Windows Security Update',
  type: 'Patch',
  targets: '842',
  pct: 86,
  success: '728',
  failed: '22',
  pending: '92',
  schedule: 'Now',
  by: 'Sumit Kumar',
  status: 'Running',
  started: '22 min ago'
}, {
  id: 'DEP-1035',
  name: 'Chrome 145 Rollout',
  type: 'Software',
  targets: '2,400',
  pct: 100,
  success: '2,381',
  failed: '19',
  pending: '0',
  schedule: 'Sep 12, 11:00 PM',
  by: 'Priya Singh',
  status: 'Completed',
  started: '4 h ago'
}, {
  id: 'DEP-1040',
  name: 'Firefox 146 — Pilot Ring',
  type: 'Patch',
  targets: '25',
  pct: 0,
  success: '0',
  failed: '0',
  pending: '25',
  schedule: 'Tonight, 11:00 PM',
  by: 'Sumit Kumar',
  status: 'Scheduled',
  started: '—'
}, {
  id: 'DEP-1031',
  name: 'Finance App 5.3.2',
  type: 'Software',
  targets: '1,842',
  pct: 100,
  success: '1,796',
  failed: '46',
  pending: '0',
  schedule: 'Sep 10, 10:00 PM',
  by: 'Alex Johnson',
  status: 'Failed',
  started: '3 days ago'
}];
const SITES: any = [{
  name: 'Mumbai HQ',
  devices: '12,400',
  conn: 'Healthy',
  bw: 'High bandwidth',
  cache: 'Not required',
  sync: '1 min ago',
  status: 'Healthy',
  node: '—',
  cached: '—',
  size: '—',
  last: '—'
}, {
  name: 'Delhi Branch',
  devices: '2,100',
  conn: 'Healthy',
  bw: 'Medium bandwidth',
  cache: 'Peer Cache Active',
  sync: '3 min ago',
  status: 'Healthy',
  node: 'LAP-CACHE-021',
  cached: 'KB5071234, Chrome 145',
  size: '28 GB',
  last: '4 min ago'
}, {
  name: 'Jaipur Branch',
  devices: '240',
  conn: 'Constrained',
  bw: 'Low bandwidth',
  cache: 'Peer Cache Active',
  sync: '12 min ago',
  status: 'Warning',
  node: 'LAP-019',
  cached: 'KB5071234',
  size: '11 GB',
  last: '38 min ago'
}, {
  name: 'Bengaluru',
  devices: '4,880',
  conn: 'Healthy',
  bw: 'High bandwidth',
  cache: 'Peer Cache Active',
  sync: '2 min ago',
  status: 'Healthy',
  node: 'MAC-CACHE-004',
  cached: 'KB5071234, Chrome 145, Firefox 146',
  size: '34 GB',
  last: '1 min ago'
}];
const BARC: any = {
  red: '#D34249',
  amber: '#D6A009',
  green: '#19845B',
  blue: '#69717D',
  gray: '#C4C8CE',
  bronze: '#C6A16B'
};
const bar: any = (v: any): any => BARC[K(v)] || '#C4C8CE';
// ---- V2 chart helpers (pure SVG string builders) ----
const lin: any = (v: any, a: any, b: any, A: any, B: any): any => A + (v - a) / (b - a || 1) * (B - A);
function ringSegs(parts: any, R: any, r: any, cx: any, cy: any): any {
  const tot: any = parts.reduce((a: any, p: any): any => a + p.v, 0);
  let ang: any = -Math.PI / 2;
  return parts.map((p: any): any => {
    const a0: any = ang,
      a1: any = ang + p.v / tot * Math.PI * 2 - Math.min(0.03, p.v / tot * Math.PI * 2 * 0.2);
    ang += p.v / tot * Math.PI * 2;
    const P: any = (a: any, rad: any): any => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    const [x0, y0] = P(a0, R),
      [x1, y1] = P(a1, R),
      [x2, y2] = P(a1, r),
      [x3, y3] = P(a0, r);
    const big: any = a1 - a0 > Math.PI ? 1 : 0;
    return {
      ...p,
      d: `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${big} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} A${r} ${r} 0 ${big} 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`,
      pct: Math.round(p.v / tot * 100) + '%'
    };
  });
}
const DAYS30: any = Array.from({
  length: 30
}, (_: any, i: any): any => {
  const d: any = new Date(2026, 7, 15 + i);
  return (d.getMonth() === 7 ? 'Aug ' : 'Sep ') + d.getDate();
});
const SER: any = {
  overall: [89.4, 89.5, 89.7, 89.9, 90.1, 90.2, 90.4, 90.6, 90.8, 91.0, 91.1, 91.3, 91.5, 91.6, 91.8, 92.0, 92.2, 92.4, 92.6, 92.7, 92.9, 93.1, 93.2, 93.4, 93.6, 93.7, 93.9, 94.0, 94.1, 94.2],
  windows: [88.1, 88.3, 88.5, 88.8, 89.0, 89.2, 89.5, 89.7, 90.0, 90.2, 90.4, 90.6, 90.9, 91.1, 91.3, 91.6, 91.8, 92.0, 92.2, 92.4, 92.6, 92.8, 93.0, 93.2, 93.4, 93.5, 93.7, 93.8, 93.9, 94.0],
  macos: [93.0, 93.1, 93.1, 93.2, 93.3, 93.4, 93.4, 93.5, 93.6, 93.7, 93.8, 93.9, 94.0, 94.1, 94.2, 94.3, 94.4, 94.5, 94.6, 94.7, 94.8, 94.9, 95.0, 95.1, 95.2, 95.3, 95.4, 95.5, 95.6, 95.7],
  linux: [90.2, 90.3, 90.4, 90.6, 90.7, 90.9, 91.0, 91.2, 91.3, 91.5, 91.6, 91.8, 91.9, 92.1, 92.2, 92.4, 92.5, 92.7, 92.8, 93.0, 93.1, 93.3, 93.4, 93.6, 93.7, 93.9, 94.0, 94.2, 94.3, 94.5],
  crit: [341, 340, 338, 336, 335, 334, 333, 331, 330, 329, 328, 327, 326, 325, 324, 323, 322, 321, 320, 319, 318, 317, 316, 315, 314, 313, 313, 312, 312, 312],
  high: [912, 908, 905, 901, 898, 895, 891, 888, 884, 881, 878, 875, 872, 869, 866, 863, 860, 858, 856, 854, 852, 851, 850, 849, 848, 848, 847, 847, 847, 847],
  med: [1380, 1372, 1365, 1358, 1350, 1343, 1336, 1329, 1322, 1315, 1308, 1301, 1294, 1288, 1282, 1276, 1270, 1265, 1260, 1256, 1253, 1251, 1250, 1249, 1249, 1248, 1248, 1248, 1248, 1248],
  dex: [77.4, 77.6, 77.9, 78.1, 78.3, 78.6, 78.8, 79.0, 79.3, 79.5, 79.7, 79.9, 80.1, 80.3, 80.5, 80.7, 80.8, 81.0, 81.1, 81.3, 81.4, 81.5, 81.6, 81.7, 81.8, 81.8, 81.9, 81.9, 82.0, 82.0],
  fleet: [89.9, 90.0, 90.1, 90.3, 90.4, 90.5, 90.6, 90.8, 90.9, 91.0, 91.1, 91.2, 91.3, 91.4, 91.4, 91.5, 91.6, 91.6, 91.7, 91.7, 91.8, 91.8, 91.9, 91.9, 91.9, 92.0, 92.0, 92.0, 92.0, 92.0],
  dep: [95.8, 95.9, 96.0, 96.1, 96.2, 96.3, 96.4, 96.5, 96.5, 96.6, 96.7, 96.7, 96.8, 96.9, 96.9, 97.0, 97.0, 97.1, 97.1, 97.2, 97.2, 97.2, 97.3, 97.3, 97.3, 97.4, 97.4, 97.4, 97.4, 97.4]
};
const ICONS: any = {
  liveops: 'M4 12h3l2-5 4 10 2-5h5',
  insight: 'M12 3a6 6 0 0 1 6 6c0 2.5-1.5 3.8-2.5 5H8.5C7.5 12.8 6 11.5 6 9a6 6 0 0 1 6-6z M9 18h6 M10 21h4',
  profiles: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h6 M9 16h6',
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  devices: 'M4 5h16v10H4z M8 19h8 M12 15v4',
  groups: 'M3 5h8v6H3z M13 5h8v6h-8z M3 13h8v6H3z M13 13h8v6h-8z',
  enrollment: 'M12 5v14 M5 12h14',
  patches: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z M9 12l2 2 4-4',
  software: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
  deployments: 'M12 19V6 M6 12l6-6 6 6',
  vulns: 'M12 3l10 18H2z M12 10v4 M12 17.5v.5',
  dex: 'M4 18h16 M6 14l4-5 4 3 4-6',
  sites: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2c3 3 3 17 0 20 M12 2c-3 3-3 17 0 20',
  peercache: 'M12 6a6 6 0 1 0 6 6 M18 4v4h-4 M12 12h.01',
  reports: 'M5 4h14v16H5z M9 9h6 M9 13h6 M9 17h4',
  activity: 'M12 7v5l3 2 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
  integrations: 'M7 8h10 M13 4l4 4-4 4 M17 16H7 M11 12l-4 4 4 4',
  api: 'M8 7l-4 5 4 5 M16 7l4 5-4 5 M14 5l-4 14',
  admin: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.4 1.4 M17.6 17.6L19 19 M5 19l1.4-1.4 M17.6 6.4L19 5',
  licensing: 'M4 5h16v14H4z M8 10h8 M8 14h5',
  diagnostics: 'M3 12h4l3-7 4 14 3-7h4'
};
const WSTEPS: any = ['Content', 'Targets', 'Schedule', 'Network', 'Options', 'Review'];
export default class Console extends React.Component<object, Record<string, any>> {
  [key: string]: any;
  render(): React.ReactNode {
    return renderConsole(enhanceControls(this, this.renderVals()));
  }
  state: any = {
    page: 'home',
    uxPlatform: 'All',
    uxTargetCount: 61,
    uxTargetPlatform: 'All',
    uxSyncing: false,
    uxLastSync: '',
    q: '',
    showSearch: false,
    drawer: null,
    modal: null,
    toast: null,
    sel: [],
    psel: [],
    dq: '',
    dOS: 'All',
    dStatus: 'All',
    dRisk: 'All',
    dView: 'All Devices',
    dTab: 'all',
    ddTab: 'overview',
    pTab: 'overview',
    depTab: 'Running',
    step: 0,
    wContent: 'Patches',
    wTarget: 'Pilot Ring',
    wSched: 'now',
    wNet: 'Automatic',
    wOpts: {
      retry: true,
      mw: true,
      restart: true,
      force: false,
      notify: true
    },
    vFilter: 'All',
    failFilter: null,
    enrolled: false,
    dexTab: 'all',
    apiTab: 'tokens',
    swTab: 'apps',
    navClosed: {
      SECURITY: true,
      EXPERIENCE: true,
      INFRASTRUCTURE: true,
      ORGANIZATION: true
    },
    dHealth: 'All',
    moreOpen: false,
    loTab: 'Running',
    actFilter: 'All',
    actAll: false,
    vTab: 'overview',
    dexWhy: false,
    insight: 'idle',
    insightText: 'User reports that laptop is slow and applications take too long to open.',
    cfgTab: 'All',
    cfgDrift: false,
    aTab: 'users',
    iTab: 'All',
    notif: false,
    setupOpen: false,
    setupDone: ['Create Administrator', 'Enroll First Endpoint', "Configure Aegis Zone", 'Run Vulnerability Scan'],
    customize: false,
    widgets: {
      compliance: true,
      liveops: true,
      activity: true,
      funnel: true,
      reliability: true,
      sites: true,
      dex: true,
      fleet: true,
      os: true
    },
    preset: 'Endpoint Operations',
    actionDrawer: false,
    mfaEnrolled: ['Sumit Kumar', 'Priya Singh'],
    revoked: [],
    favorites: ['LAPTOP-002', 'Jaipur Branch', 'Critical Devices'],
    recent: ['LAPTOP-002', 'CVE-2026-41001', 'September Windows Security Update', 'Jaipur Branch'],
    stepUp: null,
    ddTabDiag: false,
    fSite: "All Aegis Zones",
    fPlat: 'All Platforms',
    fRange: 'Last 30 Days',
    pQuery: '',
    pSeverity: 'All',
    pStatus: 'All',
    pDevQuery: '',
    pDevCompliance: 'All',
    loType: '',
    wBandwidth: 'Unlimited',
    wStagger: '500 devices every 10 minutes',
    wDate: '2026-09-13',
    wTime: '23:00',
    auditQuery: '',
    auditSource: 'All',
    auditResult: 'All',
    apiMethod: 'GET',
    apiPath: '/api/v1/devices',
    mfaScope: 'All Administrators',
    mfaGrace: '7 days',
    mfaTrusted: '14 days',
    mfaSession: '8 hours',
    loading: false,
    collapsed: false,
    palette: false,
    palIdx: 0,
    hover: null,
    density: 'comfortable',
    sortKey: 'id',
    sortDir: 1,
    tblPage: 1,
    perPage: 5,
    retried: false,
    promoted: false,
    colMenu: false,
    hiddenCols: []
  };
  setFilter(k: any, v: any): any {
    this.setState({
      [k]: v,
      loading: true
    });
    clearTimeout(this._l);
    this._l = setTimeout((): any => this.setState({
      loading: false
    }), 650);
  }
  refresh(): any {
    this.setState({
      loading: true
    });
    clearTimeout(this._l);
    this._l = setTimeout((): any => {
      this.setState({
        loading: false
      });
      this.toast('Demo view refreshed — no live backend connection');
    }, 800);
  }
  componentDidMount(): any {
    try { const views = JSON.parse(localStorage.getItem("aegis-saved-device-views") || "[]"); if (Array.isArray(views)) this.setState({ savedViews: views.filter((v: any) => typeof v.name === "string" && v.filter) }); } catch { /* optional saved views */ }
    this._k = (e: any): any => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.setState((s: any): any => ({
          palette: !s.palette,
          palIdx: 0,
          q: ''
        }));
        setTimeout((): any => {
          const i: any = document.querySelector('input[data-pal]');
          if (i) i.focus();
        }, 30);
      }
      if (e.key === 'Escape') this.setState({
        showSearch: false,
        drawer: null,
        modal: null,
        palette: false,
        colMenu: false, notif: false, customize: false, actionDrawer: false
      });
    };
    window.addEventListener('keydown', this._k);
  }
  palKey(items: any): any {
    return (e: any): any => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setState((s: any): any => ({
          palIdx: Math.min(items.length - 1, s.palIdx + 1)
        }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setState((s: any): any => ({
          palIdx: Math.max(0, s.palIdx - 1)
        }));
      } else if (e.key === 'Enter' && items[this.state.palIdx]) {
        items[this.state.palIdx].go();
      }
    };
  }
  componentWillUnmount(): any {
    window.removeEventListener('keydown', this._k);
    clearTimeout(this._uxSync);
    clearTimeout(this._t); clearTimeout(this._l); clearInterval(this._i);
  }
  go(page: any, extra?: any): any {
    return (): any => {
      this.setState({
        page,
        palette: false, modal: null, actionDrawer: false,
        drawer: null,
        showSearch: false,
        ...(extra || {})
      });
      window.scrollTo(0, 0);
    };
  }
  toast(m: any): any {
    clearTimeout(this._t);
    this.setState({
      toast: m
    });
    this._t = setTimeout((): any => this.setState({
      toast: null
    }), 2400);
  }
  T(m: any): any {
    return (): any => reviewAction(this, m);
  }
  modal(m: any): any {
    return (): any => this.setState({
      modal: m
    });
  }
  confirm(title: any, body: any, label: any, toastMsg: any, kind?: any): any {
    return this.modal({
      title,
      body,
      confirmLabel: label,
      confirm: (): any => {
        this.setState({
          modal: null
        });
        reviewAction(this, title + ' — ' + body);
      },
      danger: kind === 'danger'
    });
  }
  startDeploy(content: any): any {
    return (): any => {
      this.setState({
        page: 'wizard',
        step: 0,
        drawer: null,
        modal: null,
        wContent: content || 'Patches'
      });
      window.scrollTo(0, 0);
    };
  }
  openDevice(id: any): any {
    return (): any => {
      if (!DEVICES.some((device: any) => device.id === id)) { showInfo(this, 'Device details unavailable', id + ' is referenced by the fleet summary, but its detailed record is not included in this demo. Connect the inventory service to load it.'); return; }
      this.setState({
        page: 'device',
        ddTab: 'overview',
        drawer: null,
        devId: id
      });
      window.scrollTo(0, 0);
    };
  }
  // drawers
  patchDrawer(p: any): any {
    return (): any => this.setState({
      drawer: {
        kind: 'PATCH',
        title: p.name,
        pills: [pill(p.severity, K(p.severity)), pill(p.status, K(p.status))],
        kv: [{
          k: 'Product',
          v: p.product
        }, {
          k: 'Release Date',
          v: p.released
        }, {
          k: 'Applicable Devices',
          v: p.applicable
        }, {
          k: 'Installed Devices',
          v: p.installed
        }, {
          k: 'Failed Devices',
          v: p.failed,
          c: p.failed === '0' ? undefined : '#B52D35'
        }, {
          k: 'CVEs',
          v: p.cves
        }, {
          k: 'Vendor Source',
          v: 'Vendor catalog (direct)'
        }],
        checks: ['Vendor source verified', 'SHA-256 verified', 'Signed manifest verified'],
        actions: [{
          label: 'Approve',
          fn: (): any => {
            this.setState((x: any): any => ({
              uxApprovals: {
                ...x.uxApprovals,
                [p.id]: 'Approved'
              },
              drawer: null
            }));
            this.toast(p.name + ' approved');
          },
          ...this.btnSecondary()
        }, {
          label: 'Deploy',
          fn: this.startDeploy('Patches'),
          ...this.btnPrimary()
        }]
      }
    });
  }
  vulnDrawer(v: any): any {
    return (): any => this.setState({
      drawer: {
        kind: 'VULNERABILITY',
        title: v.cve,
        pills: [pill(v.severity, K(v.severity)), pill('CVSS ' + v.cvss, 'gray'), pill(v.fix, v.fix === 'No Fix' ? 'gray' : 'green')],
        kv: [{
          k: 'Description',
          v: v.desc
        }, {
          k: 'Affected Devices',
          v: v.devices
        }, {
          k: 'Affected Software',
          v: v.software
        }, {
          k: 'First Seen',
          v: v.first
        }, {
          k: 'Last Seen',
          v: v.last
        }, {
          k: 'Available Patch',
          v: v.patch
        }],
        path: v.severity === 'Critical' ? [['Affected', 124], ['Patch Applicable', 118], ['Online', 106], ['Ready to Remediate', 92]] : [['Affected', +v.devices.replace(',', '')], ['Patch Applicable', Math.round(+v.devices.replace(',', '') * .9)], ['Online', Math.round(+v.devices.replace(',', '') * .8)], ['Ready to Remediate', Math.round(+v.devices.replace(',', '') * .7)]],
        actions: [{
          label: 'View Devices',
          fn: this.go('devices', {
            dRisk: v.severity === 'Critical' ? 'Critical' : 'All',
            dView: 'Critical Devices'
          }),
          ...this.btnSecondary()
        }, {
          label: 'Deploy Fix to ' + (v.severity === 'Critical' ? 92 : Math.round(+v.devices.replace(',', '') * .7)) + ' Devices',
          fn: (): any => {
            this.setState({
              page: 'wizard',
              step: 1,
              wContent: 'Patches',
              wTarget: 'Finance Windows',
              drawer: null
            });
            window.scrollTo(0, 0);
          },
          ...this.btnPrimary()
        }]
      }
    });
  }
  deployDrawer(d: any): any {
    return (): any => this.setState({
      drawer: {
        kind: 'DEPLOYMENT',
        title: d.name,
        pills: [pill(d.status, K(d.status)), pill(d.type, 'bronze')],
        hasProgress: true,
        pct: d.pct,
        pctW: d.pct + '%',
        kv: [{
          k: 'Target Devices',
          v: d.targets
        }, {
          k: 'Successful',
          v: d.success,
          c: '#19845B'
        }, {
          k: 'Pending',
          v: d.pending
        }, {
          k: 'Failed',
          v: d.failed,
          c: d.failed === '0' ? undefined : '#B52D35'
        }, {
          k: 'Schedule',
          v: d.schedule
        }, {
          k: 'Created By',
          v: d.by
        }],
        actions: [{
          label: 'Open Detail',
          fn: this.go('deployment'),
          ...this.btnPrimary()
        }]
      }
    });
  }
  siteDrawer(s: any): any {
    if (s.name === 'Jaipur Branch' && !this.state.promoted) return (): any => this.setState({
      drawer: {
        kind: "AEGIS ZONE \xB7 DELIVERY ISSUE",
        title: s.name,
        pills: [pill('Degraded', 'amber'), pill('Constrained WAN', 'gray')],
        kv: [{
          k: 'Devices',
          v: '240'
        }, {
          k: 'Peer Cache Node',
          v: 'JAIPUR-PC-01'
        }, {
          k: 'Status',
          v: 'Degraded',
          c: '#896400'
        }, {
          k: 'Reason',
          v: 'Node offline for 38 minutes'
        }, {
          k: 'Impact',
          v: '42 devices downloading from central source',
          c: '#B52D35'
        }, {
          k: 'Recommended Action',
          v: 'Promote JAIPUR-PC-02 as temporary cache node'
        }],
        note: 'Delivery efficiency dropped from 88% to 61% since the node went offline. Backup node JAIPUR-PC-02 is online with 9 GB of matching content cached.',
        actions: [{
          label: 'View Devices',
          fn: this.go('devices', {
            dq: 'Jaipur'
          }),
          ...this.btnSecondary()
        }, {
          label: 'Promote Backup Node',
          fn: (): any => this.setState({
            modal: {
              title: 'Promote JAIPUR-PC-02 as cache node?',
              body: 'JAIPUR-PC-02 becomes the temporary peer cache for Jaipur Branch. Content is re-seeded from central (11 GB).',
              confirmLabel: 'Promote Backup Node',
              confirm: (): any => {
                this.setState({
                  modal: null,
                  promoted: true,
                  drawer: null
                });
                this.toast('Simulation only: JAIPUR-PC-02 promoted — 42 devices now served locally');
              }
            }
          }),
          ...this.btnPrimary()
        }]
      }
    });
    return (): any => this.setState({
      drawer: {
        kind: "AEGIS ZONE",
        title: s.name,
        pills: [pill(s.status, K(s.status)), pill(s.conn, K(s.conn))],
        kv: [{
          k: 'Devices',
          v: s.devices
        }, {
          k: 'Bandwidth Profile',
          v: s.bw
        }, {
          k: 'Peer Cache',
          v: s.cache
        }, {
          k: 'Current Cache Node',
          v: s.node
        }, {
          k: 'Cache Status',
          v: s.status === 'Warning' ? 'Degraded — node offline 38 min' : s.node === '—' ? 'Not required' : 'Healthy'
        }, {
          k: 'Cached Content',
          v: s.cached
        }, {
          k: 'Last Sync',
          v: s.sync
        }],
        note: 'Recent network activity: ' + (s.node === '—' ? 'Direct downloads from central; no cache needed at this bandwidth.' : 'Peers pulling content from ' + s.node + '. WAN savings this week: 71%.'),
        actions: [{
          label: 'View Devices',
          fn: this.go('devices', {
            dq: s.name.split(' ')[0]
          }),
          ...this.btnSecondary()
        }, {
          label: 'Peer Cache',
          fn: this.go('peercache'),
          ...this.btnPrimary()
        }]
      }
    });
  }
  deviceDrawer(d: any): any {
    return (): any => this.setState({
      drawer: {
        kind: 'DEVICE',
        title: d.id,
        pills: [pill(d.status, K(d.status)), pill(d.health, K(d.health)), pill(d.risk + ' risk', K(d.risk))],
        kv: [{
          k: 'User',
          v: d.user
        }, {
          k: 'OS',
          v: d.os
        }, {
          k: 'Patch',
          v: d.patch
        }, {
          k: 'DEX',
          v: d.dex
        }, {
          k: "Aegis Zone",
          v: d.site
        }, {
          k: 'Last Seen',
          v: d.seen
        }],
        actions: [{
          label: 'Sync',
          fn: this.T('Sync command signed and submitted for ' + d.id),
          ...this.btnSecondary()
        }, {
          label: 'Open Details',
          fn: this.openDevice(d.id),
          ...this.btnPrimary()
        }]
      }
    });
  }
  appDrawer(a: any): any {
    return (): any => this.setState({
      drawer: {
        kind: 'APPLICATION',
        title: a.name,
        pills: [pill(a.status, K(a.status)), pill(a.platform, 'gray')],
        kv: [{
          k: 'Version',
          v: a.version
        }, {
          k: 'Architecture',
          v: 'x64'
        }, {
          k: 'Install command',
          v: a.install
        }, {
          k: 'Uninstall command',
          v: a.uninstall
        }, {
          k: 'Assigned Devices',
          v: a.devices
        }, {
          k: 'Deployment History',
          v: a.history
        }],
        actions: [{
          label: 'Install',
          fn: this.T('Install queued for ' + a.name),
          ...this.btnSecondary()
        }, {
          label: 'Uninstall',
          fn: this.T('Uninstall queued for ' + a.name),
          ...this.btnSecondary()
        }, {
          label: 'Deploy',
          fn: this.startDeploy('Software'),
          ...this.btnPrimary()
        }]
      }
    });
  }
  btnPrimary(): any {
    return {
      bg: '#C6A16B',
      border: '#C6A16B',
      c: '#181B1F'
    };
  }
  btnSecondary(): any {
    return {
      bg: '#fff',
      border: '#E5E9ED',
      c: '#20262E'
    };
  }
  uxVals(): any {
    const s: any = this.state,
      platform: any = s.uxPlatform || 'All';
    const selected: any = UX_PLATFORMS.filter((p: any): any => platform === 'All' || p.name === platform).map((p: any): any => {
      const approved: any = UX_UPDATES.some((u: any): any => u.severity === 'Critical' && u.byPlatform[p.name] && !(s.uxDeclined || []).includes(u.id) && (s.uxApprovals?.[u.id] || u.status) === 'Approved');
      return {
        ...p,
        ready: approved ? p.ready : 0
      };
    });
    const sum: any = (k: any): any => selected.reduce((n: any, p: any): any => n + p[k], 0),
      fmt: any = (n: any): any => n.toLocaleString('en-US');
    const total: any = sum('total'),
      compliant: any = sum('compliant'),
      critical: any = sum('critical'),
      ready: any = sum('ready');
    const compliance: any = (compliant / total * 100).toFixed(1),
      blocked: any = critical - ready;
    const severityColors: any = ['#D34249', '#D6A009', '#E9C75A', '#c7d0d7'];
    const vector: any = (k: any): any => selected.reduce((a: any, p: any): any => a.map((v: any, i: any): any => v + p[k][i]), [0, 0, 0, 0]);
    const backlog: any = vector('backlog'),
      aging: any = vector('aging'),
      failures: any = vector('failures');
    const points: any = UX_TREND_OFFSETS.map((v: any, i: any): any => [35 + i * 577 / 29, 125 - (+compliance + v - 90) * 17.5]);
    const linePath: any = points.map(([x, y]: any, i: any): any => (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)).join(' ');
    const showSummary: any = (kind: any, title: any, rows: any, note: any, actions: any): any => this.setState({
      drawer: {
        kind,
        title,
        pills: [pill(platform === 'All' ? 'All platforms' : platform, 'gray')],
        kv: rows,
        note,
        actions
      }
    });
    const viewDevices: any = (filter: any = 'All'): any => this.setState({
      page: 'patches',
      pTab: 'devices',
      pDevCompliance: filter,
      pDevQuery: platform === 'All' ? '' : platform,
      drawer: null
    });
    const reviewReady: any = (): any => {
      if (!ready) return;
      this.setState({
        page: 'wizard',
        step: 0,
        wContent: 'Patches',
        wTarget: 'Ready critical devices',
        uxTargetCount: ready,
        uxTargetPlatform: platform,
        drawer: null,
        wOpts: {
          ...s.wOpts,
          mw: true,
          notify: true
        }
      });
      window.scrollTo(0, 0);
    };
    const queue: any = UX_UPDATES.filter((p: any): any => !(s.uxDeclined || []).includes(p.id)).map((p: any): any => ({
      ...p,
      status: s.uxApprovals?.[p.id] || p.status
    })).filter((p: any): any => p.severity !== 'Medium' && (platform === 'All' || p.byPlatform[platform])).map((p: any): any => {
      const count: any = platform === 'All' ? Object.values(p.byPlatform).reduce((a: any, b: any): any => a + b, 0) : p.byPlatform[platform];
      return {
        ...p,
        platform: platform === 'All' ? Object.keys(p.byPlatform).join(' / ') : platform,
        devices: fmt(count),
        state: p.status === 'Approved' ? 'Approved' : 'Review',
        open: this.patchDrawer({
          ...p,
          applicable: fmt(count)
        })
      };
    }).sort((a: any, b: any): any => ({
      Critical: 0,
      High: 1
    } as Record<string, any>)[a.severity] - ({
      Critical: 0,
      High: 1
    } as Record<string, any>)[b.severity] || +b.devices.replaceAll(',', '') - +a.devices.replaceAll(',', ''));
    const slate: any = selected.length === 1 ? selected[0].sla : [18, 2.4, 6.2];
    return {
      platform,
      collapsed: s.collapsed,
      singlePlatform: selected.length === 1,
      totalLabel: fmt(total),
      compliantLabel: fmt(compliant),
      compliance,
      improvement: '2.4',
      critical,
      ready,
      blocked,
      restart: sum('restart'),
      failed: sum('failed'),
      readyPct: Math.round(ready / critical * 100),
      readyWidth: ready / critical * 100 + '%',
      blockedWidth: blocked / critical * 100 + '%',
      scopeLabel: platform === 'All' ? 'Windows, macOS & Linux' : platform,
      chartLabel: 'Sample patch compliance over 30 days, rising from ' + (+compliance - 2.4).toFixed(1) + '% to ' + compliance + '%. Target: 95%.',
      linePath,
      areaPath: linePath + ' L612 125 L35 125 Z',
      lastY: points[29][1],
      labelY: points[29][1] - 11,
      setPlatform: (e: any): any => this.setState({
        uxPlatform: e.target.value
      }),
      platforms: selected.map((p: any): any => ({
        name: p.name,
        icon: p.icon,
        compliance: (p.compliant / p.total * 100).toFixed(1),
        width: p.compliant / p.total * 100 + '%',
        missingLabel: fmt(p.total - p.compliant),
        title: 'View ' + p.name + ' endpoint compliance',
        open: (): any => this.setState({
          page: 'patches',
          pTab: 'devices',
          uxPlatform: p.name,
          pDevQuery: p.name,
          pDevCompliance: 'All'
        })
      })),
      tabs: [['overview', 'Overview'], ['devices', 'Devices'], ['updates', 'Updates'], ['osupgrades', 'OS upgrades'], ['deployments', 'Deployments'], ['history', 'History']].map(([id, label]: any): any => ({
        id,
        label,
        active: s.pTab === id,
        c: s.pTab === id ? '#20262e' : '#7c8893',
        w: s.pTab === id ? '600' : '400',
        bb: s.pTab === id ? '#C6A16B' : 'transparent',
        set: (): any => this.setState({
          pTab: id,
          uxPlatform: 'All',
          pDevQuery: '',
          pQuery: '',
          pSeverity: 'All',
          pStatus: 'All'
        })
      })),
      goHome: this.go('home'),
      openAccount: this.modal({
        title: 'Administrator profile',
        body: 'Sumit Kumar · Super administrator. This is a sample enterprise workspace.',
        fields: [],
        confirmLabel: 'Open administration',
        confirm: (): any => {
          this.setState({
            modal: null,
            page: 'admin',
            aTab: 'users'
          });
          window.scrollTo(0, 0);
        }
      }),
      created: s.uxCreated || {
        id: 'DEP-1042',
        targets: '0',
        contentItems: 0,
        schedule: 'Immediately'
      },
      viewCreatedDeployment: (): any => {
        const d: any = this.state.uxCreated;
        if (!d) { this.go('deployments')(); return; }
        showSummary('SAMPLE DEPLOYMENT', d.id, [{
          k: 'Target endpoints',
          v: d.targets
        }, {
          k: 'Content',
          v: d.content
        }, {
          k: 'Platform scope',
          v: d.scope
        }, {
          k: 'Schedule',
          v: d.schedule
        }, {
          k: 'Network policy',
          v: d.network
        }, {
          k: 'State',
          v: 'Queued · sample workspace'
        }], 'This prototype records your configuration locally in this session. No endpoint commands are sent.', [{
          label: 'Back to patches',
          fn: (): any => {
            this.setState({
              page: 'patches',
              pTab: 'overview',
              drawer: null
            });
            window.scrollTo(0, 0);
          },
          ...this.btnPrimary()
        }]);
      },
      syncLabel: s.uxSyncing ? 'Syncing...' : 'Sync catalog',
      syncing: !!s.uxSyncing,
      syncText: s.uxLastSync || 'synced 42 sec ago',
      sync: (): any => {
        if (this.state.uxSyncing) return;
        this.setState({
          uxSyncing: true
        });
        this._uxSync = setTimeout((): any => {
          this.setState({
            uxSyncing: false,
            uxLastSync: 'synced just now'
          });
          this.toast('Sample catalog refreshed · content verification complete');
        }, 850);
      },
      viewCompliant: (): any => viewDevices('Compliant'),
      viewCritical: (): any => this.setState({
        pTab: 'updates',
        pSeverity: 'Critical',
        pStatus: 'All',
        pQuery: ''
      }),
      viewUpdates: (): any => this.setState({
        pTab: 'updates',
        pSeverity: 'All',
        pStatus: 'All',
        pQuery: ''
      }),
      viewRestarts: (): any => showSummary('PATCH HEALTH', 'Restart required', selected.map((p: any): any => ({
        k: p.name,
        v: fmt(p.restart) + ' endpoints'
      })), 'These endpoints have completed installation and need a restart to finish applying updates. Review their maintenance windows before scheduling a restart.', [{
        label: 'View devices',
        fn: (): any => viewDevices('Attention'),
        ...this.btnPrimary()
      }]),
      viewFailures: (): any => showSummary('PATCH HEALTH', 'Investigate failed installations', ['Offline', 'Restart pending', 'Installer error', 'Download error'].map((k: any, i: any): any => ({
        k,
        v: fmt(failures[i]) + ' installs'
      })), 'Failures in the last 7 days. Inspect the affected deployment and resolve the cause before retrying.', [{
        label: 'Open failed deployments',
        fn: (): any => {
          this.setState({
            page: 'deployments',
            depTab: 'Failed',
            drawer: null
          });
          window.scrollTo(0, 0);
        },
        ...this.btnPrimary()
      }]),
      viewBlockers: (): any => showSummary('DEPLOYMENT READINESS', blocked + ' endpoints need attention', [{
        k: 'Offline',
        v: fmt(critical - sum('online')) + ' endpoints'
      }, {
        k: 'Applicability check pending',
        v: fmt(sum('online') - sum('applicable')) + ' endpoints'
      }, {
        k: 'Pre-deployment checks pending',
        v: fmt(sum('applicable') - ready) + ' endpoints'
      }, {
        k: 'Ready for deployment',
        v: fmt(ready) + ' endpoints'
      }], 'Only endpoints that are online, applicable and approved are included in the ready cohort.', [{
        label: 'Review ready cohort',
        fn: reviewReady,
        ...this.btnPrimary()
      }, {
        label: 'View devices',
        fn: (): any => viewDevices('Attention'),
        ...this.btnSecondary()
      }]),
      reviewReady,
      noReady: ready === 0,
      queue,
      queueCount: queue.length,
      queueEmpty: queue.length === 0,
      slas: ['Critical', 'High', 'Medium'].map((label: any, i: any): any => ({
        label,
        value: slate[i] + (i ? ' days' : 'h'),
        target: ['SLA 24h', 'SLA 5 days', 'SLA 7 days'][i],
        width: slate[i] / [24, 5, 7][i] * 100 + '%',
        color: i === 2 ? '#D6A009' : '#19845B',
        textColor: i === 2 ? '#896400' : '#176B48'
      })),
      backlogTotal: fmt(backlog.reduce((a: any, b: any): any => a + b, 0)),
      backlog: ['Critical', 'High', 'Medium', 'Low'].map((label: any, i: any): any => ({
        label,
        value: fmt(backlog[i]),
        width: backlog[i] / Math.max(...backlog) * 100 + '%',
        color: severityColors[i]
      })),
      aging: ['< 7d', '7–30d', '30–60d', '> 60d'].map((label: any, i: any): any => ({
        label,
        value: aging[i],
        height: aging[i] / Math.max(...aging) * 100 + '%',
        color: ['#19845B', '#D6A009', '#E7787D', '#D34249'][i]
      })),
      aged: aging[2] + aging[3],
      failures: ['Offline', 'Restart', 'Installer', 'Download'].map((label: any, i: any): any => ({
        label,
        value: failures[i],
        width: failures[i] / Math.max(...failures) * 100 + '%',
        color: i === 0 ? '#c98775' : '#b8c5ce'
      }))
    };
  }
  completeUxDeployment(): any {
    const s: any = this.state;
    const targets: any = ({
      'Ready critical devices': String(s.uxTargetCount),
      'Pilot Ring': '25',
      'Finance Windows': '842',
      'Jaipur Branch': '240',
      'Selected Devices': String(s.sel.length || 3)
    } as Record<string, any>)[s.wTarget];
    const cohort: any = s.wTarget === 'Ready critical devices' && s.wContent === 'Patches';
    this.setState({
      page: 'success',
      uxCreated: {
        id: 'DEP-1042',
        targets,
        scope: cohort ? s.uxTargetPlatform === 'All' ? 'All platforms' : s.uxTargetPlatform : s.wTarget,
        content: cohort ? 'Approved critical updates' : s.wContent,
        contentItems: cohort ? s.uxTargetPlatform === 'All' ? 3 : 1 : s.wContent === 'Patches' ? 2 : 1,
        schedule: s.wSched === 'now' ? 'Immediately' : s.wDate + ' ' + s.wTime,
        network: s.wNet
      }
    });
    this.toast('Sample deployment DEP-1042 created');
  }
  renderVals(): any {
    const s: any = this.state,
      st: any = (v: any): any => {
        const k: any = K(v);
        return {
          bg: PILL[k][0],
          c: PILL[k][1]
        };
      };
    const navDef: any = [['WORKSPACE', [['home', 'Overview', ''], ['devices', 'Devices', ''], ['groups', 'Device groups', ''], ['enrollment', 'Enrollment', '']]], ['OPERATIONS', [['patches', 'Patches', ''], ['software', 'Software', ''], ['deployments', 'Deployments', ''], ['liveops', 'Live operations', '']]], ['SECURITY', [['vulns', 'Vulnerabilities', ''], ['profiles', 'Configuration', '', 1]]], ['EXPERIENCE', [['dex', 'DEX', ''], ['insight', 'AEGIS Insight', '', 1]]], ['INFRASTRUCTURE', [['sites', "Aegis Zones", ''], ['peercache', 'Peer cache', '']]], ['ORGANIZATION', [['reports', 'Reports', ''], ['activity', 'Activity', ''], ['integrations', 'Integrations', ''], ['api', 'API access', ''], ['admin', 'Administration', ''], ['licensing', 'Licensing', ''], ['diagnostics', 'Diagnostics', '']]]];
    const alias: any = {
      device: 'devices',
      wizard: 'deployments',
      success: 'deployments',
      deployment: 'deployments'
    };
    const cur: any = alias[s.page] || s.page;
    const nav: any = navDef.map(([label, items]: any): any => {
      const closed: any = !!s.navClosed[label];
      return {
        label,
        closed,
        expanded: !closed,
        chev: closed ? '›' : '⌄',
        toggle: (): any => this.setState((x: any): any => ({
          navClosed: {
            ...x.navClosed,
            [label]: !x.navClosed[label]
          }
        })),
        itemsDisp: closed && !s.collapsed ? 'none' : 'block',
        items: items.map(([id, l, icon, prev]: any): any => {
          const a: any = id === cur;
          return {
            id,
            label: l,
            icon,
            current: a ? 'page' : null,
            preview: !!prev,
            go: this.go(id),
            bg: a ? '#22262B' : 'transparent',
            color: a ? '#fff' : '#B8BDC5',
            bar: a ? '#C6A16B' : 'transparent',
            iconColor: a ? '#C6A16B' : '#8C939D'
          };
        })
      };
    });
    const pg: any = {};
    PAGES.forEach((p: any): any => pg[p] = s.page === p ? 'block' : 'none');
    const pgShow: any = {};
    PAGES.forEach((p: any): any => pgShow[p] = s.page === p);
    // search
    const q: any = s.q.toLowerCase();
    const all: any = [...DEVICES.map((d: any): any => ({
      name: d.id + ' · ' + d.user,
      type: 'DEVICE',
      go: this.openDevice(d.id)
    })), ...PATCHES.map((p: any): any => ({
      name: p.name,
      type: 'PATCH',
      go: this.go('patches')
    })), ...VULNS.map((v: any): any => ({
      name: v.cve,
      type: 'VULNERABILITY',
      go: this.go('vulns')
    })), ...DEPLOYS.map((d: any): any => ({
      name: d.name,
      type: 'DEPLOYMENT',
      go: this.go('deployment')
    })), ...SITES.map((x: any): any => ({
      name: x.name,
      type: "AEGIS ZONE",
      go: this.go('sites')
    }))];
    const results: any = (q ? all.filter((r: any): any => r.name.toLowerCase().includes(q)) : all.slice(0, 6)).slice(0, 8);
    // devices
    const dq: any = s.dq.toLowerCase();
    let devs: any = DEVICES.filter((d: any): any => (!dq || (d.id + d.user + d.site + d.os).toLowerCase().includes(dq)) && (s.dOS === 'All' || d.os.startsWith(s.dOS)) && (s.dStatus === 'All' || d.status === s.dStatus) && (s.dRisk === 'All' || d.risk === s.dRisk));
    if (s.dView === 'Critical Devices') devs = devs.filter((d: any): any => d.risk === 'Critical' || d.health === 'Critical');
    if (s.dView === 'Offline > 7 Days') devs = devs.filter((d: any): any => d.seen.includes('days') && parseInt(d.seen) > 7);
    if (s.dView === 'Missing Critical Patches') devs = devs.filter((d: any): any => d.patch !== 'Compliant');
    if (s.dView === 'Recently Enrolled') devs = devs.filter((d: any): any => d.id === 'LAPTOP-031');
    if (s.dView === 'Poor DEX') devs = devs.filter((d: any): any => d.dex === 'Poor' || d.dex === 'Warning');
    if (s.dView === 'Restart Required') devs = devs.filter((d: any): any => d.patch !== 'Compliant');
    if (s.dHealth && s.dHealth !== 'All' && s.dHealth !== 'Offline') devs = devs.filter((d: any): any => d.health === s.dHealth);
    if (s.advancedFilters?.some(Boolean)) devs = devs.filter((d: any) => ['health', 'site', 'patch'].every((key, i) => !s.advancedFilters[i] || String(d[key]).toLowerCase().includes(s.advancedFilters[i].toLowerCase())));
    const devices: any = devs.map((d: any): any => ({
      ...d,
      checked: s.sel.includes(d.id),
      toggle: (): any => this.setState((x: any): any => ({
        sel: x.sel.includes(d.id) ? x.sel.filter((i: any): any => i !== d.id) : [...x.sel, d.id]
      })),
      open: this.openDevice(d.id),
      quick: this.deviceDrawer(d),
      rowBg: s.sel.includes(d.id) ? '#FFF7EB' : '#fff',
      bar: d.risk === 'Critical' || d.health === 'Critical' ? BARC.red : d.risk === 'High' || d.health === 'Warning' ? BARC.amber : BARC.green,
      statusDot: DOT[K(d.status)],
      health: d.health,
      healthP: st(d.health),
      patchP: st(d.patch),
      riskP: st(d.risk),
      dexP: st(d.dex)
    }));
    const views: any = ['All Devices', 'Critical Devices', 'Offline > 7 Days', 'Missing Critical Patches', 'Poor DEX', 'Recently Enrolled', 'Restart Required'].map((v: any): any => ({
      label: v,
      active: v === s.dView,
      bg: v === s.dView ? '#22262B' : '#fff',
      c: v === s.dView ? '#fff' : '#20262E',
      set: (): any => this.setState({
        dView: v
      })
    }));
    const devTabs: any = [['all', 'All Devices'], ['groups', 'Device Groups'], ['requests', 'Enrollment Requests']].map(([id, l]: any): any => ({
      id,
      label: l,
      set: (): any => this.setState({
        dTab: id
      }),
      c: s.dTab === id ? '#20262E' : '#69717D',
      w: s.dTab === id ? '600' : '400',
      bb: s.dTab === id ? '#C6A16B' : 'transparent'
    }));
    const devId: any = s.devId || 'LAPTOP-001';
    const dev: any = DEVICES.find((d: any): any => d.id === devId) || DEVICES[0];
    const ddTabs: any = ['Overview', 'Hardware', 'Software', 'Patches', 'Vulnerabilities', 'DEX', 'Activity', 'Diagnostics'].map((l: any): any => {
      const id: any = l.toLowerCase();
      return {
        id,
        label: l,
        set: (): any => this.setState({
          ddTab: id
        }),
        c: s.ddTab === id ? '#20262E' : '#69717D',
        w: s.ddTab === id ? '600' : '400',
        bb: s.ddTab === id ? '#C6A16B' : 'transparent'
      };
    });
    const dd: any = {};
    ['overview', 'security', 'hardware', 'software', 'patches', 'vulnerabilities', 'dex', 'activity', 'diagnostics'].forEach((t: any): any => dd[t] = s.ddTab === t ? 'block' : 'none');
    // patches
    const pTabs: any = [['overview', 'Overview'], ['available', 'Available'], ['approved', 'Approved'], ['deployments', 'Deployments'], ['history', 'History']].map(([id, l]: any): any => ({
      id,
      label: l,
      set: (): any => this.setState({
        pTab: id
      }),
      c: s.pTab === id ? '#20262E' : '#69717D',
      w: s.pTab === id ? '600' : '400',
      bb: s.pTab === id ? '#C6A16B' : 'transparent'
    }));
    const patches: any = PATCHES.filter((p: any): any => !(s.uxDeclined || []).includes(p.id)).map((p: any): any => ({
      ...p,
      status: s.uxApprovals?.[p.id] || p.status,
      applicable: s.page === 'patches' && s.uxPlatform !== 'All' && p.byPlatform[s.uxPlatform] ? String(p.byPlatform[s.uxPlatform]) : p.applicable
    })).filter((p: any): any => s.page !== 'patches' || s.uxPlatform === 'All' || p.byPlatform?.[s.uxPlatform]).filter((p: any): any => (!s.pQuery || (p.name + p.product + p.cves).toLowerCase().includes(s.pQuery.toLowerCase())) && (s.pSeverity === 'All' || p.severity === s.pSeverity) && (s.pStatus === 'All' || p.status === s.pStatus)).map((p: any): any => ({
      ...p,
      checked: s.psel.includes(p.id),
      toggle: (): any => this.setState((x: any): any => ({
        psel: x.psel.includes(p.id) ? x.psel.filter((i: any): any => i !== p.id) : [...x.psel, p.id]
      })),
      open: this.patchDrawer(p),
      bar: bar(p.severity),
      sevP: st(p.severity),
      stP: st(p.status),
      failedC: p.failed === '0' ? '#20262E' : '#B52D35',
      deploy: this.startDeploy('Patches'),
      approve: (): any => {
        this.setState((x: any): any => ({
          uxApprovals: {
            ...x.uxApprovals,
            [p.id]: 'Approved'
          }
        }));
        this.toast(p.name + ' approved');
      },
      decline: (): any => {
        this.setState((x: any): any => ({
          uxDeclined: [...(x.uxDeclined || []), p.id]
        }));
        this.toast(p.name + ' declined — hidden from Updates');
      }
    }));
    // vulns
    const vulns: any = VULNS.filter((v: any): any => s.vFilter === 'All' || v.severity === s.vFilter).map((v: any): any => ({
      ...v,
      open: this.vulnDrawer(v),
      bar: bar(v.severity),
      sevP: st(v.severity),
      fixP: v.fix === 'No Fix' ? P('gray') : P('green'),
      deploy: this.startDeploy('Patches'),
      viewDevices: this.go('devices', {
        dRisk: v.severity === 'Critical' ? 'Critical' : 'All'
      })
    }));
    const vsum: any = ['Critical', 'High', 'Medium', 'Low'].map((l: any): any => ({
      label: l,
      count: ({
        Critical: '82',
        High: '247',
        Medium: '611',
        Low: '1,384'
      } as Record<string, any>)[l],
      color: ({
        Critical: '#D34249',
        High: '#D6A009',
        Medium: '#D6A009',
        Low: '#8A9099'
      } as Record<string, any>)[l],
      set: (): any => this.setState({
        vFilter: s.vFilter === l ? 'All' : l
      }),
      border: s.vFilter === l ? '#C6A16B' : '#E5E9ED'
    }));
    // deployments
    const depTabs: any = [['Running', 'Active'], ['Scheduled', 'Scheduled'], ['Completed', 'Completed'], ['Failed', 'Failed']].map(([id, l]: any): any => ({
      id,
      label: l,
      set: (): any => this.setState({
        depTab: id
      }),
      c: s.depTab === id ? '#20262E' : '#69717D',
      w: s.depTab === id ? '600' : '400',
      bb: s.depTab === id ? '#C6A16B' : 'transparent'
    }));
    const deployments: any = DEPLOYS.filter((d: any): any => s.depTab === 'all' || d.status === s.depTab).map((d: any): any => ({
      ...d,
      open: this.deployDrawer(d),
      detail: this.go('deployment'),
      bar: bar(d.status),
      stBg: st(d.status).bg,
      stC: st(d.status).c,
      pctW: d.pct + '%',
      barC: d.status === 'Failed' ? '#D34249' : d.status === 'Completed' ? '#19845B' : d.status === 'Running' ? '#D6A009' : '#C4C8CE'
    }));
    // wizard
    const steps: any = WSTEPS.map((l: any, i: any): any => ({
      n: i + 1,
      label: l,
      bg: i === s.step ? '#C6A16B' : i < s.step ? '#FFF5D6' : '#fff',
      c: i === s.step ? '#181B1F' : i < s.step ? '#7F6038' : '#69717D',
      border: i <= s.step ? '#C6A16B' : '#E5E9ED',
      lc: i < s.step ? '#C6A16B' : '#E5E9ED',
      isLast: i === WSTEPS.length - 1,
      lw: i === s.step ? '600' : '400'
    }));
    const wp: any = {};
    WSTEPS.forEach((l: any, i: any): any => wp[l.toLowerCase()] = s.step === i ? 'block' : 'none');
    const radio: any = (key: any, val: any, label: any, sub: any): any => ({
      label,
      sub,
      set: (): any => this.setState({
        [key]: val
      }),
      sel: s[key] === val,
      border: s[key] === val ? '#C6A16B' : '#E5E9ED',
      bg: s[key] === val ? '#FFF7EB' : '#fff',
      mark: s[key] === val ? '●' : '○'
    });
    const uxReadyDeployment: any = s.wTarget === 'Ready critical devices' && s.wContent === 'Patches';
    const uxContentLabel: any = uxReadyDeployment ? 'Approved critical updates · ' + (s.uxTargetPlatform === 'All' ? 'All platforms' : s.uxTargetPlatform) : 'KB5071234, Chrome 145.0.2';
    const wContentOpts: any = [radio('wContent', 'Patches', 'Patches', uxContentLabel), radio('wContent', 'Software', 'Software', 'Google Chrome 145.0.1')];
    const wTargetOpts: any = [...(s.wTarget === 'Ready critical devices' ? [radio('wTarget', 'Ready critical devices', 'Critical-ready cohort · ' + (s.uxTargetPlatform === 'All' ? 'All platforms' : s.uxTargetPlatform), s.uxTargetCount + ' endpoints · verified at review')] : []), radio('wTarget', 'Pilot Ring', 'Device Group · Pilot Ring', '25 devices'), radio('wTarget', 'Finance Windows', 'Device Group · Finance Windows', '842 devices'), radio('wTarget', 'Jaipur Branch', "Aegis Zone \xB7 Jaipur Branch", '240 devices'), radio('wTarget', 'Selected Devices', 'Devices · Selected in table', (s.sel.length || 3) + ' devices')];
    const impacted: any = ({
      'Ready critical devices': String(s.uxTargetCount),
      'Pilot Ring': '25',
      'Finance Windows': '842',
      'Jaipur Branch': '240',
      'Selected Devices': String(s.sel.length || 3)
    } as Record<string, any>)[s.wTarget];
    const wSchedOpts: any = [radio('wSched', 'now', 'Deploy Now', 'Starts immediately after signing'), radio('wSched', 'later', 'Schedule', 'Tonight, 11:00 PM · Asia/Kolkata')];
    const wNetOpts: any = [radio('wNet', 'Automatic', 'Automatic', "Agent chooses the best path per Aegis Zone"), radio('wNet', 'Direct from Central', 'Direct from Central', 'Bypass peer cache'), radio('wNet', 'Prefer Local Peer Cache', 'Prefer Local Peer Cache', 'Pull from elected peer where available')];
    const wOpts: any = [['retry', 'Retry failed devices'], ['mw', 'Respect maintenance window'], ['restart', 'Allow restart'], ['force', 'Force restart'], ['notify', 'Notify user']].map(([k, l]: any): any => ({
      label: l,
      on: s.wOpts[k],
      mark: s.wOpts[k] ? '☑' : '☐',
      c: s.wOpts[k] ? '#7F6038' : '#69717D',
      toggle: (): any => this.setState((x: any): any => ({
        wOpts: {
          ...x.wOpts,
          [k]: !x.wOpts[k]
        }
      }))
    }));
    const review: any = [{
      k: 'Selected Content',
      v: s.wContent === 'Patches' ? uxContentLabel : 'Google Chrome 145.0.1'
    }, {
      k: 'Target Devices',
      v: impacted + ' devices'
    }, {
      k: "Aegis Zones",
      v: s.wTarget === 'Ready critical devices' ? "Aegis Zones within the selected ready cohort" : s.wTarget === 'Jaipur Branch' ? 'Jaipur Branch' : 'Mumbai HQ, Delhi Branch'
    }, {
      k: 'Schedule',
      v: s.wSched === 'now' ? 'Deploy now' : s.wDate + ' ' + s.wTime + ' (Asia/Kolkata)'
    }, {
      k: 'Network Strategy',
      v: s.wNet + ' · ' + s.wBandwidth + ' · ' + s.wStagger
    }, {
      k: 'Restart Policy',
      v: s.wOpts.force ? 'Force restart' : s.wOpts.restart ? 'Allow restart' : 'No restart'
    }, {
      k: 'Retry Policy',
      v: s.wOpts.retry ? 'Retry failed devices (3×)' : 'No retry'
    }];
    const fails: any = [['Download Failed', 9], ['Restart Pending', 6], ['Install Failed', 4], ['Device Offline', 3]].map(([l, n]: any): any => ({
      label: l,
      n,
      set: (): any => this.setState({
        failFilter: s.failFilter === l ? null : l
      }),
      border: s.failFilter === l ? '#C6A16B' : '#E5E9ED',
      bg: s.failFilter === l ? '#FFF7EB' : '#fff'
    }));
    const failDevs: any = [['LAPTOP-002', 'Download Failed'], ['LAPTOP-017', 'Device Offline'], ['SRV-122', 'Device Offline'], ['LAPTOP-044', 'Install Failed'], ['LAPTOP-058', 'Restart Pending'], ['LAPTOP-061', 'Download Failed']].filter(([, r]: any): any => !s.failFilter || r === s.failFilter).map(([id, r]: any): any => ({
      id,
      reason: r,
      open: this.openDevice(id)
    }));
    // misc lists
    const sites: any = SITES.map((x: any): any => ({
      ...x,
      open: this.siteDrawer(x),
      bar: bar(x.status),
      connP: st(x.conn),
      stP: st(x.status),
      cacheP: x.cache === 'Not required' ? P('gray') : P('green')
    }));
    const caches: any = SITES.filter((x: any): any => x.node !== '—').map((x: any): any => ({
      ...x,
      health: x.status === 'Warning' ? 'Degraded' : 'Healthy',
      bar: bar(x.status),
      healthP: x.status === 'Warning' ? P('amber') : P('green'),
      stP: st(x.status),
      reelect: this.confirm('Re-elect cache node?', 'A new agent in ' + x.name + ' will be elected as the local peer cache. Content is re-seeded from central.', 'Re-elect', 'Cache re-election started for ' + x.name),
      disable: this.confirm('Disable peer cache?', 'Devices in ' + x.name + ' will download directly from central until re-enabled.', 'Disable', 'Peer cache disabled for ' + x.name, 'danger'),
      activity: this.siteDrawer(x)
    }));
    const apps: any = [{
      name: 'Google Chrome',
      version: '145.0.1',
      platform: 'Windows / macOS',
      devices: '18,210',
      avail: '145.0.2',
      status: 'Ready',
      install: 'msiexec /i chrome.msi /qn',
      uninstall: 'msiexec /x {GUID} /qn',
      history: '3 deployments · last 4 h ago'
    }, {
      name: '7-Zip',
      version: '24.08',
      platform: 'Windows',
      devices: '8,230',
      avail: '24.09',
      status: 'Ready',
      install: 'msiexec /i 7z.msi /qn',
      uninstall: 'msiexec /x {GUID} /qn',
      history: '1 deployment · 12 days ago'
    }, {
      name: 'VLC',
      version: '3.0.21',
      platform: 'Windows / macOS / Linux',
      devices: '2,410',
      avail: '3.0.21',
      status: 'Ready',
      install: 'vlc.exe /S',
      uninstall: 'uninstall.exe /S',
      history: '—'
    }, {
      name: 'Custom Finance App',
      version: '5.3.2',
      platform: 'Windows',
      devices: '1,842',
      avail: '5.4.0',
      status: 'Testing',
      install: 'msiexec /i finance.msi /qn',
      uninstall: 'msiexec /x {GUID} /qn',
      history: '1 deployment · 46 failed'
    }, {
      name: 'Custom EXE — VPN Client',
      version: '2.9',
      platform: 'Windows',
      devices: '640',
      avail: '2.9',
      status: 'Ready',
      install: 'vpn-setup.exe /quiet',
      uninstall: 'vpn-setup.exe /uninstall /quiet',
      history: '—'
    }].map((a: any): any => ({
      ...a,
      open: this.appDrawer(a),
      stP: st(a.status),
      bar: bar(a.status),
      deploy: this.startDeploy('Software')
    }));
    const dexRows: any = [['LAPTOP-001', '92', '18 s', '21%', '54%', 'Healthy', 'Stable'], ['LAPTOP-002', '71', '41 s', '63%', '78%', 'Healthy', '2 crashes'], ['LAPTOP-017', '38', '96 s', '88%', '91%', 'Warning', '7 crashes'], ['MAC-021', '95', '12 s', '14%', '48%', 'Healthy', 'Stable']].map(([id, score, boot, cpu, mem, disk, app]: any): any => ({
      id,
      score,
      boot,
      cpu,
      mem,
      disk,
      app,
      open: this.openDevice(id),
      scoreC: +score >= 80 ? '#19845B' : +score >= 60 ? '#D6A009' : '#D34249',
      bar: +score >= 80 ? '#19845B' : +score >= 60 ? '#D6A009' : '#D34249'
    }));
    const tokens: any = [{
      name: 'ServiceNow Connector',
      scope: 'Devices: Read · Vulnerability: Read',
      created: 'Aug 2',
      expires: 'Nov 2',
      used: 'Today',
      status: 'Active'
    }, {
      name: 'Automation Pipeline',
      scope: 'Patch: Read/Write · Deployment: Write',
      created: 'Jul 14',
      expires: 'Oct 14',
      used: '1 h ago',
      status: 'Active'
    }, {
      name: 'Legacy Reporting',
      scope: 'Devices: Read',
      created: 'Feb 1',
      expires: 'Expired',
      used: '41 days ago',
      status: 'Failed'
    }].map((t: any): any => ({
      ...t,
      stP: t.status === 'Active' ? P('green') : P('gray'),
      status: t.status === 'Failed' ? 'Expired' : t.status,
      revoke: this.confirm('Revoke token?', 'Applications using "' + t.name + '" will lose access immediately.', 'Revoke', 'Token revoked', 'danger')
    }));
    const health: any = [['API Gateway', 'Healthy', '42 ms p95'], ['Database', 'Healthy', 'Replication lag 0.2 s'], ['Messaging', 'Healthy', 'Queue depth 118'], ['Object Storage', 'Healthy', '4.2 TB used'], ['Agent Connections', 'Warning', '1,180 agents reconnecting'], ['Content Sync', 'Healthy', 'Last vendor sync 6 min ago']].map(([n, st_, d]: any): any => ({
      name: n,
      status: st_,
      detail: d,
      stP: st(st_),
      dot: DOT[K(st_)]
    }));
    // ---- V2: nav icons + collapsed ----
    nav.forEach((g: any): any => g.items.forEach((it: any): any => {
      it.path = ICONS[it.id] || ICONS.home;
      it.labelDisp = s.collapsed ? 'none' : 'block';
    }));
    const W: any = 560,
      H: any = 200,
      PAD: any = 8;
    const pct: any = (v: any): any => v + '%';
    const filt: any = s.fPlat === 'Windows' ? 'windows' : s.fPlat === 'macOS' ? 'macos' : s.fPlat === 'Linux' ? 'linux' : 'overall';
    const rangeN: any = s.fRange === 'Last 7 Days' ? 7 : s.fRange === 'Last 90 Days' ? 30 : 30;
    const cut: any = (a: any): any => a.slice(a.length - rangeN);
    const siteMul: any = ({
      "All Aegis Zones": 1,
      'Mumbai HQ': 0.52,
      'Delhi Branch': 0.09,
      'Jaipur Branch': 0.01,
      'Bengaluru': 0.2
    } as Record<string, any>)[s.fSite] || 1;
    const num: any = (n: any): any => Math.round(n * siteMul).toLocaleString('en-US');
    const fScope: any = [s.fSite, s.fPlat, s.fRange].join(' · ');
    const platMul: any = s.fPlat === 'Windows' ? 0.57 : s.fPlat === 'macOS' ? 0.21 : s.fPlat === 'Linux' ? 0.15 : 1;
    const n2: any = (v: any): any => Math.round(v * siteMul * platMul).toLocaleString('en-US');
    const endpointsLabel: any = n2(24840);
    // A. compliance — vertical bars only (no line/area charts)
    const cs: any = {
      overall: cut(SER.overall),
      windows: cut(SER.windows),
      macos: cut(SER.macos),
      linux: cut(SER.linux)
    };
    const compliance: any = {
      current: cs[filt][cs[filt].length - 1].toFixed(1) + '%'
    };
    const wn: any = cs[filt].length;
    const weekly: any = [0, .2, .4, .6, .8, 1].map((f: any): any => {
      const i: any = Math.round(f * (wn - 1));
      return {
        i,
        label: cut(DAYS30)[i] || '',
        v: cs[filt][i]
      };
    });
    compliance.bars = weekly.map((w: any, j: any): any => ({
      label: w.label,
      v: w.v.toFixed(1) + '%',
      h: Math.round(lin(w.v, 80, 100, 0, 100)) + '%',
      c: j === 5 ? '#19845B' : '#C4C8CE',
      tc: j === 5 ? '#19845B' : '#69717D',
      go: this.go('patches')
    }));
    compliance.targetPct = Math.round(lin(95, 80, 100, 0, 100)) + '%';
    // B. exposure — severity bars only
    const exposure: any = {
      bars: [{
        label: 'Critical',
        v: num(312),
        w: '25%',
        c: '#D34249',
        delta: '↓ 8.6%',
        go: this.go('vulns', {
          vFilter: 'Critical'
        })
      }, {
        label: 'High',
        v: num(847),
        w: '68%',
        c: '#D6A009',
        delta: '↓ 7.1%',
        go: this.go('vulns', {
          vFilter: 'High'
        })
      }, {
        label: 'Medium',
        v: num(1248),
        w: '100%',
        c: '#D6A009',
        delta: '↓ 9.6%',
        go: this.go('vulns', {
          vFilter: 'Medium'
        })
      }]
    };
    // C. deployment reliability
    const reliability: any = [{
      name: 'September Security Update',
      s: 91,
      p: 6,
      f: 3,
      id: 'DEP-1039'
    }, {
      name: 'Chrome 145 Rollout',
      s: 97,
      p: 2,
      f: 1,
      id: 'DEP-1035'
    }, {
      name: 'Finance Patch Wave',
      s: 84,
      p: 8,
      f: 8,
      id: 'DEP-1031'
    }].map((r: any): any => ({
      ...r,
      sw: pct(r.s),
      pw: pct(r.p),
      fw: pct(r.f),
      open: this.go('deployment')
    }));
    // D. fleet ring
    const ringParts: any = ringSegs([{
      v: 21540,
      c: '#19845B',
      label: 'Healthy',
      go: this.go('devices', {
        dView: 'All Devices',
        dRisk: 'Low'
      })
    }, {
      v: 2476,
      c: '#D6A009',
      label: 'Warning',
      go: this.go('devices', {
        dRisk: 'High'
      })
    }, {
      v: 824,
      c: '#D34249',
      label: 'Critical',
      go: this.go('devices', {
        dView: 'Critical Devices'
      })
    }], 66, 34, 70, 70).map((p: any): any => ({
      ...p,
      vs: num(p.v)
    }));
    // funnel
    const funnel: any = [['Critical vulnerabilities', 312, '#D34249'], ['Patch available', 186, '#D6A009'], ['Approved', 164, '#D6A009'], ['Remediation scheduled', 142, '#D6A009'], ['Remediated', 118, '#19845B']].map(([l, v, c]: any, i: any): any => ({
      label: l,
      v: num(v),
      w: pct(Math.round(v / 312 * 100)),
      c,
      last: i === 4
    }));
    // sites efficiency
    const siteEff: any = [['Mumbai HQ', 94, '#19845B'], ['Delhi Branch', 87, '#19845B'], ['Jaipur Branch', s.promoted ? 84 : 61, s.promoted ? '#19845B' : '#D6A009'], ['Bengaluru', 91, '#19845B']].map(([n, v, c]: any): any => ({
      name: n,
      v: v + '%',
      w: pct(v),
      c,
      warn: v < 70,
      open: this.siteDrawer(SITES.find((x: any): any => x.name === n))
    }));
    const dexTrend: any = {
      current: cut(SER.dex)[cut(SER.dex).length - 1].toFixed(0)
    };
    const kpi4: any = [{
      label: 'Fleet Health',
      value: s.fSite === 'Jaipur Branch' ? '71' : s.fSite === 'Delhi Branch' ? '88' : '92',
      unit: '/ 100',
      trend: '+2.1 this week',
      up: true,
      go: this.go('devices')
    }, {
      label: 'Patch Compliance',
      value: compliance.current,
      unit: '',
      trend: '+1.8%',
      up: true,
      go: this.go('patches')
    }, {
      label: 'Exposure Risk',
      value: n2(312),
      unit: 'Critical',
      trend: '−8.6%',
      up: true,
      go: this.go('vulns', {
        vFilter: 'Critical'
      })
    }, {
      label: 'Deployment Health',
      value: s.fSite === 'Jaipur Branch' ? '84.0%' : '97.4%',
      unit: '',
      trend: '+0.9%',
      up: true,
      go: this.go('deployments')
    }];
    const strip: any = [{
      l: 'Total Endpoints',
      v: num(24840),
      go: this.go('devices')
    }, {
      l: 'Online',
      v: num(22610),
      c: '#19845B',
      go: this.go('devices', {
        dStatus: 'Online'
      })
    }, {
      l: 'Offline',
      v: num(2230),
      c: '#69717D',
      go: this.go('devices', {
        dStatus: 'Offline'
      })
    }, {
      l: 'Needs Attention',
      v: num(556),
      c: '#B52D35',
      go: this.go('devices', {
        dView: 'Critical Devices'
      })
    }];
    // risk & action center
    const risk: any = [{
      sev: 'CRITICAL',
      sc: '#D34249',
      sbg: '#FCEBEC',
      count: n2(312),
      title: 'Critical vulnerabilities detected',
      meta: '124 endpoints affected · First detected 4 hours ago',
      a1: 'Review',
      a1go: this.go('vulns', {
        vFilter: 'Critical'
      }),
      a2: 'Deploy Fix',
      a2go: this.startDeploy('Patches')
    }, {
      sev: 'CRITICAL',
      sc: '#D34249',
      sbg: '#FCEBEC',
      count: n2(84),
      title: 'Devices missing critical patches',
      meta: 'Oldest unresolved: 17 days',
      a1: 'View Devices',
      a1go: this.go('devices', {
        dView: 'Missing Critical Patches'
      }),
      a2: 'Patch Now',
      a2go: this.startDeploy('Patches')
    }, {
      sev: 'WARNING',
      sc: '#D6A009',
      sbg: '#FDF4E1',
      count: n2(21),
      title: 'Failed deployments',
      meta: 'Primary cause: Device Offline — 48% · Last 24 h',
      a1: 'Investigate',
      a1go: this.go('deployments', {
        depTab: 'Failed'
      }),
      a2: 'Retry Failed',
      a2go: this.confirm('Retry 21 failed devices?', 'Failed devices are re-queued with their original deployment options.', 'Retry', '21 devices re-queued')
    }, {
      sev: 'WARNING',
      sc: '#D6A009',
      sbg: '#FDF4E1',
      count: '3',
      title: "Aegis Zones reporting delivery issues",
      meta: 'Jaipur peer-cache node degraded · 38 min',
      a1: "Open Aegis Zones",
      a1go: this.go('sites'),
      a2: '',
      a2go: null
    }].map((r: any): any => ({
      ...r,
      hasA2: !!r.a2
    }));
    // command palette
    const cmds: any = [['Go to Devices', 'NAVIGATE', this.go('devices')], ['Go to Vulnerabilities', 'NAVIGATE', this.go('vulns')], ['Go to Patches', 'NAVIGATE', this.go('patches')], ['Go to Deployments', 'NAVIGATE', this.go('deployments')], ['Deploy Patch', 'ACTION', this.startDeploy('Patches')], ['Deploy Software', 'ACTION', this.startDeploy('Software')], ['Run Vulnerability Scan', 'ACTION', (): any => {
      this.setState({
        palette: false
      });
      reviewAction(this, 'Run Vulnerability Scan');
    }], ['Create Deployment', 'ACTION', this.startDeploy('Patches')], ["Open Aegis Zone: Jaipur Branch", 'ACTION', (): any => {
      this.setState({
        palette: false,
        page: 'sites'
      });
      this.siteDrawer(SITES[2])();
    }], ['Generate Report', 'ACTION', (): any => {
      this.setState({
        palette: false
      });
      this.go('reports')();
    }]].map(([name, type, go]: any): any => ({
      name,
      type,
      go
    }));
    const palAll: any = [...cmds, ...DEVICES.map((d: any): any => ({
      name: d.id + ' · ' + d.user,
      type: 'DEVICES',
      go: this.openDevice(d.id)
    })), ...VULNS.map((v: any): any => ({
      name: v.cve,
      type: 'VULNERABILITIES',
      go: this.go('vulns')
    })), ...PATCHES.map((p: any): any => ({
      name: p.name,
      type: 'PATCHES',
      go: this.go('patches')
    })), ...[{
      name: 'Google Chrome',
      type: 'SOFTWARE'
    }, {
      name: '7-Zip',
      type: 'SOFTWARE'
    }].map((x: any): any => ({
      ...x,
      go: this.go('software')
    })), ...DEPLOYS.map((d: any): any => ({
      name: d.name,
      type: 'DEPLOYMENTS',
      go: this.go('deployment')
    })), ...SITES.map((x: any): any => ({
      name: x.name,
      type: "AEGIS ZONES",
      go: (): any => {
        this.setState({
          palette: false,
          page: 'sites'
        });
        this.siteDrawer(x)();
      }
    }))];
    const pq: any = s.q.toLowerCase();
    const palFlat: any = (pq ? palAll.filter((r: any): any => r.name.toLowerCase().includes(pq)) : palAll.filter((r: any): any => r.type === 'NAVIGATE' || r.type === 'ACTION')).slice(0, 14);
    const palGroups: any = [];
    palFlat.forEach((r: any, i: any): any => {
      let g: any = palGroups.find((x: any): any => x.type === r.type);
      if (!g) {
        g = {
          type: r.type,
          items: []
        };
        palGroups.push(g);
      }
      g.items.push({
        ...r,
        idx: i,
        active: i === s.palIdx,
        bg: i === s.palIdx ? '#FFF5D6' : 'transparent',
        enter: (): any => this.setState({
          palIdx: i
        })
      });
    });
    // table sort + pagination for devices (applied later on devices var)
    const rowPad: any = s.density === 'compact' ? '5px 10px' : '9px 10px';
    const cols: any = [['user', 'User'], ['os', 'OS'], ['status', 'Status'], ['health', 'Health'], ['patch', 'Patch'], ['risk', 'Vuln. Risk'], ['dex', 'DEX'], ['site', "Aegis Zone"], ['seen', 'Last Seen']].map(([k, l]: any): any => ({
      k,
      label: l,
      on: !s.hiddenCols.includes(k),
      toggle: (): any => this.setState((x: any): any => ({
        hiddenCols: x.hiddenCols.includes(k) ? x.hiddenCols.filter((c: any): any => c !== k) : [...x.hiddenCols, k]
      })),
      disp: s.hiddenCols.includes(k) ? 'none' : 'table-cell',
      sort: (): any => this.setState((x: any): any => ({
        sortKey: k,
        sortDir: x.sortKey === k ? -x.sortDir : 1
      })),
      arrow: s.sortKey === k ? s.sortDir > 0 ? '↑' : '↓' : ''
    }));
    const colDisp: any = {};
    cols.forEach((c: any): any => colDisp[c.k] = c.disp);
    const colsMap: any = {};
    cols.forEach((c: any): any => colsMap[c.k] = c);
    // OS lifecycle
    const osLife: any = [['Windows 11 24H2', 12421, 'Supported', '#19845B'], ['Windows 11 23H2', 4816, 'Upgrade Recommended', '#D6A009'], ['Windows 10 22H2', 3118, 'End of Support / Risk', '#D34249'], ['macOS 15', 2401, 'Supported', '#19845B'], ['Ubuntu 24.04', 1207, 'Supported', '#19845B']].map(([n, v, st_, c]: any): any => ({
      name: n,
      v: v.toLocaleString('en-US'),
      status: st_,
      c,
      w: pct(Math.round(v / 12421 * 100)),
      go: this.go('devices', {
        dOS: n.split(' ')[0] === 'Ubuntu' ? 'Linux' : n.split(' ')[0]
      })
    }));
    // deployment waves
    const waves: any = [['Pilot', 100, 'Complete', '#19845B'], ['Wave 1', 96, 'Complete', '#19845B'], ['Wave 2', 78, 'Running', '#D6A009'], ['Wave 3', 0, 'Waiting', '#C4C8CE']].map(([n, p, st_, c]: any): any => ({
      name: n,
      p: p + '%',
      w: pct(p),
      status: st_,
      c
    }));
    const causes: any = [['Device Offline', 11], ['Install Failed', 6], ['Restart Pending', 3], ['Download Failed', 2]].map(([l, n]: any, i: any): any => ({
      label: l,
      n: s.retried ? Math.max(0, n - Math.round(n * 0.7)) : n,
      w: pct(Math.round(n / 11 * 100)),
      c: i === 0 ? '#D34249' : '#C4C8CE'
    }));
    const failedNow: any = s.retried ? 7 : 22,
      pendingNow: any = s.retried ? 107 : 92;
    // patch posture
    const backlog: any = [['Critical', 84, '#D34249'], ['High', 247, '#D6A009'], ['Medium', 831, '#D6A009'], ['Low', 1126, '#C4C8CE']].map(([l, n, c]: any): any => ({
      label: l,
      n: n.toLocaleString('en-US'),
      w: pct(Math.round(n / 1126 * 100)),
      c
    }));
    const mttp: any = [['Critical', '18h', 75, '#19845B', 'SLA 24h'], ['High', '2.4 days', 48, '#19845B', 'SLA 5 days'], ['Medium', '6.2 days', 88, '#D6A009', 'SLA 7 days']].map(([l, v, p, c, sla]: any): any => ({
      label: l,
      v,
      w: pct(p),
      c,
      sla
    }));
    const aging: any = [['<7 days', 38, 12, '#19845B'], ['7–30 days', 29, 9, '#D6A009'], ['30–60 days', 12, 6, '#D34249'], ['>60 days', 5, 3, '#D34249']].map(([l, n, crit, c]: any): any => ({
      label: l,
      n,
      crit,
      w: pct(Math.round(n / 38 * 100)),
      c,
      old: l.includes('60')
    }));
    const drivers: any = [['Windows OS', 38], ['Chrome', 22], ['Microsoft Office', 15], ['Java', 11], ['Adobe', 8], ['Other', 6]].map(([l, p]: any, i: any): any => ({
      label: l,
      p: p + '%',
      w: pct(p),
      c: i === 0 ? '#D34249' : '#C4C8CE'
    }));
    const dexIssues: any = [['Slow Boot', 412, '↓ 6%', '#19845B'], ['High CPU', 288, '↑ 3%', '#D34249'], ['Application Crash', 231, '↓ 11%', '#19845B'], ['Low Disk Space', 164, '→ 0%', '#69717D'], ['Network Latency', 97, '↓ 4%', '#19845B']].map(([l, n, t, c]: any): any => ({
      label: l,
      n,
      t,
      c,
      w: pct(Math.round(n / 412 * 100))
    }));
    const delivery: any = [['Central Repository', '412 GB served', '—'], ["Aegis Zone Peer Cache", '184 GB avoided', '71% saved'], ['Local Peer', '96 GB shared', '86% hit rate'], ['Endpoint', '24,840 targets', '18 MB/s avg']].map(([n, v, sv]: any, i: any): any => ({
      name: n,
      v,
      sv,
      last: i === 3,
      lineDisp: i === 3 ? 'none' : 'block'
    }));
    // ================= V3 =================
    const mkTabs: any = (key: any, arr: any): any => arr.map(([id, l, count]: any): any => ({
      id,
      label: l,
      count: count == null ? '' : String(count),
      hasCount: count != null,
      set: (): any => this.setState({
        [key]: id
      }),
      c: s[key] === id ? '#20262E' : '#69717D',
      w: s[key] === id ? '600' : '400',
      bb: s[key] === id ? '#C6A16B' : 'transparent'
    }));
    const show: any = (key: any, ids: any): any => {
      const o: any = {};
      ids.forEach((i: any): any => o[i] = s[key] === i ? 'block' : 'none');
      return o;
    };
    // Overview

    const strip3: any = [{
      l: 'Offline Devices',
      v: n2(2230),
      go: this.go('devices', {
        dStatus: 'Offline',
        dHealth: 'All'
      })
    }, {
      l: 'Restart Required',
      v: n2(184),
      go: this.go('devices', {
        dView: 'Restart Required'
      })
    }, {
      l: 'Failed Actions',
      v: n2(21),
      c: '#B52D35',
      go: this.go('liveops', {
        loTab: 'Failed'
      })
    }, {
      l: 'Pending Actions',
      v: n2(92),
      go: this.go('liveops', {
        loTab: 'Queued'
      })
    }, {
      l: 'Peer Cache Warnings',
      v: '3',
      c: '#896400',
      go: this.go('peercache')
    }];
    const platComp: any = [['Windows', 95, 14200], ['macOS', 93, 5200], ['Linux', 91, 3600]].filter(([n]: any): any => s.fPlat === 'All Platforms' || s.fPlat === n).map(([n, p, tot]: any): any => {
      tot = Math.round(tot * siteMul);
      if (s.fRange === 'Last 7 Days') p = p - 1;
      if (s.fRange === 'Last 90 Days') p = p - 3;
      return {
        name: n,
        p: p + '%',
        w: p + '%',
        nw: 100 - p + '%',
        np: 100 - p + '%',
        ok: Math.round(tot * p / 100).toLocaleString('en-US'),
        bad: Math.round(tot * (100 - p) / 100).toLocaleString('en-US'),
        go: this.go('patches', {
          pTab: 'devices',
          fPlat: n
        })
      };
    });
    const opsStates: any = [['In progress', 127, '#D6A009', 'Running'], ['Completed today', 2381, '#19845B', 'Completed'], ['Failed', 21, '#D34249', 'Failed']];
    const liveRing: any = ringSegs(opsStates.map(([l, v, c, tab]: any): any => ({
      label: l,
      v: Math.max(1, Math.round(v * siteMul * platMul)),
      c,
      tab
    })), 62, 32, 64, 64).map((p: any): any => ({
      ...p,
      go: this.go('liveops', {
        loTab: p.tab
      })
    }));
    const liveTotal: any = liveRing.reduce((a: any, p: any): any => a + p.v, 0);
    const liveAct: any = [['LAPTOP-021', 'Patch installed successfully', '2 min ago', 'Device', '#19845B', this.openDevice('LAPTOP-001')], ['SRV-122', 'Device went offline', '4 min ago', 'Device', '#8A9099', this.openDevice('SRV-122')], ['JAIPUR-PC-01', 'Peer cache degraded', '6 min ago', 'System', '#D6A009', this.go('sites')], ['LAPTOP-002', 'Critical vulnerability detected', '9 min ago', 'Security', '#D34249', this.openDevice('LAPTOP-002')], ['DEP-1042', 'Deployment reached 90%', '11 min ago', 'Deployment', '#69717D', this.go('deployment')], ['LAPTOP-017', 'Restart pending 3 days', '14 min ago', 'Device', '#D6A009', this.openDevice('LAPTOP-017')], ['KB5071234', 'Approved by Priya Singh', '22 min ago', 'Deployment', '#7F6038', this.go('patches')]].map(([t, m, when, cat, c, go]: any): any => ({
      t,
      m,
      when,
      cat,
      c,
      go
    })).filter((a: any): any => s.actFilter === 'All' || a.cat === s.actFilter || s.actFilter === 'Critical' && a.c === '#D34249').slice(0, s.actAll ? 7 : 5);
    const actFilters: any = ['All', 'Critical', 'Device', 'Deployment', 'Security', 'System'].map((f: any): any => ({
      label: f,
      set: (): any => this.setState({
        actFilter: f
      }),
      bg: s.actFilter === f ? '#22262B' : '#fff',
      c: s.actFilter === f ? '#fff' : '#20262E'
    }));
    const ringParts4: any = ringSegs([{
      v: 21540,
      c: '#19845B',
      label: 'Healthy',
      go: this.go('devices', {
        dHealth: 'Healthy'
      })
    }, {
      v: 2476,
      c: '#D6A009',
      label: 'Warning',
      go: this.go('devices', {
        dHealth: 'Warning'
      })
    }, {
      v: 824,
      c: '#D34249',
      label: 'Critical',
      go: this.go('devices', {
        dHealth: 'Critical'
      })
    }], 66, 34, 70, 70).map((p: any): any => ({
      ...p,
      vs: p.v.toLocaleString('en-US')
    }));
    const dexRing: any = ringSegs([{
      v: 22300,
      c: '#19845B',
      label: 'Good'
    }, {
      v: 2402,
      c: '#D6A009',
      label: 'Warning'
    }, {
      v: 138,
      c: '#D34249',
      label: 'Poor'
    }], 60, 30, 62, 62).map((p: any): any => ({
      ...p,
      vs: p.v.toLocaleString('en-US'),
      go: this.go('dex')
    }));
    const wOn: any = {};
    Object.keys(s.widgets).forEach((k: any): any => wOn[k] = s.widgets[k] ? 'block' : 'none');
    const widgetList: any = [['compliance', 'Patch Compliance by Platform'], ['liveops', 'Live Operations'], ['activity', 'Live Activity'], ['funnel', 'Exposure → Remediation'], ['reliability', 'Deployment Reliability'], ['sites', "Aegis Zone Delivery Efficiency"], ['dex', 'DEX Distribution'], ['fleet', 'Fleet Health'], ['os', 'OS Lifecycle']].map(([k, l]: any): any => ({
      k,
      label: l,
      on: s.widgets[k],
      mark: s.widgets[k] ? '☑' : '☐',
      c: s.widgets[k] ? '#7F6038' : '#69717D',
      toggle: (): any => this.setState((x: any): any => ({
        widgets: {
          ...x.widgets,
          [k]: !x.widgets[k]
        },
        preset: 'My Custom View'
      }))
    }));
    const PRESETS: any = {
      'Endpoint Operations': ['compliance', 'liveops', 'activity', 'fleet', 'reliability', 'sites', 'dex', 'os', 'funnel'],
      'Patch Operations': ['compliance', 'reliability', 'liveops', 'os'],
      'Security Posture': ['funnel', 'compliance', 'fleet'],
      'DEX Overview': ['dex', 'fleet', 'activity', 'os']
    };
    const presets: any = ['Endpoint Operations', 'Patch Operations', 'Security Posture', 'DEX Overview', 'My Custom View'].map((p: any): any => ({
      label: p,
      active: s.preset === p,
      bg: s.preset === p ? '#22262B' : '#fff',
      c: s.preset === p ? '#fff' : '#20262E',
      set: (): any => {
        if (PRESETS[p]) {
          const w: any = {};
          Object.keys(s.widgets).forEach((k: any): any => w[k] = PRESETS[p].includes(k));
          this.setState({
            widgets: w,
            preset: p
          });
        } else this.setState({
          preset: p
        });
      }
    }));
    const setupItems: any = ['Create Administrator', 'Enroll First Endpoint', "Configure Aegis Zone", 'Run Vulnerability Scan', 'Create First Patch Deployment', 'Configure Integration'].map((t: any): any => ({
      t,
      done: s.setupDone.includes(t),
      mark: s.setupDone.includes(t) ? '✓' : '○',
      c: s.setupDone.includes(t) ? '#19845B' : '#69717D',
      go: t.includes('Patch') ? this.startDeploy('Patches') : this.go('integrations')
    }));
    const setupCount: any = s.setupDone.length;
    // Devices
    const healthCounts: any = {
      All: 24840,
      Healthy: 21540,
      Warning: 2476,
      Critical: 824,
      Offline: 2230
    };
    const devTabs3: any = ['All', 'Healthy', 'Warning', 'Critical', 'Offline'].map((h: any): any => ({
      label: h,
      count: healthCounts[h].toLocaleString('en-US'),
      set: (): any => this.setState({
        dHealth: h,
        dStatus: h === 'Offline' ? 'Offline' : 'All',
        tblPage: 1
      }),
      c: s.dHealth === h ? '#20262E' : '#69717D',
      w: s.dHealth === h ? '600' : '400',
      bb: s.dHealth === h ? '#C6A16B' : 'transparent'
    }));
    const chips: any = [];
    if (s.dOS !== 'All') chips.push({
      l: 'OS: ' + s.dOS,
      x: (): any => this.setState({
        dOS: 'All'
      })
    });
    if (s.dStatus !== 'All') chips.push({
      l: s.dStatus,
      x: (): any => this.setState({
        dStatus: 'All',
        dHealth: 'All'
      })
    });
    if (s.dRisk !== 'All') chips.push({
      l: 'Risk: ' + s.dRisk,
      x: (): any => this.setState({
        dRisk: 'All'
      })
    });
    if (s.dHealth !== 'All' && s.dHealth !== 'Offline') chips.push({
      l: 'Health: ' + s.dHealth,
      x: (): any => this.setState({
        dHealth: 'All'
      })
    });
    if (s.dq) chips.push({
      l: '"' + s.dq + '"',
      x: (): any => this.setState({
        dq: ''
      })
    });
    if (s.dView !== 'All Devices') chips.push({
      l: 'View: ' + s.dView,
      x: (): any => this.setState({
        dView: 'All Devices'
      })
    });
    const hasChips: any = chips.length > 0;
    const clearAll: any = (): any => this.setState({
      dOS: 'All',
      dStatus: 'All',
      dRisk: 'All',
      dHealth: 'All',
      dq: '',
      dView: 'All Devices'
    });
    // Endpoint 360
    const posture: any = [['Health', dev.health === 'Healthy' ? '94' : '76', dev.health === 'Healthy' ? '#19845B' : '#D6A009'], ['Patch', dev.patch === 'Compliant' ? 'Compliant' : 'Warning', dev.patch === 'Compliant' ? '#19845B' : '#D6A009'], ['Risk', dev.risk, K(dev.risk) === 'red' ? '#D34249' : K(dev.risk) === 'amber' ? '#D6A009' : '#19845B'], ['DEX', dev.dex === 'Healthy' ? '92' : dev.dex === 'Poor' ? '38' : '81', dev.dex === 'Poor' ? '#D34249' : dev.dex === 'Warning' ? '#D6A009' : '#19845B']].map(([l, v, c]: any): any => ({
      l,
      v,
      c
    }));
    const devNeeds: any = dev.health !== 'Healthy';
    const healthBreak: any = devNeeds ? [['Security', 68], ['Patch', 74], ['Agent', 100], ['Compliance', 82]] : [['Security', 100], ['Patch', 86], ['Agent', 100], ['Compliance', 90]];
    const hb: any = healthBreak.map(([l, v]: any): any => ({
      l,
      v,
      w: v + '%',
      c: v >= 90 ? '#19845B' : v >= 70 ? '#D6A009' : '#D34249'
    }));
    const dexBreak: any = [['Boot Experience', 92], ['Performance', 84], ['Application Stability', 74], ['Resource Health', 79]].map(([l, v]: any): any => ({
      l,
      v,
      w: v + '%',
      c: v >= 85 ? '#19845B' : v >= 70 ? '#D6A009' : '#D34249'
    }));
    const perf: any = [['CPU', 28], ['Memory', 64], ['Disk', 71], ['Network Utilization', 32]].map(([l, v]: any): any => ({
      l,
      v: v + '%',
      w: v + '%',
      c: v >= 85 ? '#D34249' : v >= 65 ? '#D6A009' : '#19845B'
    }));
    const procs: any = [['chrome.exe', '12.4%', '1.2 GB'], ['teams.exe', '7.1%', '842 MB'], ['outlook.exe', '3.4%', '516 MB']].map(([n, c, m]: any): any => ({
      n,
      c,
      m
    }));
    const actionGroups: any = [['RECOMMENDED', [['Deploy 3 Critical Fixes', this.startDeploy('Patches'), true]]], ['DEVICE', [['Sync', this.T('Sync completed for ' + dev.id)], ['Restart', this.confirm('Restart ' + dev.id + '?', 'The user receives a 5-minute warning.', 'Restart', 'Restart queued on ' + dev.id)], ['Collect Inventory', this.T('Inventory collection queued')]]], ['SECURITY', [['Run Vulnerability Scan', this.T('Scan started on ' + dev.id)], ['View Critical CVEs', (): any => this.setState({
      actionDrawer: false,
      ddTab: 'vulnerabilities'
    })], ['Deploy Available Fixes', this.startDeploy('Patches')]]], ['SOFTWARE', [['Install Software', this.startDeploy('Software')], ['Uninstall Software', this.T('Uninstall dialog opened')]]], ['DIAGNOSTICS', [['Run Health Check', this.T('Health check completed — 2 findings')], ['Collect Logs', this.T('Log collection queued')], ['Generate Diagnostic Bundle', this.T('Signed diagnostic bundle generated')]]]].map(([g, items]: any): any => ({
      g,
      items: items.map(([l, fn, pri]: any): any => ({
        l,
        fn: (): any => {
          this.setState({
            actionDrawer: false
          });
          fn();
        },
        pri: !!pri,
        bg: pri ? 'linear-gradient(180deg,#E4C795,#C6A16B)' : '#fff',
        bc: pri ? '#B28A55' : '#E5E9ED',
        fw: pri ? '600' : '500'
      }))
    }));
    // Patches
    const pTabs3: any = mkTabs('pTab', [['overview', 'Overview'], ['devices', 'Devices'], ['updates', 'Updates'], ['osupgrades', 'OS Upgrades'], ['deployments', 'Deployments'], ['history', 'History']]);
    const is: any = (key: any, ids: any): any => {
      const o: any = {};
      ids.forEach((i: any): any => o[i] = s[key] === i);
      return o;
    };
    const pShow: any = is('pTab', ['overview', 'devices', 'updates', 'osupgrades', 'deployments', 'history']);
    const pGap: any = [['Affected Devices', 84], ['Online', 72], ['Applicable', 68], ['Ready', 61]].map(([l, v]: any, i: any): any => ({
      l,
      v,
      w: Math.round(v / 84 * 100) + '%',
      c: ['#D34249', '#D6A009', '#D6A009', '#19845B'][i]
    }));
    const pFail: any = [['Device Offline', 42, '#D34249'], ['Restart Pending', 24, '#C4C8CE'], ['Install Failure', 18, '#C4C8CE'], ['Download Failure', 11, '#C4C8CE'], ['Other', 5, '#C4C8CE']].map(([l, p, c]: any): any => ({
      l,
      p: p + '%',
      w: p + '%',
      c
    }));
    const osUp: any = {
      eligible: '3,118',
      ready: '2,614',
      blocked: '504',
      blockers: [['Insufficient Disk', 231], ['Unsupported Hardware', 168], ['Application Compatibility', 105]].map(([l, n]: any): any => ({
        l,
        n,
        w: Math.round(n / 231 * 100) + '%'
      }))
    };
    const pDevRows: any = DEVICES.map((d: any): any => ({
      id: d.id,
      os: d.os,
      comp: d.patch === 'Compliant' ? '100%' : d.patch === 'Missing' ? '71%' : '88%',
      compState: d.patch === 'Compliant' ? 'Compliant' : 'Attention',
      crit: d.patch === 'Compliant' ? '0' : d.patch === 'Missing' ? '3' : '2',
      restart: d.patch === 'Compliant' ? 'No' : 'Yes',
      scan: d.seen,
      last: d.patch === 'Compliant' ? 'Sep 12' : 'Aug 28',
      open: this.openDevice(d.id),
      cc: d.patch === 'Compliant' ? '#19845B' : '#D34249'
    })).filter((d: any): any => (!s.pDevQuery || (d.id + d.os).toLowerCase().includes(s.pDevQuery.toLowerCase())) && (s.pDevCompliance === 'All' || d.compState === s.pDevCompliance));
    // Vulns
    const vTabs: any = mkTabs('vTab', [['overview', 'Overview'], ['findings', 'Findings'], ['affected', 'Affected Devices'], ['remediation', 'Remediation']]);
    const vShow: any = is('vTab', ['overview', 'findings', 'affected', 'remediation']);
    const vRing: any = ringSegs([{
      v: 312,
      c: '#D34249',
      label: 'Critical'
    }, {
      v: 847,
      c: '#D6A009',
      label: 'High'
    }, {
      v: 1248,
      c: '#D6A009',
      label: 'Medium'
    }, {
      v: 3102,
      c: '#C4C8CE',
      label: 'Low'
    }], 60, 30, 62, 62).map((p: any): any => ({
      ...p,
      vs: p.v.toLocaleString('en-US'),
      go: (): any => this.setState({
        vTab: 'findings',
        vFilter: p.label
      })
    }));
    const vDist: any = [['Critical', 312, '#D34249'], ['High', 847, '#D6A009'], ['Medium', 1248, '#D6A009'], ['Low', 3102, '#C4C8CE']].map(([l, n, c]: any): any => ({
      l,
      n: n.toLocaleString('en-US'),
      w: Math.round(n / 3102 * 100) + '%',
      c,
      go: (): any => this.setState({
        vTab: 'findings',
        vFilter: l
      })
    }));
    const vAffected: any = DEVICES.filter((d: any): any => d.risk !== 'Low').map((d: any): any => ({
      ...d,
      open: this.openDevice(d.id),
      riskP: st(d.risk),
      cves: d.risk === 'Critical' ? '4 critical · 11 high' : '1 critical · 6 high'
    }));
    // DEX
    const dexWhy: any = [['Application crashes', -7], ['Slow boot', -5], ['Memory pressure', -3]].map(([l, v]: any): any => ({
      l,
      v: String(v)
    }));
    const dexBreak2: any = [['Boot Performance', 88], ['Performance', 84], ['App Stability', 76], ['Resource Health', 80]].map(([l, v]: any): any => ({
      l,
      v,
      w: v + '%',
      c: v >= 85 ? '#19845B' : v >= 70 ? '#D6A009' : '#D34249'
    }));
    const dexIssues3: any = [['Slow Boot', 412], ['High CPU', 288], ['Memory Pressure', 254], ['Application Crash', 231], ['Low Disk Space', 164], ['Network Issues', 97]].map(([l, n]: any): any => ({
      l,
      n,
      w: Math.round(n / 412 * 100) + '%'
    }));
    // Insight
    const iShow: any = {
      idle: s.insight === 'idle' ? 'block' : 'none',
      running: s.insight === 'running' ? 'block' : 'none',
      result: s.insight === 'result' || s.insight === 'remediating' || s.insight === 'verified' ? 'block' : 'none',
      verified: s.insight === 'verified' ? 'block' : 'none',
      remediating: s.insight === 'remediating' ? 'block' : 'none'
    };
    const iChecks: any = [['Low Disk Space', 'Critical', '#D34249'], ['Memory Pressure', 'High', '#D34249'], ['Application Crashes', 'High', '#D34249'], ['Startup Applications', 'Medium', '#D6A009'], ['CPU Pressure', 'Low', '#19845B']].map(([l, v, c]: any): any => ({
      l,
      v,
      c
    }));
    const iActions: any = [['Free Disk Space', '+8 DEX points'], ['Restart High-Memory Application', '+3 DEX points'], ['Review Startup Applications', '11 sec boot improvement']].map(([l, e]: any): any => ({
      l,
      e
    }));
    // Live ops
    const loTabs: any = mkTabs('loTab', [['Running', 'Running', 127], ['Queued', 'Queued', 92], ['Failed', 'Failed', 21], ['Completed', 'Completed', 1842]]);
    const LO: any = [['September Windows Security Update', 'Patch Deployment', '842', '22 min ago', 86, 'Running'], ['Chrome 145 Rollout', 'Software Installation', '2,400', '4 h ago', 100, 'Completed'], ['Weekly Vulnerability Scan', 'Vulnerability Scan', '24,840', '1 h ago', 64, 'Running'], ['Maintenance Restart — Finance', 'Restart / Maintenance', '842', '11 min ago', 41, 'Running'], ['7-Zip 24.09 Update', 'Software Installation', '8,230', 'Tonight 11 PM', 0, 'Queued'], ['Firefox 146 — Pilot Ring', 'Patch Deployment', '25', 'Tonight 11 PM', 0, 'Queued'], ['Finance App 5.3.2', 'Software Installation', '1,842', '3 days ago', 100, 'Failed'], ['Restart — SRV-122', 'Restart / Maintenance', '1', '09:58', 0, 'Failed']].map(([n, t, tg, st_, p, status]: any): any => ({
      name: n,
      type: t,
      targets: tg,
      started: st_,
      p,
      pw: p + '%',
      status,
      stP: st(status),
      bar: bar(status),
      barC: status === 'Failed' ? '#D34249' : status === 'Completed' ? '#19845B' : status === 'Running' ? '#D6A009' : '#C4C8CE',
      open: this.go('deployment')
    })).filter((o: any): any => o.status === s.loTab && (!s.loType || o.type === s.loType));
    const loType: any = s.loType || '';
    const clearLoType: any = (): any => this.setState({
      loType: null
    });
    // Profiles
    const cfgTabs: any = mkTabs('cfgTab', [['All', 'All'], ['Windows', 'Windows'], ['macOS', 'macOS'], ['Linux', 'Linux']]);
    const profiles: any = [['Windows Security Baseline', 'Windows', '14,200', '96%', 'Active', '2 days ago'], ['Developer Workstation', 'Windows', '1,120', '91%', 'Active', '6 days ago'], ['Executive macOS', 'macOS', '240', '99%', 'Active', '12 days ago'], ['Linux Server Baseline', 'Linux', '1,210', '94%', 'Active', '1 day ago']].map(([n, p, d, c, st_, m]: any): any => ({
      name: n,
      platform: p,
      devices: d,
      comp: c,
      status: st_,
      mod: m,
      stP: st(st_),
      open: (): any => this.setState({
        cfgDrift: true
      })
    })).filter((p: any): any => s.cfgTab === 'All' || p.platform === s.cfgTab);
    const cfgRing: any = ringSegs([{
      v: 16204,
      c: '#19845B',
      label: 'Compliant'
    }, {
      v: 530,
      c: '#D6A009',
      label: 'Needs Attention'
    }, {
      v: 36,
      c: '#D34249',
      label: 'Failed'
    }], 52, 27, 54, 54).map((p: any): any => ({
      ...p,
      vs: p.v.toLocaleString('en-US')
    }));
    // Admin
    const aTabs: any = mkTabs('aTab', [['users', 'Users'], ['roles', 'Roles & Permissions'], ['auth', 'Authentication'], ['sessions', 'Sessions']]);
    const aShow: any = show('aTab', ['users', 'roles', 'auth', 'sessions']);
    const users: any = [['Sumit Kumar', 'Super Admin', 'Passkey', 'Today 10:42', 'Active'], ['Priya Singh', 'Patch Admin', 'Authenticator App', 'Today 09:18', 'Active'], ['Alex Johnson', 'Endpoint Admin', 'Authenticator App', 'Yesterday', 'Active'], ['Neha Rao', 'Security Analyst', '—', '3 days ago', 'Active'], ['Ravi Menon', 'Viewer', '—', '12 days ago', 'Invited']].map(([n, r, m, l, st_]: any): any => {
      const enrolled: any = s.mfaEnrolled.includes(n);
      const mfa: any = enrolled ? 'Protected' : n === 'Alex Johnson' ? 'Protected' : n === 'Neha Rao' ? 'Enrollment Pending' : 'Not Enrolled';
      return {
        name: n,
        role: r,
        method: m,
        last: l,
        status: st_,
        stP: st(st_ === 'Invited' ? 'Scheduled' : st_),
        mfa,
        mfaP: mfa === 'Protected' ? P('green') : mfa === 'Enrollment Pending' ? P('amber') : P('red')
      };
    });
    const roles: any = [['Super Admin', '2', 'Global', 'All permissions', 'Aug 2'], ['Endpoint Admin', '5', "All Aegis Zones", 'Devices · Groups · Deployments', 'Aug 19'], ['Patch Admin', '3', "All Aegis Zones", 'Patches · Deployments', 'Sep 1'], ['Security Analyst', '4', "All Aegis Zones", 'Vulnerabilities · Reports (read)', 'Sep 4'], ['Viewer', '34', "Assigned Aegis Zones", 'Read-only', 'Jul 14']].map(([r, u, sc, p, d]: any): any => ({
      role: r,
      users: u,
      scope: sc,
      perms: p,
      updated: d
    }));
    const sessions: any = [['Sumit Kumar', 'Chrome · Windows 11', '10.42.18.117', 'Mumbai, IN', 'Today 08:02', 'Just now', 'Active'], ['Priya Singh', 'Edge · Windows 11', '10.44.2.31', 'Delhi, IN', 'Today 09:18', '4 min ago', 'Active'], ['Alex Johnson', 'Safari · macOS 15', '10.51.7.9', 'Bengaluru, IN', 'Yesterday 17:40', '19 h ago', 'Idle'], ['API · ServiceNow', 'Service token', '52.14.88.201', 'us-east-1', 'Sep 2', '2 min ago', 'Active']].map(([a, b, ip, loc, st_, la, status]: any, i: any): any => ({
      admin: a,
      browser: b,
      ip,
      loc,
      started: st_,
      last: la,
      status: s.revoked.includes(i) ? 'Revoked' : status,
      stP: s.revoked.includes(i) ? P('gray') : status === 'Active' ? P('green') : P('amber'),
      revoke: this.confirm('Revoke session?', a + ' will be signed out immediately and must re-authenticate with MFA.', 'Revoke', 'Session revoked', 'danger'),
      canRevoke: !s.revoked.includes(i)
    }));
    // Integrations
    const iTabs: any = mkTabs('iTab', [['All', 'All'], ['Connected', 'Connected'], ['Attention', 'Attention'], ['Disabled', 'Disabled']]);
    const connectors3: any = [['ServiceNow', 'Connected', 'Incidents for critical CVEs', '2 min ago', 'Vulnerability: Read · Devices: Read'], ['Splunk', 'Connected', 'Audit stream · 1.2k events/h', 'Just now', 'Activity: Read'], ['Microsoft Teams', 'Attention', 'Deployment alerts · token expiring in 3 days', '1 h ago', 'Deployments: Read'], ['Slack', 'Disabled', 'Deployment alerts', '—', '—'], ['Custom Webhook', 'Connected', 'deployment.completed → https://hooks.corp.example', '6 min ago', 'Deployments: Read'], ['Directory Connector', 'Connected', 'Entra ID · users & groups', '12 min ago', 'Directory: Read']].map(([n, st_, d, sync, scope]: any): any => ({
      name: n,
      status: st_,
      desc: d,
      sync,
      scope,
      stP: st_ === 'Connected' ? P('green') : st_ === 'Attention' ? P('amber') : P('gray'),
      configure: this.T(n + ' configuration opened'),
      test: this.T(n + ': connection test ' + (st_ === 'Disabled' ? 'skipped — disabled' : 'passed')),
      activity: this.go('activity')
    })).filter((c: any): any => s.iTab === 'All' || c.status === s.iTab);
    // Notifications
    const notifs: any = [['Critical', '312 critical vulnerabilities detected', '4 h ago', this.go('vulns', {
      vFilter: 'Critical'
    }), '#D34249'], ['Deployment', 'DEP-1042 reached 90%', '11 min ago', this.go('deployment'), '#69717D'], ['Security', 'KB5071234 approved by Priya Singh', '22 min ago', this.go('patches'), '#7F6038'], ['Device', 'SRV-122 went offline', '4 min ago', this.openDevice('SRV-122'), '#8A9099'], ['Platform', 'Microsoft Teams token expires in 3 days', '1 h ago', this.go('integrations', {
      iTab: 'Attention'
    }), '#D6A009']].map(([cat, t, when, go, c]: any): any => ({
      cat,
      t,
      when,
      go: (): any => {
        this.setState({
          notif: false
        });
        go();
      },
      c
    }));
    // Palette favorites & recent
    const favItems: any = s.favorites.map((f: any): any => ({
      name: f,
      type: 'FAVORITES',
      go: f === 'LAPTOP-002' ? this.openDevice('LAPTOP-002') : f === 'Jaipur Branch' ? (): any => {
        this.setState({
          palette: false,
          page: 'sites'
        });
        this.siteDrawer(SITES[2])();
      } : this.go('devices', {
        dView: 'Critical Devices'
      })
    }));
    const recItems: any = s.recent.map((r: any): any => ({
      name: r,
      type: 'RECENTLY VIEWED',
      go: r.startsWith('CVE') ? this.go('vulns') : r.startsWith('LAPTOP') ? this.openDevice(r) : r.includes('Update') ? this.go('deployment') : this.go('sites')
    }));
    if (!pq) {
      [...favItems, ...recItems].forEach((r: any, j: any): any => {
        const i: any = palFlat.length;
        palFlat.push(r);
        let g: any = palGroups.find((x: any): any => x.type === r.type);
        if (!g) {
          g = {
            type: r.type,
            items: []
          };
          palGroups.push(g);
        }
        g.items.push({
          ...r,
          idx: i,
          active: i === s.palIdx,
          bg: i === s.palIdx ? '#FFF5D6' : 'transparent',
          enter: (): any => this.setState({
            palIdx: i
          })
        });
      });
    }
    const cacheRing: any = ringSegs([{
      v: 86,
      c: '#19845B'
    }, {
      v: 14,
      c: '#D7D9DC'
    }], 52, 27, 54, 54);
    const sortedAll: any = [...devs].sort((a: any, b: any): any => String(a[s.sortKey]).localeCompare(String(b[s.sortKey])) * s.sortDir);
    const totalPages: any = Math.max(1, Math.ceil(sortedAll.length / s.perPage));
    const pageNow: any = Math.min(s.tblPage, totalPages);
    const pageDevs: any = sortedAll.slice((pageNow - 1) * s.perPage, pageNow * s.perPage).map((d: any): any => devices.find((x: any): any => x.id === d.id));
    return {
      ux: this.uxVals(),
      // V3 exports
      cacheRing,
      fScope,
      endpointsLabel,
      liveTotal,
      strip3: strip3.map((x: any): any => ({
        c: '#20262e',
        ...x
      })),
      platComp,
      liveRing,
      liveAct,
      actFilters,
      actAll: s.actAll,
      toggleActAll: (): any => this.setState((x: any): any => ({
        actAll: !x.actAll
      })),
      moreOpen: s.moreOpen,
      toggleMore: (): any => this.setState((x: any): any => ({
        moreOpen: !x.moreOpen
      })),
      moreChev: s.moreOpen ? '⌄' : '›',
      ringParts4,
      dexRing,
      wOn,
      widgetList,
      presets,
      preset: s.preset,
      customize: s.customize,
      openCustomize: (): any => this.setState({
        customize: true
      }),
      closeCustomize: (): any => this.setState({
        customize: false
      }),
      setupOpen: s.setupOpen && setupCount < 6,
      setupItems,
      setupCount,
      dismissSetup: (): any => this.setState({
        setupOpen: false
      }),
      devTabs3,
      chips,
      hasChips,
      clearAll,
      saveView: this.modal({
        title: 'Save Current View',
        body: 'Saved views appear in the view switcher and in the command palette.',
        fields: [{
          label: 'View name',
          placeholder: 'e.g. Delhi critical Windows',
          value: ''
        }],
        confirmLabel: 'Save View',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('View saved');
        }
      }),
      posture,
      devNeeds,
      devHealthy: !devNeeds,
      hb,
      dexBreak,
      perf,
      procs,
      actionGroups,
      actionDrawer: s.actionDrawer,
      openActions: (): any => this.setState({
        actionDrawer: true
      }),
      closeActions: (): any => this.setState({
        actionDrawer: false
      }),
      pTabs3,
      pShow,
      pGap,
      pFail,
      osUp,
      pDevRows,
      patch61: (): any => this.uxVals().reviewReady(),
      vTabs,
      vShow,
      vRing,
      vDist,
      vAffected,
      goRemediation: (): any => this.setState({
        vTab: 'remediation'
      }),
      dexWhy,
      dexWhyOpen: s.dexWhy,
      toggleDexWhy: (): any => this.setState((x: any): any => ({
        dexWhy: !x.dexWhy
      })),
      dexBreak2,
      dexIssues3,
      iShow,
      iChecks,
      iActions,
      insightText: s.insightText,
      setInsightText: (e: any): any => this.setState({
        insightText: e.target.value
      }),
      runInsight: (): any => {
        this.setState({
          insight: 'running'
        });
        clearTimeout(this._i);
        this._i = setTimeout((): any => this.setState({
          insight: 'result'
        }), 1400);
      },
      runRemediation: this.modal({
        title: 'Run remediation on LAPTOP-017?',
        'body': 'Free disk space (temp, caches, old updates), restart chrome.exe, disable 3 startup items. The user is notified.',
        confirmLabel: 'Run Remediation',
        confirm: (): any => {
          this.setState({
            modal: null,
            insight: 'remediating'
          });
          clearTimeout(this._i);
          this._i = setTimeout((): any => {
            this.setState({
              insight: 'verified'
            });
            this.toast('Simulation only: Remediation verified — DEX +11');
          }, 1600);
        }
      }),
      saveTemplate: this.T('Diagnostic template saved'),
      resetInsight: (): any => this.setState({
        insight: 'idle'
      }),
      loTabs,
      LO,
      loType: s.loType,
      setLoType: (e: any): any => this.setState({
        loType: e.target.value
      }),
      hasLoType: !!s.loType,
      clearLoType,
      loEmpty: LO.length === 0,
      cfgTabs,
      profiles,
      cfgRing,
      cfgDrift: s.cfgDrift,
      closeDrift: (): any => this.setState({
        cfgDrift: false
      }),
      remediateDrift: (): any => {
        this.setState({
          cfgDrift: false
        });
        this.toast('Simulation only: Drift remediation queued on 412 devices');
      },
      createProfile: this.T('Configuration profile wizard (preview) opened'),
      rollback: this.confirm('Rollback to v7?', 'Devices receive v7 settings at next check-in. v8 is kept in history.', 'Rollback', 'Rolled back to v7'),
      aTabs,
      aShow,
      users,
      roles,
      sessions,
      mfaScope: s.mfaScope,
      setMfaScope: (e: any): any => this.setState({
        mfaScope: e.target.value
      }),
      mfaGrace: s.mfaGrace,
      setMfaGrace: (e: any): any => this.setState({
        mfaGrace: e.target.value
      }),
      mfaTrusted: s.mfaTrusted,
      setMfaTrusted: (e: any): any => this.setState({
        mfaTrusted: e.target.value
      }),
      mfaSession: s.mfaSession,
      setMfaSession: (e: any): any => this.setState({
        mfaSession: e.target.value
      }),
      saveMfaPolicy: (): any => this.toast('MFA policy saved · ' + s.mfaScope + ' · session ' + s.mfaSession),
      requireMfa: this.confirm('Require MFA for all administrators?', '2 administrators without MFA get a 7-day enrollment grace period, then access is blocked until enrolled.', 'Require MFA', 'MFA required for all administrators'),
      enrollMfa: this.modal({
        title: 'Enroll Passkey (FIDO2)',
        body: 'Touch your security key or use the platform authenticator. Phishing-resistant and recommended for all administrators.',
        confirmLabel: 'Enroll Passkey',
        confirm: (): any => {
          this.setState({
            modal: null,
            mfaEnrolled: [...s.mfaEnrolled, 'Neha Rao']
          });
          this.toast('Demo enrollment only — no real passkey registered');
        }
      }),
      inviteUser: this.modal({
        title: 'Invite Administrator',
        body: 'Invitations expire in 72 hours. MFA enrollment is required on first sign-in.',
        fields: [{
          label: 'Email',
          placeholder: 'name@company.com',
          value: ''
        }, {
          label: 'Role',
          placeholder: 'Viewer',
          value: 'Viewer'
        }],
        confirmLabel: 'Send Invite',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('Invitation sent');
        }
      }),
      iTabs,
      connectors3,
      notif: s.notif,
      toggleNotif: (): any => this.setState((x: any): any => ({
        notif: !x.notif
      })),
      notifs,
      pgShow,
      // V2 exports
      fSite: s.fSite,
      fPlat: s.fPlat,
      fRange: s.fRange,
      setSite: (e: any): any => this.setFilter('fSite', e.target.value),
      setPlat: (e: any): any => this.setFilter('fPlat', e.target.value),
      setRange: (e: any): any => this.setFilter('fRange', e.target.value),
      refresh: (): any => this.refresh(),
      loading: s.loading,
      ready: !s.loading,
      toggleSidebar: (): any => this.setState((x: any): any => ({
        collapsed: !x.collapsed
      })),
      sideW: s.collapsed ? '68px' : '238px',
      labelDisp: s.collapsed ? 'none' : 'block',
      brandDisp: s.collapsed ? 'none' : 'flex',
      kpi4,
      strip,
      compliance,
      exposure,
      reliability,
      ringParts,
      funnel,
      siteEff,
      dexTrend,
      risk,
      osLife,
      waves,
      causes,
      backlog,
      mttp,
      aging,
      drivers,
      dexIssues,
      delivery,
      failedNow,
      pendingNow,
      leaveHover: (): any => this.setState({
        hover: null
      }),
      remediate44: (): any => {
        this.setState({
          page: 'wizard',
          step: 0,
          wContent: 'Patches',
          wTarget: 'Selected Devices',
          sel: ['LAPTOP-002', 'SRV-122', 'LAPTOP-017']
        });
        window.scrollTo(0, 0);
      },
      deployFix92: (): any => {
        this.setState({
          page: 'wizard',
          step: 1,
          wContent: 'Patches',
          wTarget: 'Finance Windows',
          drawer: null
        });
        window.scrollTo(0, 0);
      },
      retryAll: this.modal({
        title: 'Retry ' + failedNow + ' failed devices?',
        'body': 'Failed devices are re-queued with the original deployment options. Offline devices retry when they check in.',
        confirmLabel: 'Retry ' + failedNow,
        confirm: (): any => {
          this.setState({
            modal: null,
            retried: true
          });
          this.toast(failedNow + ' devices re-queued — status updated');
        }
      }),
      retried: s.retried,
      promoteNode: this.modal({
        title: 'Promote JAIPUR-PC-02 as cache node?',
        body: 'JAIPUR-PC-02 becomes the temporary peer cache for Jaipur Branch. Content is re-seeded from central (11 GB).',
        confirmLabel: 'Promote Backup Node',
        confirm: (): any => {
          this.setState({
            modal: null,
            promoted: true,
            drawer: null
          });
          this.toast('Simulation only: JAIPUR-PC-02 promoted — 42 devices now served locally');
        }
      }),
      promoted: s.promoted,
      palette: s.palette,
      palGroups,
      palQ: s.q,
      setPalQ: (e: any): any => this.setState({
        q: e.target.value,
        palIdx: 0
      }),
      palKey: this.palKey(palFlat),
      closePalette: (): any => this.setState({
        palette: false
      }),
      openPalette: (): any => {
        this.setState({
          palette: true,
          palIdx: 0,
          q: ''
        });
        setTimeout((): any => {
          const i: any = document.querySelector('input[data-pal]');
          if (i) i.focus();
        }, 30);
      },
      palEmpty: palFlat.length === 0,
      density: s.density,
      setDensity: (e: any): any => this.setState({
        density: e.target.value
      }),
      rowPad,
      cols: Object.assign(colsMap, {
        list: cols
      }),
      colDisp,
      sortById: (): any => this.setState((x: any): any => ({
        sortKey: 'id',
        sortDir: x.sortKey === 'id' ? -x.sortDir : 1
      })),
      idArrow: s.sortKey === 'id' ? s.sortDir > 0 ? '↑' : '↓' : '',
      colMenu: s.colMenu,
      toggleColMenu: (): any => this.setState((x: any): any => ({
        colMenu: !x.colMenu
      })),
      pageDevs,
      pageNow,
      totalPages,
      perPage: s.perPage,
      setPerPage: (e: any): any => this.setState({
        perPage: +e.target.value,
        tblPage: 1
      }),
      prevPage: (): any => this.setState((x: any): any => ({
        tblPage: Math.max(1, x.tblPage - 1)
      })),
      nextPage: (): any => this.setState((x: any): any => ({
        tblPage: Math.min(totalPages, x.tblPage + 1)
      })),
      exportCsv: this.T('Devices exported as CSV (' + sortedAll.length + ' rows)'),
      bulkScan: this.T('Vulnerability scan queued on ' + s.sel.length + ' devices'),
      bulkRestart: this.confirm('Restart ' + s.sel.length + ' devices?', 'Users receive a 5-minute warning. Servers are excluded unless forced.', 'Restart', 'Restart queued on ' + s.sel.length + ' devices', 'danger'),
      nav,
      pg,
      crumb: s.page === 'device' ? 'Devices / ' + dev.id : CRUMBS[s.page] || '',
      notFirst: s.step > 0,
      q: s.q,
      setQ: (e: any): any => this.setState({
        q: e.target.value,
        showSearch: true
      }),
      searchFocus: (): any => this.setState({
        showSearch: true
      }),
      searchKey: (e: any): any => {
        if (e.key === 'Enter' && results[0]) results[0].go();
      },
      showSearch: s.showSearch,
      results,
      notify: this.T('No new critical alerts'),
      help: this.T('Help center opened'),
      goDevices: this.go('devices'),
      goEnrollment: this.go('enrollment'),
      goDevicesBack: this.go('devices'),
      goSites: this.go('sites'),
      goDex: this.go('dex'),
      goLiveOps: this.go('liveops'),
      goInsight: this.go('insight'),
      openDevice017: this.openDevice('LAPTOP-017'),
      goActivity: this.go('activity'),
      deployPatch: this.startDeploy('Patches'),
      deploySoftware: this.startDeploy('Software'),
      openScan: this.confirm('Start Vulnerability Scan', 'Scan all 24,840 devices with the built-in assessment engine. Results stream in as agents report.', 'Start Scan', 'Vulnerability scan started'),
      kpis: [{
        label: 'Total Devices',
        value: '24,840',
        delta: '+76 this week',
        deltaColor: '#7F6038',
        bg: '#FFF7EB',
        border: '#F0D4AC',
        accent: '#C6A16B',
        go: this.go('devices')
      }, {
        label: 'Online Devices',
        value: '22,610',
        delta: '91.0% online',
        deltaColor: '#19845B',
        bg: '#E9F6EE',
        border: '#BFE3CC',
        accent: '#19845B',
        go: this.go('devices', {
          dStatus: 'Online'
        })
      }, {
        label: 'Patch Compliance',
        value: '94.2%',
        delta: '+1.8% week over week',
        deltaColor: '#19845B',
        bg: '#E9F6EE',
        border: '#BFE3CC',
        accent: '#19845B',
        go: this.go('patches')
      }, {
        label: 'Critical Vulnerabilities',
        value: '312',
        delta: 'Needs review',
        deltaColor: '#B52D35',
        bg: '#FCEBEC',
        border: '#F0BEBE',
        accent: '#D34249',
        go: this.go('vulns', {
          vFilter: 'Critical'
        })
      }, {
        label: 'Failed Deployments',
        value: '21',
        delta: 'Last 24 h',
        deltaColor: '#B52D35',
        bg: '#FCEBEC',
        border: '#F0BEBE',
        accent: '#D34249',
        go: this.go('deployments', {
          depTab: 'Failed'
        })
      }, {
        label: 'DEX Issues',
        value: '138',
        delta: 'Poor experience',
        deltaColor: '#896400',
        bg: '#FDF4E1',
        border: '#EED7A2',
        accent: '#D6A009',
        go: this.go('dex')
      }],
      attention: [{
        count: '312',
        text: 'critical vulnerabilities detected',
        color: DOT.red,
        bg: '#FCEBEC',
        cc: '#B52D35',
        bc: '#D34249',
        action: 'Review',
        go: this.go('vulns', {
          vFilter: 'Critical'
        })
      }, {
        count: '84',
        text: 'devices missing critical patches',
        color: DOT.red,
        bg: '#FCEBEC',
        cc: '#B52D35',
        bc: '#D34249',
        action: 'Review',
        go: this.go('devices', {
          dView: 'Missing Critical Patches'
        })
      }, {
        count: '21',
        text: 'failed deployments',
        color: DOT.red,
        bg: '#FCEBEC',
        cc: '#B52D35',
        bc: '#D34249',
        action: 'Investigate',
        go: this.go('deployments', {
          depTab: 'Failed'
        })
      }, {
        count: '138',
        text: 'devices offline for more than 7 days',
        color: DOT.amber,
        bg: '#FDF4E1',
        cc: '#896400',
        bc: '#D6A009',
        action: 'Investigate',
        go: this.go('devices', {
          dView: 'Offline > 7 Days'
        })
      }, {
        count: '3',
        text: "Aegis Zones with peer-cache warnings",
        color: DOT.amber,
        bg: '#FDF4E1',
        cc: '#896400',
        bc: '#D6A009',
        action: 'Inspect',
        go: this.go('peercache')
      }],
      trend: [['Aug 10', 72], ['Aug 17', 78], ['Aug 24', 81], ['Aug 31', 86], ['Sep 7', 91], ['Now', 94]].map(([l, v]: any, i: any): any => ({
        label: l,
        h: v + '%',
        bg: i === 5 ? '#C6A16B' : '#D7D9DC'
      })),
      platforms: [{
        name: 'Windows',
        count: '14,200',
        pct: '57%'
      }, {
        name: 'macOS',
        count: '5,200',
        pct: '21%'
      }, {
        name: 'Linux',
        count: '3,600',
        pct: '15%'
      }, {
        name: 'Other',
        count: '1,840',
        pct: '7%'
      }],
      recent: [{
        text: 'Windows security deployment reached 86%',
        time: '2 min'
      }, {
        text: 'New device enrolled: LAPTOP-031',
        time: '12 min'
      }, {
        text: 'Critical CVE detected on 124 devices',
        time: '26 min'
      }, {
        text: 'Peer cache node LAP-019 unreachable (Jaipur)',
        time: '38 min'
      }],
      deployments,
      depTabs,
      // devices
      devices,
      views,
      devTabs,
      dq: s.dq,
      setDq: (e: any): any => this.setState({
        dq: e.target.value
      }),
      dOS: s.dOS,
      setOS: (e: any): any => this.setState({
        dOS: e.target.value
      }),
      dStatus: s.dStatus,
      setStatus: (e: any): any => this.setState({
        dStatus: e.target.value
      }),
      dRisk: s.dRisk,
      setRisk: (e: any): any => this.setState({
        dRisk: e.target.value
      }),
      moreFilters: this.modal({
        title: 'Advanced Device Filters',
        body: 'Use advanced filters when the primary OS, connectivity and risk filters are not enough.',
        fields: [{
          label: 'Health',
          placeholder: 'Healthy / Warning / Critical',
          value: ''
        }, {
          label: "Aegis Zone",
          placeholder: 'e.g. Jaipur Branch',
          value: ''
        }, {
          label: 'Patch Status',
          placeholder: 'Compliant / Missing Patches',
          value: ''
        }, {
          label: 'Device Group',
          placeholder: 'e.g. Pilot Ring',
          value: ''
        }],
        confirmLabel: 'Apply Filters',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('Advanced device filters applied');
        }
      }),
      selCount: s.sel.length,
      hasSel: s.sel.length > 0,
      clearSel: (): any => this.setState({
        sel: []
      }),
      bulkGroup: this.T(s.sel.length + ' devices assigned to group'),
      bulkAction: this.T('Action queued on ' + s.sel.length + ' devices'),
      bulkMore: this.T('More actions'),
      devCount: devices.length,
      showDevTable: s.dTab === 'all',
      showGroupsTab: s.dTab === 'groups',
      showRequestsTab: s.dTab === 'requests',
      // device detail
      dev,
      ddTabs,
      dd,
      devStatusP: st(dev.status),
      devHealthP: st(dev.health),
      syncDevice: this.T('Sync completed for ' + dev.id),
      restartDevice: this.confirm('Restart ' + dev.id + '?', 'The restart command is cryptographically signed before dispatch. The user will get a 5-minute warning.', 'Restart', 'Restart command submitted to ' + dev.id),
      lockDevice: this.confirm('Lock ' + dev.id + '?', 'The device screen locks immediately and requires the user password to unlock.', 'Lock Device', 'Lock command submitted', 'danger'),
      runScript: this.modal({
        title: 'Run Script on ' + dev.id,
        body: 'PowerShell runs as SYSTEM. Output is captured in the device activity log.',
        hasCode: true,
        code: 'Get-Service -Name "AegisAgent" | Restart-Service\nGet-HotFix | Sort-Object InstalledOn -Descending | Select -First 5',
        confirmLabel: 'Run Script',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('Script queued on ' + dev.id);
        }
      }),
      startScan: this.T('Vulnerability scan started on ' + dev.id),
      viewLogs: (): any => this.setState({
        ddTab: 'activity'
      }),
      runAction: this.T('Action menu opened'),
      moreActions: this.T('More actions'),
      // patches
      patches,
      pTabs,
      pQuery: s.pQuery,
      setPQuery: (e: any): any => this.setState({
        pQuery: e.target.value
      }),
      pSeverity: s.pSeverity,
      setPSeverity: (e: any): any => this.setState({
        pSeverity: e.target.value
      }),
      pStatus: s.pStatus,
      setPStatus: (e: any): any => this.setState({
        pStatus: e.target.value
      }),
      resetPatchFilters: (): any => this.setState({
        pQuery: '',
        pSeverity: 'All',
        pStatus: 'All'
      }),
      pDevQuery: s.pDevQuery,
      setPDevQuery: (e: any): any => this.setState({
        pDevQuery: e.target.value
      }),
      pDevCompliance: s.pDevCompliance,
      setPDevCompliance: (e: any): any => this.setState({
        pDevCompliance: e.target.value
      }),
      resetPDevFilters: (): any => this.setState({
        pDevQuery: '',
        pDevCompliance: 'All'
      }),
      pselCount: s.psel.length,
      hasPsel: s.psel.length > 0,
      clearPsel: (): any => this.setState({
        psel: []
      }),
      syncCatalog: this.T('Vendor catalog sync started'),
      approveSel: this.T(s.psel.length + ' patches approved'),
      // vulns
      vulns,
      vsum,
      vFilterLabel: s.vFilter === 'All' ? 'All severities' : s.vFilter + ' only',
      // wizard
      steps,
      wp,
      stepIndex: s.step + 1,
      wContentOpts,
      wTargetOpts,
      wSchedOpts,
      wNetOpts,
      wOpts,
      wBandwidth: s.wBandwidth,
      setWBandwidth: (e: any): any => this.setState({
        wBandwidth: e.target.value
      }),
      wStagger: s.wStagger,
      setWStagger: (e: any): any => this.setState({
        wStagger: e.target.value
      }),
      wDate: s.wDate,
      setWDate: (e: any): any => this.setState({
        wDate: e.target.value
      }),
      wTime: s.wTime,
      setWTime: (e: any): any => this.setState({
        wTime: e.target.value
      }),
      impacted,
      review,
      isFirst: s.step === 0,
      isLast: s.step === WSTEPS.length - 1,
      nextLabel: s.step === WSTEPS.length - 1 ? 'Deploy' : 'Continue',
      wizardNext: (): any => {
        if (s.step < WSTEPS.length - 1) this.setState({
          step: s.step + 1
        });else if (+impacted.replace(/,/g, '') > 500) {
          this.setState({
            modal: {
              title: 'Verify your identity',
              body: 'You are about to deploy patches to ' + impacted + ' endpoints. Step-up authentication is required for large fleet deployments.',
              stepUp: true,
              confirmLabel: 'Verify with Passkey',
              confirm: (): any => {
                this.setState({
                  modal: null
                });
                this.completeUxDeployment();
              }
            }
          });
        } else {
          this.completeUxDeployment();
        }
      },
      wizardBack: (): any => this.setState({
        step: Math.max(0, s.step - 1)
      }),
      wizardCancel: this.go('deployments'),
      goDeployments: this.go('deployments'),
      goDeployment: this.go('deployment'),
      goHome: this.go('home'),
      // deployment detail
      fails,
      failDevs,
      failFilterLabel: s.failFilter || 'All failures',
      clearFail: (): any => this.setState({
        failFilter: null
      }),
      retryFailed: this.confirm('Retry 22 failed devices?', 'Failed devices are re-queued with the original deployment options.', 'Retry', '22 devices re-queued'),
      pauseDeploy: this.T('Deployment paused — resume from the Actions menu'),
      cancelDeploy: this.confirm('Cancel deployment?', 'Pending devices are removed from the queue. Completed installs are not rolled back.', 'Cancel Deployment', 'Deployment cancelled', 'danger'),
      // sites / cache
      sites,
      caches,
      refreshSites: this.T("Aegis Zone discovery refresh started"),
      // enrollment
      enrolled: s.enrolled,
      createToken: this.modal({
        title: 'Create Enrollment Token',
        body: 'Tokens are scoped and short-lived; installer delivery is independent of the token.',
        fields: [{
          label: 'Token Name',
          placeholder: 'e.g. Finance laptops — Sep rollout',
          value: 'Finance laptops — Sep rollout'
        }, {
          label: 'Scope',
          placeholder: "Aegis Zone or OU",
          value: 'Mumbai HQ'
        }, {
          label: 'Device Group',
          placeholder: 'Group',
          value: 'Finance Windows'
        }, {
          label: 'Expiry',
          placeholder: 'Hours',
          value: '24 hours'
        }, {
          label: 'Maximum Enrollments',
          placeholder: 'Count',
          value: '500'
        }],
        confirmLabel: 'Generate Token',
        confirm: (): any => {
          this.setState({
            modal: null,
            enrolled: true
          });
          this.toast('Enrollment token generated');
        }
      }),
      copyToken: this.T('Token copied'),
      // software
      apps,
      swTabs: [['apps', 'Applications'], ['packages', 'Packages'], ['deployments', 'Deployments'], ['history', 'History']].map(([id, l]: any): any => ({
        id,
        label: l,
        set: (): any => this.setState({
          swTab: id
        }),
        c: s.swTab === id ? '#20262E' : '#69717D',
        w: s.swTab === id ? '600' : '400',
        bb: s.swTab === id ? '#C6A16B' : 'transparent'
      })),
      showApps: s.swTab === 'apps',
      showPackages: s.swTab === 'packages',
      showSwDeployments: s.swTab === 'deployments',
      showSwHistory: s.swTab === 'history',
      addApp: this.modal({
        title: 'Add Application',
        body: 'Add a vendor-managed application from the catalog or point to a custom installer.',
        fields: [{
          label: 'Application name',
          placeholder: 'e.g. Zoom',
          value: ''
        }, {
          label: 'Source',
          placeholder: 'Vendor catalog / custom URL',
          value: 'Vendor catalog'
        }],
        confirmLabel: 'Add',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('Application added to catalog');
        }
      }),
      uploadPkg: this.modal({
        title: 'Upload Package',
        body: 'MSI, EXE, PKG or DEB. Packages are hashed and signed on upload.',
        fields: [{
          label: 'Package name',
          placeholder: 'Package name',
          value: ''
        }, {
          label: 'Installer path',
          placeholder: 'C:\\packages\\app.msi',
          value: ''
        }],
        confirmLabel: 'Upload',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('Package uploaded to staging');
        }
      }),
      // dex
      dexRows,
      // activity
      audit: [['10:42', 'Sumit Kumar', 'Deployment created', 'DEP-1042 · 842 devices', 'Console', 'Success'], ['10:38', 'API · ServiceNow', 'Device queried', 'LAPTOP-002', 'API', 'Success'], ['10:31', 'Priya Singh', 'Patch approved', 'Chrome 145.0.1', 'Console', 'Success'], ['10:12', 'API · Automation', 'Deployment status read', 'DEP-1039', 'API', 'Success'], ['09:58', 'Sumit Kumar', 'Restart device', 'SRV-122', 'Console', 'Failed'], ['09:40', 'System', 'Peer cache re-election', 'Jaipur Branch', 'Agent', 'Success']].map(([time, who, action, target, source, result]: any): any => ({
        time,
        who,
        action,
        target,
        source,
        result,
        rP: st(result),
        bar: bar(result)
      })).filter((a: any): any => (!s.auditQuery || (a.who + a.action + a.target).toLowerCase().includes(s.auditQuery.toLowerCase())) && (s.auditSource === 'All' || a.source === s.auditSource) && (s.auditResult === 'All' || a.result === s.auditResult)),
      auditQuery: s.auditQuery,
      setAuditQuery: (e: any): any => this.setState({
        auditQuery: e.target.value
      }),
      auditSource: s.auditSource,
      setAuditSource: (e: any): any => this.setState({
        auditSource: e.target.value
      }),
      auditResult: s.auditResult,
      setAuditResult: (e: any): any => this.setState({
        auditResult: e.target.value
      }),
      resetAuditFilters: (): any => this.setState({
        auditQuery: '',
        auditSource: 'All',
        auditResult: 'All'
      }),
      exportAudit: this.T('Audit export prepared (CSV, signed)'),
      // api
      tokens,
      apiTabs: [['tokens', 'API Tokens'], ['oauth', 'OAuth Clients'], ['webhooks', 'Webhooks'], ['explorer', 'API Explorer']].map(([id, l]: any): any => ({
        id,
        label: l,
        set: (): any => this.setState({
          apiTab: id
        }),
        c: s.apiTab === id ? '#20262E' : '#69717D',
        w: s.apiTab === id ? '600' : '400',
        bb: s.apiTab === id ? '#C6A16B' : 'transparent'
      })),
      showTokens: s.apiTab === 'tokens',
      showOAuth: s.apiTab === 'oauth',
      showWebhooks: s.apiTab === 'webhooks',
      showExplorer: s.apiTab === 'explorer',
      apiMethod: s.apiMethod,
      setApiMethod: (e: any): any => this.setState({
        apiMethod: e.target.value
      }),
      apiPath: s.apiPath,
      setApiPath: (e: any): any => this.setState({
        apiPath: e.target.value
      }),
      createOAuthClient: this.modal({
        title: 'Create OAuth Client',
        body: 'Client credentials are scoped by RBAC and intended for service-to-service access.',
        fields: [{
          label: 'Client name',
          placeholder: 'e.g. Automation service',
          value: ''
        }, {
          label: 'Scopes',
          placeholder: 'devices:read deployment:write',
          value: 'devices:read'
        }],
        confirmLabel: 'Create Client',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('OAuth client created');
        }
      }),
      testApi: (): any => this.toast(s.apiMethod + ' ' + s.apiPath + ' → 200 OK'),
      createApiToken: this.modal({
        title: 'Create API Token',
        body: 'Scoped static token. For service-to-service use, prefer an OAuth2 client.',
        fields: [{
          label: 'Name',
          placeholder: 'e.g. Splunk forwarder',
          value: 'Splunk forwarder'
        }, {
          label: 'Scopes',
          placeholder: 'devices:read, patch:read',
          value: 'devices:read, vulnerability:read'
        }, {
          label: 'Expires in',
          placeholder: '90 days',
          value: '90 days'
        }],
        confirmLabel: 'Create Token',
        confirm: (): any => this.setState({
          modal: {
            title: 'Token created',
            body: 'Store this token in your secrets manager.',
            hasToken: true,
            token: 'ao_live_7f3K9qL2mX8vN4pR1sT6wY0zB5cD3eF8gH2jK4mN7',
            cancel: 'Done',
            hasConfirm: false
          }
        })
      }),
      // integrations
      connectors: [['ServiceNow', 'Connected', 'Incidents created for critical CVEs'], ['Splunk', 'Connected', 'Audit stream · 1.2k events/h'], ['Microsoft Teams', 'Not Configured', 'Deployment alerts'], ['Slack', 'Not Configured', 'Deployment alerts']].map(([n, st_, d]: any): any => ({
        name: n,
        status: st_,
        desc: d,
        stP: st(st_),
        configure: this.T(n + ' connector settings opened'),
        test: this.T(n + ': connection test ' + (st_ === 'Connected' ? 'passed' : 'failed — not configured'))
      })),
      addWebhook: this.modal({
        title: 'Add Custom Webhook',
        body: 'POST JSON events to your endpoint. Payloads are signed with HMAC-SHA256.',
        fields: [{
          label: 'Endpoint URL',
          placeholder: 'https://',
          value: ''
        }, {
          label: 'Events',
          placeholder: 'deployment.completed, device.enrolled',
          value: 'deployment.completed'
        }],
        confirmLabel: 'Save Webhook',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('Webhook saved');
        }
      }),
      // licensing
      uploadLicense: this.T('License file upload dialog opened'),
      viewLicense: this.T('License details opened'),
      // diagnostics
      health,
      runHealth: this.T('Health check completed — 1 warning'),
      genBundle: this.confirm('Generate Diagnostic Bundle?', 'The bundle contains redacted logs and configuration, prepared for Aegis One support. Nothing leaves the environment until you upload it.', 'Generate', 'Signed diagnostic bundle generated'),
      // groups / admin / reports
      createGroup: this.modal({
        title: 'Create Device Group',
        body: 'Dynamic groups update as devices match the rule.',
        fields: [{
          label: 'Group name',
          placeholder: 'e.g. Finance Windows',
          value: ''
        }, {
          label: 'Rule',
          placeholder: 'OS = Windows AND Department = Finance',
          value: ''
        }],
        confirmLabel: 'Create',
        confirm: (): any => {
          this.setState({
            modal: null
          });
          this.toast('Device group created');
        }
      }),
      manageRoles: this.T('Role editor opened'),
      exportReport: this.T('Report exported as CSV'),
      // overlays
      drawerOpen: !!s.drawer,
      drawer: s.drawer ? {
        ...s.drawer,
        hasPath: !!s.drawer.path,
        path: (s.drawer.path || []).map(([l, n]: any, i: any, arr: any): any => ({
          l,
          n,
          w: Math.round(n / arr[0][1] * 100) + '%',
          c: ['#D34249', '#D6A009', '#69717D', '#19845B'][i]
        })),
        hasProgress: !!s.drawer.hasProgress,
        hasChecks: !!s.drawer.checks,
        checks: s.drawer.checks || [],
        hasNote: !!s.drawer.note,
        pills: s.drawer.pills || [],
        kv: (s.drawer.kv || []).map((r: any): any => ({
          c: '#20262e',
          ...r
        })),
        actions: s.drawer.actions || []
      } : {},
      closeDrawer: (): any => this.setState({
        drawer: null
      }),
      modalOpen: !!s.modal,
      modal: s.modal ? {
        ...s.modal,
        hasStepUp: !!s.modal.stepUp,
        fields: (s.modal.fields || []).map((f: any): any => ({
          ...f,
          font: 'inherit'
        })),
        hasCode: !!s.modal.hasCode,
        hasToken: !!s.modal.hasToken,
        cancel: s.modal.cancel || 'Cancel',
        hasConfirm: s.modal.hasConfirm !== false,
        confirmBg: s.modal.danger ? '#D34249' : '#C6A16B',
        confirmBorder: s.modal.danger ? '#D34249' : '#C6A16B',
        confirmC: s.modal.danger ? '#fff' : '#181B1F'
      } : {},
      closeModal: (): any => this.setState({
        modal: null
      }),
      stop: (e: any): any => e.stopPropagation(),
      toastOpen: !!s.toast,
      toastMsg: s.toast || ''
    };
  }
}