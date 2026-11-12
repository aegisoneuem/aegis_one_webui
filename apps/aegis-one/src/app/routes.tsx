import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation, type RouteObject } from 'react-router-dom';
import { TableSkeleton } from '@aegis/ui';
import { AppShell } from '../layout/AppShell';
import { useAuth } from './auth';
import type { PageId } from './nav';

/**
 * Every page is its own chunk, so the initial download is the shell and the
 * route the user actually opened — not all nineteen pages.
 */
const Overview = lazy(() => import('../pages/Overview'));
const Devices = lazy(() => import('../pages/Devices'));
const DeviceDetail = lazy(() => import('../pages/DeviceDetail'));
const DeviceGroups = lazy(() => import('../pages/DeviceGroups'));
const Enrollment = lazy(() => import('../pages/Enrollment'));
const Patches = lazy(() => import('../pages/Patches'));
const Software = lazy(() => import('../pages/Software'));
const LiveActivity = lazy(() => import('../pages/LiveActivity'));
const Deployments = lazy(() => import('../pages/Deployments'));
const DeploymentWizard = lazy(() => import('../pages/DeploymentWizard'));
const DeploymentDetail = lazy(() => import('../pages/DeploymentDetail'));
const DeploymentCreated = lazy(() =>
  import('../pages/DeploymentDetail').then((m) => ({ default: m.DeploymentCreated })),
);
const Vulnerabilities = lazy(() => import('../pages/Vulnerabilities'));
const Configuration = lazy(() => import('../pages/Configuration'));
const Dex = lazy(() => import('../pages/Dex'));
const Insight = lazy(() => import('../pages/Insight'));
const Zones = lazy(() => import('../pages/Zones'));
const PeerCache = lazy(() => import('../pages/PeerCache'));
const Reports = lazy(() => import('../pages/Reports'));
const CustomReportBuilder = lazy(() => import('../pages/CustomReportBuilder'));
const ReportViewer = lazy(() => import('../pages/ReportViewer'));
const Integrations = lazy(() => import('../pages/Integrations'));
const Administration = lazy(() => import('../pages/Administration'));
const Licensing = lazy(() => import('../pages/Licensing'));
const Diagnostics = lazy(() => import('../pages/Diagnostics'));
const SignIn = lazy(() => import('../pages/SignIn'));
const AuthCallback = lazy(() =>
  import('../pages/SignIn').then((m) => ({ default: m.AuthCallback })),
);

/** Breadcrumb metadata, read by AppShell through the route handle. */
export interface RouteHandle {
  pageId: PageId;
  crumbs?: string[];
  /** Permission the route needs; the server enforces the same one. */
  permission?: string;
}

function load(Component: ComponentType): ReactNode {
  return (
    <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
      <Component />
    </Suspense>
  );
}

/**
 * Sends anyone without a session to sign-in, remembering where they were
 * going. The route guard is for navigation only — every request is
 * independently authorised by the server.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <TableSkeleton rows={8} columns={5} />;
  if (status === 'signed-out') {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?from=${encodeURIComponent(from)}`} replace />;
  }
  return <>{children}</>;
}

interface PageRoute {
  path: string | undefined;
  index?: boolean;
  component: ComponentType;
  handle: RouteHandle;
}

const PAGES: PageRoute[] = [
  {
    path: undefined,
    index: true,
    component: Overview,
    handle: { pageId: 'home', permission: 'overview:read' },
  },
  {
    path: 'devices',
    component: Devices,
    handle: { pageId: 'devices', permission: 'devices:read' },
  },
  {
    path: 'groups',
    component: DeviceGroups,
    handle: { pageId: 'groups', permission: 'groups:read' },
  },
  {
    path: 'enrollment',
    component: Enrollment,
    handle: { pageId: 'enrollment', permission: 'enrollment:read' },
  },
  {
    path: 'patches',
    component: Patches,
    handle: { pageId: 'patches', permission: 'patches:read' },
  },
  {
    path: 'software',
    component: Software,
    handle: { pageId: 'software', permission: 'software:read' },
  },
  {
    path: 'liveops',
    component: LiveActivity,
    handle: { pageId: 'liveops', permission: 'liveops:read' },
  },
  {
    path: 'deployments',
    component: Deployments,
    handle: { pageId: 'deployments', permission: 'deployments:read' },
  },
  {
    path: 'vulns',
    component: Vulnerabilities,
    handle: { pageId: 'vulns', permission: 'vulns:read' },
  },
  {
    path: 'profiles',
    component: Configuration,
    handle: { pageId: 'profiles', permission: 'config:read' },
  },
  { path: 'dex', component: Dex, handle: { pageId: 'dex', permission: 'dex:read' } },
  {
    path: 'insight',
    component: Insight,
    handle: { pageId: 'insight', permission: 'insight:run' },
  },
  { path: 'sites', component: Zones, handle: { pageId: 'sites', permission: 'zones:read' } },
  {
    path: 'peercache',
    component: PeerCache,
    handle: { pageId: 'peercache', permission: 'peercache:read' },
  },
  {
    path: 'reports',
    component: Reports,
    handle: { pageId: 'reports', permission: 'reports:read' },
  },
  {
    path: 'integrations',
    component: Integrations,
    handle: { pageId: 'integrations', permission: 'integrations:read' },
  },
  {
    path: 'admin',
    component: Administration,
    handle: { pageId: 'admin', permission: 'admin:users' },
  },
  {
    path: 'licensing',
    component: Licensing,
    handle: { pageId: 'licensing', permission: 'licensing:read' },
  },
  {
    path: 'diagnostics',
    component: Diagnostics,
    handle: { pageId: 'diagnostics', permission: 'diagnostics:read' },
  },
];

const SUB_ROUTES: PageRoute[] = [
  {
    path: 'devices/:deviceId',
    component: DeviceDetail,
    handle: { pageId: 'devices', crumbs: ['Device'] },
  },
  {
    path: 'devices/:deviceId/:tab',
    component: DeviceDetail,
    handle: { pageId: 'devices', crumbs: ['Device'] },
  },
  {
    // One route for every step, with the step optional. Separate routes per
    // step would unmount the wizard on each Continue and lose what the user
    // had filled in.
    path: 'deployments/new/:step?',
    component: DeploymentWizard,
    handle: { pageId: 'deployments', crumbs: ['New action'], permission: 'deployments:create' },
  },
  {
    path: 'deployments/created/:deploymentId',
    component: DeploymentCreated,
    handle: { pageId: 'deployments', crumbs: ['Action created'] },
  },
  {
    path: 'deployments/:deploymentId',
    component: DeploymentDetail,
    handle: { pageId: 'deployments', crumbs: ['Action details'] },
  },
  {
    path: 'reports/custom',
    component: CustomReportBuilder,
    handle: { pageId: 'reports', crumbs: ['Custom report'], permission: 'reports:build' },
  },
  {
    path: 'reports/:reportId',
    component: ReportViewer,
    handle: { pageId: 'reports', crumbs: ['Report'], permission: 'reports:read' },
  },
];

const toRoute = (route: PageRoute): RouteObject => ({
  ...(route.index ? { index: true } : { path: route.path }),
  element: load(route.component),
  handle: route.handle,
});

export const router = createBrowserRouter([
  // Sign-in sits outside the shell: there is no navigation to show until
  // there is a session.
  { path: '/sign-in', element: load(SignIn) },
  { path: '/auth/callback', element: load(AuthCallback) },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [...PAGES.map(toRoute), ...SUB_ROUTES.map(toRoute)],
  },
]);
