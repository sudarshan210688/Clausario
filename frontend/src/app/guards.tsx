import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { MenuKey } from '../types/api';
import { useAuth } from './auth';

/** Signed-in users only; others go to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Shows No access unless the user has any of `keys`. The server enforces the same rule. */
export function RequireMenu({ keys, children }: { keys: MenuKey[]; children: ReactNode }) {
  const { has } = useAuth();
  return keys.some(has) ? <>{children}</> : <NoAccess />;
}

export function NoAccess() {
  const { me } = useAuth();
  const first = me?.menus[0];
  return (
    <div className="center-card">
      <div className="panel narrow-panel" data-testid="no-access">
        <h1>No access</h1>
        <p className="muted">Your account doesn't have this menu. Ask an Admin to grant it in Menu access.</p>
        {first && (
          <Link className="button primary" to={first.path}>
            Go to {first.label}
          </Link>
        )}
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="center-card">
      <div className="panel narrow-panel">
        <h1>Page not found</h1>
        <Link className="button" to="/">
          Back to Clausario
        </Link>
      </div>
    </div>
  );
}
