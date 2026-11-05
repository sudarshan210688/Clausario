import type { PackManifest } from '../types/api';

interface Props {
  manifest: PackManifest;
}

export function PackManifestView({ manifest }: Props) {
  const pct = manifest.budget > 0 ? Math.min(100, (manifest.totalTokens / manifest.budget) * 100) : 0;
  return (
    <details className="disclosure pack">
      <summary>
        <span>Context pack</span>
        <span className="pack-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="muted small">
          {manifest.totalTokens.toLocaleString()} / {manifest.budget.toLocaleString()} tokens ·{' '}
          {manifest.included.length} included · {manifest.dropped.length} dropped
        </span>
      </summary>
      <div className="pack-grid">
        <div>
          <h4>Included</h4>
          <ul className="plain ref-list">
            {manifest.included.map((item) => (
              <li key={item.id}>
                <code>{item.id}</code> <span className="muted">{item.tokens.toLocaleString()} tok</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Dropped</h4>
          {manifest.dropped.length === 0 ? (
            <p className="muted small">Nothing dropped.</p>
          ) : (
            <ul className="plain ref-list">
              {manifest.dropped.map((item) => (
                <li key={item.id}>
                  <code>{item.id}</code> <span className="muted">{item.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
