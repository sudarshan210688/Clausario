import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './app/auth';
import { NotFound, RequireAuth, RequireMenu } from './app/guards';
import { Shell } from './app/Shell';
import { AccessPage } from './pages/AccessPage';
import { AnalyzePage } from './pages/AnalyzePage';
import { KnowledgePage } from './pages/KnowledgePage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { RunDetailPage } from './pages/RunDetailPage';
import { RunsPage } from './pages/RunsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';

// Routes mirror the menu catalogue (Architecture.md §8.3, §14.2). Guards are UX only; the server enforces access.

/** "/" is Overview; users without it land on their first menu. */
function Home() {
  const { me, has } = useAuth();
  if (has('overview')) return <OverviewPage />;
  const first = me?.menus[0];
  return first ? <Navigate to={first.path} replace /> : <NotFound />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Shell />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="analyze" element={<RequireMenu keys={['analyze']}><AnalyzePage /></RequireMenu>} />
            <Route path="runs" element={<RequireMenu keys={['runs']}><RunsPage /></RequireMenu>} />
            <Route path="runs/:id" element={<RequireMenu keys={['runs', 'review']}><RunDetailPage /></RequireMenu>} />
            <Route path="review" element={<RequireMenu keys={['review']}><ReviewQueuePage /></RequireMenu>} />
            <Route path="knowledge" element={<RequireMenu keys={['knowledge']}><KnowledgePage /></RequireMenu>} />
            <Route path="settings" element={<RequireMenu keys={['settings']}><SettingsPage /></RequireMenu>} />
            <Route path="admin/users" element={<RequireMenu keys={['users']}><UsersPage /></RequireMenu>} />
            <Route path="admin/access" element={<RequireMenu keys={['access']}><AccessPage /></RequireMenu>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
