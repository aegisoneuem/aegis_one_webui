import { useEffect, useMemo } from 'react';
import { Outlet, useMatches, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CaretLineLeft,
  CaretLineRight,
  House,
  SignOut,
  User,
} from '@phosphor-icons/react';
import {
  Breadcrumb,
  Button,
  Menu,
  NavGroup,
  NavItem,
  Sidebar,
  type BreadcrumbItem,
} from '@aegis/ui';
import markUrl from '../assets/brand/aegis-mark.png';
import { NAV_GROUPS, PAGE_BY_ID, PAGE_PERMISSIONS } from '../app/nav';
import { useAuth } from '../app/auth';
import type { RouteHandle } from '../app/routes';
import { useUiStore } from '../app/uiStore';
import styles from './AppShell.module.css';

function isRouteHandle(h: unknown): h is RouteHandle {
  return typeof h === 'object' && h !== null && 'pageId' in h;
}

export function AppShell(): JSX.Element {
  const navigate = useNavigate();
  const matches = useMatches();
  const { collapsed, expanded, toggleCollapsed, toggleGroup, expandGroup } = useUiStore();
  const { user, can, signOut } = useAuth();

  const handle = useMemo(() => {
    const last = [...matches].reverse().find((m) => isRouteHandle(m.handle));
    return last && isRouteHandle(last.handle) ? last.handle : undefined;
  }, [matches]);

  const activeId = handle?.pageId ?? 'home';
  const activePage = PAGE_BY_ID[activeId];
  const activeGroup = NAV_GROUPS.find((g) => g.pages.some((p) => p.id === activeId));

  // Navigating into a collapsed group (deep link, Back) opens it.
  useEffect(() => {
    if (activeGroup) expandGroup(activeGroup.id);
  }, [activeGroup, expandGroup]);

  // Alt+Left walks browser history, same as the Back button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const crumbs: BreadcrumbItem[] = [{ label: 'Overview', onSelect: () => navigate('/') }];
  if (activeId !== 'home') {
    const sub = handle?.crumbs ?? [];
    crumbs.push({
      label: activePage.label,
      onSelect: sub.length ? () => navigate(activePage.path) : undefined,
    });
    sub.forEach((label) => crumbs.push({ label }));
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        collapsed={collapsed}
        header={
          <button
            type="button"
            className={styles.brand}
            onClick={() => navigate('/')}
            aria-label="AEGIS ONE overview"
          >
            <img className={styles.mark} src={markUrl} alt="" width={26} height={20} />
            {collapsed ? null : (
              <span className={styles.wordmark}>
                AEGIS <span className={styles.wordmarkSub}>ONE</span>
              </span>
            )}
          </button>
        }
        footer={
          <button
            type="button"
            className={styles.collapse}
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <CaretLineRight size={16} /> : <CaretLineLeft size={16} />}
            {collapsed ? null : <span>Collapse</span>}
          </button>
        }
      >
        {NAV_GROUPS.map((group) => {
          const pages = group.pages.filter((p) => {
            const permission = PAGE_PERMISSIONS[p.id];
            return !permission || can(permission);
          });
          if (pages.length === 0) return null;
          return (
            <NavGroup
              key={group.id}
              label={group.label}
              expanded={expanded[group.id] ?? true}
              onToggle={() => toggleGroup(group.id)}
            >
              {pages.map((p) => (
                <NavItem
                  key={p.id}
                  href={p.path}
                  icon={<p.icon size={18} weight={activeId === p.id ? 'fill' : 'regular'} />}
                  label={p.label}
                  tag={p.tag}
                  active={activeId === p.id}
                  onNavigate={() => navigate(p.path)}
                />
              ))}
            </NavGroup>
          );
        })}
      </Sidebar>
      <div className={styles.main}>
        <Breadcrumb
          items={crumbs}
          onBack={() => navigate(-1)}
          onHome={() => navigate('/')}
          backIcon={<ArrowLeft size={14} />}
          homeIcon={<House size={14} />}
          trailing={
            user ? (
              <Menu
                label="Account"
                items={[
                  { separator: true, label: `${user.name} — ${user.role}` },
                  {
                    id: 'sign-out',
                    label: 'Sign out',
                    icon: <SignOut size={15} />,
                    onSelect: () => void signOut(),
                  },
                ]}
              >
                {(trigger) => (
                  <Button size="sm" variant="ghost" icon={<User size={15} />} {...trigger}>
                    {user.name}
                  </Button>
                )}
              </Menu>
            ) : null
          }
        />
        <main className={styles.content} id="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
