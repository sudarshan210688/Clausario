import { useCallback, useEffect, useState } from 'react';
import { ErrorBanner } from '../components/ErrorBanner';
import { fmtDate, PageHeader } from '../components/ui';
import { api } from '../services/api';
import type { AccessRow, MenuKey } from '../types/api';
import { GRANTABLE } from './UsersPage';

// Menu access matrix (Architecture.md §8.3): users × menus, saved per row. Admin rows are locked to all menus.

export function AccessPage() {
  const [rows, setRows] = useState<AccessRow[]>();
  const [draft, setDraft] = useState<Record<string, MenuKey[]>>({});
  const [saving, setSaving] = useState<string>();
  const [error, setError] = useState<unknown>();

  const load = useCallback(() => api.access().then((r) => setRows(r.access), setError), []);
  useEffect(() => {
    void load();
  }, [load]);

  const menusOf = (r: AccessRow) => draft[r.userId] ?? r.menus;
  const dirty = (r: AccessRow) => draft[r.userId] !== undefined && [...draft[r.userId]].sort().join() !== [...r.menus].sort().join();

  async function save(r: AccessRow) {
    setSaving(r.userId);
    try {
      await api.setAccess(r.userId, menusOf(r));
      setDraft(({ [r.userId]: _omit, ...rest }) => rest);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <div className="page">
      <PageHeader title="Menu access" subtitle="Grant menus per user. Changes apply on the user's next request. Users without a record get MENU_DEFAULT_TESTER." />
      {error !== undefined && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table matrix" data-testid="access-table">
            <thead>
              <tr>
                <th>User</th>
                {GRANTABLE.map((m) => (
                  <th key={m.key} className="center">
                    {m.label}
                  </th>
                ))}
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.userId} className={r.active ? undefined : 'muted'}>
                  <td>
                    <strong>{r.username}</strong> <span className="muted small">{r.role === 'Admin' ? 'Admin' : 'User'}</span>
                  </td>
                  {GRANTABLE.map((m) => (
                    <td key={m.key} className="center">
                      <input
                        type="checkbox"
                        aria-label={`${r.username}: ${m.label}`}
                        checked={menusOf(r).includes(m.key)}
                        disabled={r.role === 'Admin'}
                        onChange={(e) => {
                          const current = menusOf(r);
                          setDraft({ ...draft, [r.userId]: e.target.checked ? [...current, m.key] : current.filter((k) => k !== m.key) });
                        }}
                      />
                    </td>
                  ))}
                  <td className="muted small nowrap">{r.updatedAt ? `${fmtDate(r.updatedAt)} · ${r.updatedBy}` : r.role === 'Admin' ? 'all menus' : 'default'}</td>
                  <td>
                    {r.role !== 'Admin' && (
                      <button type="button" className="small primary" disabled={!dirty(r) || saving === r.userId} onClick={() => save(r)}>
                        {saving === r.userId ? 'Saving…' : 'Save'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
