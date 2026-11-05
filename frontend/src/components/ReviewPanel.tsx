import { useState } from 'react';
import { api } from '../services/api';
import type { RegId, RunDetail } from '../types/api';
import { ErrorBanner } from './ErrorBanner';
import { regLabel } from './ui';

// Human-in-the-loop review (Architecture.md §11.5): approve, override, add context and re-score, or reject.

const REGS: RegId[] = ['gdpr', 'eu-ai-act'];

export function ReviewPanel({ detail, maxRounds, onDone }: { detail: RunDetail; maxRounds: number; onDone: () => void }) {
  const state = detail.state!;
  const selected = state.selection?.selected ?? [];
  const [regs, setRegs] = useState<RegId[]>(state.regulations);
  const [articles, setArticles] = useState<string[]>(state.articleIds);
  const [extra, setExtra] = useState<{ id: string; title: string }[]>([]);
  const [addId, setAddId] = useState('');
  const [context, setContext] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const rounds = state.contextRounds.length;
  const canAddContext = rounds < maxRounds;

  const rows = [...selected.map((a) => ({ id: a.id, title: a.title, p: a.p as number | null })), ...extra.map((a) => ({ ...a, p: null }))];

  async function act(body: Parameters<typeof api.review>[1]) {
    setBusy(true);
    setError(undefined);
    try {
      await api.review(detail.run.id, body);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function addArticle() {
    const id = addId.trim();
    const m = id.match(/^(gdpr|eu-ai-act):art-0*(\d+[a-z]?)$/);
    if (!m) {
      setError(new Error('Use an article id like gdpr:art-005 or eu-ai-act:art-004a'));
      return;
    }
    try {
      const art = await api.article(m[1] as RegId, m[2]);
      if (!rows.some((r) => r.id === id)) setExtra((x) => [...x, { id, title: art.frontmatter.title }]);
      setArticles((a) => (a.includes(id) ? a : [...a, id]));
      setRegs((r) => (r.includes(m[1] as RegId) ? r : [...r, m[1] as RegId]));
      setAddId('');
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="review-panel" data-testid="review-panel">
      <div className="review-grid">
        <section className="sub-panel">
          <h3>Regulations</h3>
          <div className="row">
            {REGS.map((r) => (
              <label key={r} className="check">
                <input type="checkbox" checked={regs.includes(r)} onChange={(e) => setRegs((x) => (e.target.checked ? [...x, r] : x.filter((y) => y !== r)))} />
                {regLabel(r)}
              </label>
            ))}
          </div>
          <h3>Articles</h3>
          <ul className="check-list">
            {rows.length === 0 && <li className="muted">No articles selected.</li>}
            {rows.map((a) => (
              <li key={a.id}>
                <label className="check">
                  <input type="checkbox" checked={articles.includes(a.id)} onChange={(e) => setArticles((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))} />
                  <span>
                    {a.title} <code className="muted small">{a.id}</code>
                  </span>
                  {a.p !== null && <span className="muted small">p {a.p.toFixed(2)}</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="add-row">
            <input placeholder="Add article, e.g. gdpr:art-005" value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Add article id" />
            <button type="button" className="small" onClick={addArticle}>
              ＋ Add
            </button>
          </div>
          <button
            type="button"
            className="primary"
            disabled={busy || articles.length === 0 || regs.length === 0}
            data-testid="review-override"
            onClick={() => act({ action: 'override', regulations: regs, articleIds: articles, ...(note ? { note } : {}) })}
          >
            Override & generate
          </button>
        </section>

        <section className="sub-panel">
          <h3>
            Add context & re-score{' '}
            <span className="muted small">
              Round {Math.min(rounds + 1, maxRounds)} of {maxRounds}
            </span>
          </h3>
          <textarea rows={4} value={context} disabled={!canAddContext} onChange={(e) => setContext(e.target.value)} placeholder="Which personal data, which users, what the system does…" aria-label="Additional context" />
          {!canAddContext && <p className="note warn">Add-context limit reached. Approve, override or reject.</p>}
          <button type="button" disabled={busy || !canAddContext || !context.trim()} onClick={() => act({ action: 'context', context: context.trim() })} data-testid="review-context">
            Add context & re-score
          </button>

          <h3>Decision</h3>
          <input placeholder="Optional note for the log" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Review note" />
          <div className="row">
            <button type="button" className="primary" disabled={busy} onClick={() => act({ action: 'approve', ...(note ? { note } : {}) })} data-testid="review-approve">
              Approve
            </button>
            <button type="button" className="danger" disabled={busy} onClick={() => act({ action: 'reject', ...(note ? { note } : {}) })} data-testid="review-reject">
              Reject
            </button>
          </div>
        </section>
      </div>
      {error !== undefined && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}
    </div>
  );
}
