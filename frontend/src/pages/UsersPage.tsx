import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../app/auth';
import { ErrorBanner } from '../components/ErrorBanner';
import { Drawer, fmtDate, PageHeader } from '../components/ui';
import { api } from '../services/api';
import type { MenuKey, Role, UserWithMenus } from '../types/api';

// User management (Architecture.md §8, §14.3). No delete; deactivate instead.

export const GRANTABLE: { key: MenuKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'analyze', label: 'New analysis' },
  { key: 'runs', label: 'Runs' },
  { key: 'review', label: 'Review queue' },
  { key: 'knowledge', label: 'Knowledge base' },
  { key: 'settings', label: 'Engines & models' },
];

interface FormState {
  id?: string;
  username: string;
  password: string;
  role: Role;
  active: boolean;
  menus: MenuKey[];
}

const EMPTY: FormState = { username: '', password: '', role: 'Tester', active: true, menus: ['overview', 'analyze', 'runs'] };

export function UsersPage() {
  const { me } = useAuth();
  const [users, setUsers] = useState<UserWithMenus[]>();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<unknown>();
  const [formError, setFormError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.users().then((r) => setUsers(r.users), setError), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setFormError(undefined);
    try {
      if (form.id) {
        await api.updateUser(form.id, {
          role: form.role,
          active: form.active,
          ...(form.password ? { password: form.password } : {}),
          ...(form.role === 'Tester' ? { menus: form.menus } : {}),
        });
      } else {
        await api.createUser({ username: form.username, password: form.password, role: form.role, ...(form.role === 'Tester' ? { menus: form.menus } : {}) });
      }
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: UserWithMenus) {
    try {
      await api.updateUser(u.id, { active: !u.active });
      await load();
    } catch (err) {
      setError(err);
    }
  }

  const self = (u: UserWithMenus) => u.id === me?.user.id;

  return (
    <div className="page">
      <PageHeader
        title="Users"
        subtitle="Add users and choose their menus. Deactivating a user blocks their login."
        actions={
          <button type="button" className="primary" onClick={() => setForm({ ...EMPTY })} data-testid="add-user">
            ＋ Add user
          </button>
        }
      />
      {error !== undefined && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table" data-testid="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Menus</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className={u.active ? undefined : 'muted'}>
                  <td>
                    <strong>{u.username}</strong> {self(u) && <span className="badge tone-neutral">you</span>}
                  </td>
                  <td>{u.role === 'Admin' ? 'Admin' : 'User'}</td>
                  <td>
                    <span className={`badge ${u.active ? 'tone-ok' : 'tone-neutral'}`}>{u.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="small">{u.role === 'Admin' ? 'All' : u.menus.join(', ') || '—'}</td>
                  <td className="muted small nowrap">{fmtDate(u.createdAt)}</td>
                  <td className="row end nowrap">
                    <button type="button" className="ghost small" onClick={() => setForm({ id: u.id, username: u.username, password: '', role: u.role, active: u.active, menus: u.menus })}>
                      Edit
                    </button>
                    {!self(u) && (
                      <button type="button" className="ghost small" onClick={() => toggleActive(u)} data-testid={`toggle-${u.username}`}>
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Drawer title={form?.id ? `Edit ${form.username}` : 'Add user'} open={form !== null} onClose={() => setForm(null)}>
        {form && (
          <form className="stack" onSubmit={save}>
            <label className="field">
              <span>Username</span>
              <input value={form.username} disabled={Boolean(form.id)} pattern="[A-Za-z0-9._\-]{3,50}" required onChange={(e) => setForm({ ...form, username: e.target.value })} name="username" />
            </label>
            <label className="field">
              <span>{form.id ? 'New password (leave empty to keep)' : 'Password'}</span>
              <input type="password" minLength={8} required={!form.id} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} name="password" autoComplete="new-password" />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={form.role} disabled={form.id === me?.user.id} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} name="role">
                <option value="Tester">User</option>
                <option value="Admin">Admin</option>
              </select>
            </label>
            {form.id && form.id !== me?.user.id && (
              <label className="switch">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <span>Active</span>
              </label>
            )}
            <fieldset className="field">
              <legend>Menu access</legend>
              {form.role === 'Admin' ? (
                <p className="muted small">Admins always have every menu.</p>
              ) : (
                <div className="check-grid">
                  {GRANTABLE.map((m) => (
                    <label key={m.key} className="check">
                      <input
                        type="checkbox"
                        name={`menu-${m.key}`}
                        checked={form.menus.includes(m.key)}
                        onChange={(e) => setForm({ ...form, menus: e.target.checked ? [...form.menus, m.key] : form.menus.filter((k) => k !== m.key) })}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            {formError !== undefined && <ErrorBanner error={formError} />}
            <div className="row end">
              <button type="button" className="ghost" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy} data-testid="save-user">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
