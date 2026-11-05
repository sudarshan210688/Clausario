import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AboutPanel } from '../components/AboutPanel';
import { BRAND, BrandMark, LEGAL } from '../components/Brand';
import { api } from '../services/api';
import type { MenuItem } from '../types/api';
import { useAuth } from './auth';
import { ICONS } from './icons';

// App shell (Architecture.md §14.2): top bar with caption, grouped sidebar that collapses to an icon rail
// (remembered per browser) and becomes an off-canvas drawer below 1024 px.

const GROUPS: MenuItem['group'][] = ['Workspace', 'Governance', 'Knowledge', 'Administration'];
const COLLAPSE_KEY = 'clausario.nav.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function useBackendStatus(): 'up' | 'down' | 'checking' {
  const [status, setStatus] = useState<'up' | 'down' | 'checking'>('checking');
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      api
        .health()
        .then(() => !cancelled && setStatus('up'))
        .catch(() => !cancelled && setStatus('down'));
    void check();
    const timer = window.setInterval(check, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return status;
}

/** Waiting-for-review count for the sidebar badge (reviewers only), refreshed every 30 s. */
function useReviewCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  const location = useLocation();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      api
        .reviewQueue()
        .then((q) => !cancelled && setCount(q.runs.length))
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, location.pathname]);
  return count;
}

export function Shell() {
  const { me, config, has, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useBackendStatus();
  const reviewCount = useReviewCount(has('review'));
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
    setUserMenu(false);
  }, [location.pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      // Storage unavailable: the choice lasts for this page view only.
    }
  }

  if (!me) return null;
  const menus = me.menus;
  const initials = me.user.username.slice(0, 2).toUpperCase();
  const routeEngine = config?.engines.stages.route;

  return (
    <div className={`app ${collapsed ? 'nav-collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      <header className="topbar">
        <button
          type="button"
          className="icon-btn nav-toggle"
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          data-testid="nav-toggle"
          onClick={() => setDrawerOpen((o) => !o)}
        >
          {ICONS.menu}
        </button>
        <NavLink className="topbar-brand" to="/" aria-label={`${BRAND.name} home`}>
          <BrandMark size={32} />
          <span className="topbar-brand-text">
            <span className="brand-name">{BRAND.name}</span>
            <span className="brand-caption">{BRAND.caption}</span>
          </span>
        </NavLink>
        <div className="topbar-right">
          {routeEngine && (
            <span className="chip engine-chip" title="Default classification engine (ROUTE_ENGINE)">
              Engine · {routeEngine === 'jev' ? 'Jev' : 'Decisions'}
            </span>
          )}
          <span className={`status status-${status}`} title={status === 'up' ? 'Backend connected' : status === 'down' ? 'Backend offline' : 'Connecting…'}>
            <span className="status-dot" aria-hidden="true" />
            <span className="status-text">{status === 'up' ? 'Online' : status === 'down' ? 'Offline' : '…'}</span>
          </span>
          <div className="user-menu">
            <button type="button" className="avatar-btn" aria-haspopup="menu" aria-expanded={userMenu} onClick={() => setUserMenu((o) => !o)} data-testid="user-menu">
              <span className="avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="user-name">{me.user.username}</span>
            </button>
            {userMenu && (
              <div className="menu-pop" role="menu">
                <div className="menu-pop-head">
                  <strong>{me.user.username}</strong>
                  <span className="muted small">{me.user.role === 'Admin' ? 'Admin' : 'User'}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="open-about"
                  onClick={() => {
                    setUserMenu(false);
                    setAboutOpen(true);
                  }}
                >
                  {ICONS.info} About {BRAND.name}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  {ICONS.logout} Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <aside className="sidenav" aria-label="Main navigation" data-testid="sidenav">
        <nav>
          {GROUPS.map((group) => {
            const items = menus.filter((m) => m.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="nav-group">
                <span className="nav-group-label">{group}</span>
                {items.map((item) => (
                  <NavLink key={item.key} to={item.path} end={item.path === '/'} className="nav-link" title={item.label} data-testid={`nav-${item.key}`}>
                    {ICONS[item.icon] ?? ICONS.list}
                    <span className="nav-link-label">{item.label}</span>
                    {item.key === 'review' && reviewCount > 0 && <span className="nav-badge">{reviewCount}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <button type="button" className="collapse-btn" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-testid="collapse-nav">
          <span className={collapsed ? 'flip' : undefined}>{ICONS.chevronLeft}</span>
          <span className="nav-link-label">Collapse</span>
        </button>
      </aside>

      <main className="main">
        <Outlet />
        <footer className="foot">
          {LEGAL.footer} ·{' '}
          <button type="button" className="link-btn" onClick={() => setAboutOpen(true)}>
            About
          </button>
        </footer>
      </main>
      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
