import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '../layout/AppShell';
import { ALL_PAGES, type PageId } from './nav';

const Skeleton = lazy(() => import('../pages/RouteSkeleton'));

/** Route-level code splitting: every page is its own chunk once Phase 4 replaces the skeleton. */
function page(id: PageId, crumbs?: string[]): JSX.Element {
  const Page: ComponentType<{ id: PageId; crumbs?: string[] }> = Skeleton;
  return (
    <Suspense fallback={null}>
      <Page id={id} crumbs={crumbs} />
    </Suspense>
  );
}

/** Breadcrumb metadata for sub-routes; consumed by AppShell via route handle. */
export interface RouteHandle {
  pageId: PageId;
  crumbs?: string[];
}

const pageRoutes: RouteObject[] = ALL_PAGES.map((p) => ({
  path: p.path === '/' ? undefined : p.path.slice(1),
  index: p.path === '/',
  element: page(p.id),
  handle: { pageId: p.id } satisfies RouteHandle,
}));

const subRoutes: RouteObject[] = [
  {
    path: 'devices/:deviceId',
    element: page('devices', ['Device']),
    handle: { pageId: 'devices', crumbs: ['Device'] } satisfies RouteHandle,
  },
  {
    path: 'devices/:deviceId/:tab',
    element: page('devices', ['Device']),
    handle: { pageId: 'devices', crumbs: ['Device'] } satisfies RouteHandle,
  },
  {
    path: 'deployments/new',
    element: page('deployments', ['New deployment']),
    handle: { pageId: 'deployments', crumbs: ['New deployment'] } satisfies RouteHandle,
  },
  {
    path: 'deployments/new/:step',
    element: page('deployments', ['New deployment']),
    handle: { pageId: 'deployments', crumbs: ['New deployment'] } satisfies RouteHandle,
  },
  {
    path: 'deployments/created/:deploymentId',
    element: page('deployments', ['Deployment created']),
    handle: { pageId: 'deployments', crumbs: ['Deployment created'] } satisfies RouteHandle,
  },
  {
    path: 'deployments/:deploymentId',
    element: page('deployments', ['Deployment details']),
    handle: { pageId: 'deployments', crumbs: ['Deployment details'] } satisfies RouteHandle,
  },
  {
    path: 'admin/api-access',
    element: page('admin', ['API access']),
    handle: { pageId: 'admin', crumbs: ['API access'] } satisfies RouteHandle,
  },
  {
    path: 'reports/custom',
    element: page('reports', ['Custom report builder']),
    handle: { pageId: 'reports', crumbs: ['Custom report builder'] } satisfies RouteHandle,
  },
];

export const router = createBrowserRouter([
  { path: '/', element: <AppShell />, children: [...pageRoutes, ...subRoutes] },
]);
