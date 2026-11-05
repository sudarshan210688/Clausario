import { ApiError } from '../services/api';

interface Props {
  error: unknown;
  onDismiss?: () => void;
}

const STATUS_LABEL: Record<number, string> = {
  0: 'Network error',
  400: 'Invalid request',
  401: 'Not signed in',
  403: 'No access',
  404: 'Not found',
  409: 'Conflict',
  500: 'Server error',
  502: 'Upstream model / engine error',
};

/** Zod issue → `path: message`; anything else → JSON. */
function formatIssue(issue: unknown): string {
  if (issue && typeof issue === 'object' && 'message' in issue) {
    const { path, message } = issue as { path?: unknown[]; message: unknown };
    const where = Array.isArray(path) && path.length > 0 ? `${path.join('.')}: ` : '';
    return `${where}${String(message)}`;
  }
  return JSON.stringify(issue);
}

export function ErrorBanner({ error, onDismiss }: Props) {
  const apiError = error instanceof ApiError ? error : undefined;
  const label = apiError ? (STATUS_LABEL[apiError.status] ?? `HTTP ${apiError.status}`) : 'Error';
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="error-banner" role="alert">
      <div className="error-head">
        <strong>
          {label}
          {apiError && apiError.status > 0 ? ` (${apiError.status})` : ''}
        </strong>
        {onDismiss && (
          <button type="button" className="link" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
      <p>{message}</p>
      {apiError?.issues && apiError.issues.length > 0 && (
        <ul>
          {apiError.issues.map((issue, i) => (
            <li key={i}>{formatIssue(issue)}</li>
          ))}
        </ul>
      )}
      {apiError?.raw !== undefined && (
        <details>
          <summary>Raw upstream output</summary>
          <pre>{typeof apiError.raw === 'string' ? apiError.raw : JSON.stringify(apiError.raw, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
