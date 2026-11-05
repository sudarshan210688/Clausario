import type {
  AccessRow,
  ArticleResponse,
  ConfigResponse,
  DashboardResponse,
  ErrorResponse,
  EvaluateRequest,
  EvaluateResponse,
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
  IndexResponse,
  JobResponse,
  LogResponse,
  MeResponse,
  MenuItem,
  MenuKey,
  ProvidersResponse,
  RegId,
  ReviewRequest,
  Role,
  RouteResponse,
  RunDetail,
  RunRecord,
  RunsPage,
  RunStatus,
  ScrapeAccepted,
  ScrapeRequest,
  SelectResponse,
  StartRunRequest,
  UserWithMenus,
} from '../types/api';

// Same-origin by default: the Vite dev server proxies /api to the backend (vite.config.ts). Set VITE_API_BASE_URL
// only to call the backend directly (CORS with credentials, CLIENT_ORIGIN in backend/.env).
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** Non-2xx response (or network failure, status 0) carrying the backend `{ error, issues?, raw? }` body. */
export class ApiError extends Error {
  readonly status: number;
  readonly issues?: unknown[];
  readonly raw?: unknown;

  constructor(status: number, body: ErrorResponse) {
    super(body.error);
    this.name = 'ApiError';
    this.status = status;
    this.issues = body.issues;
    this.raw = body.raw;
  }
}

/** Fired on any 401 so the app can return to the login page. */
export const UNAUTHORIZED_EVENT = 'clausario:unauthorized';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { error: `Cannot reach the backend${BASE_URL ? ` at ${BASE_URL}` : ''}` });
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const err = data as Partial<ErrorResponse> | undefined;
    throw new ApiError(res.status, {
      error: typeof err?.error === 'string' ? err.error : `HTTP ${res.status} ${res.statusText}`,
      issues: err?.issues,
      raw: err?.raw,
    });
  }
  return data as T;
}

const post = <T>(path: string, body: unknown) => request<T>('POST', path, body);
const get = <T>(path: string) => request<T>('GET', path);
const qs = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const api = {
  health: () => get<HealthResponse>('/api/health'),

  // Auth and admin (§8)
  login: (username: string, password: string) => post<{ user: MeResponse['user'] }>('/api/auth/login', { username, password }),
  logout: () => post<void>('/api/auth/logout', {}),
  me: () => get<MeResponse>('/api/auth/me'),
  config: () => get<ConfigResponse>('/api/config'),
  users: () => get<{ users: UserWithMenus[] }>('/api/users'),
  createUser: (body: { username: string; password: string; role: Role; menus?: MenuKey[] }) => post<{ user: UserWithMenus }>('/api/users', body),
  updateUser: (id: string, body: { password?: string; role?: Role; active?: boolean; menus?: MenuKey[] }) =>
    request<{ user: UserWithMenus }>('PATCH', `/api/users/${id}`, body),
  menus: () => get<{ menus: MenuItem[] }>('/api/menus'),
  access: () => get<{ access: AccessRow[] }>('/api/access'),
  setAccess: (userId: string, menus: MenuKey[]) => request<{ access: AccessRow }>('PUT', `/api/access/${userId}`, { menus }),

  // Runs and review (§13)
  dashboard: () => get<DashboardResponse>('/api/dashboard'),
  startRun: (body: StartRunRequest) => post<{ runId: string; run: RunRecord }>('/api/runs', body),
  runs: (params: { status?: RunStatus; page?: number; pageSize?: number } = {}) => get<RunsPage>(`/api/runs${qs(params)}`),
  run: (id: string) => get<RunDetail>(`/api/runs/${id}`),
  retryRun: (id: string) => post<{ runId: string }>(`/api/runs/${id}/retry`, {}),
  reviewQueue: () => get<{ runs: RunRecord[] }>('/api/review/queue'),
  review: (id: string, body: ReviewRequest) => post<{ runId: string }>(`/api/runs/${id}/review`, body),

  // Knowledge base
  scrape: (reg: RegId, body: ScrapeRequest) => post<ScrapeAccepted>(`/api/okf/scrape/${reg}`, body),
  job: (id: string) => get<JobResponse>(`/api/okf/jobs/${encodeURIComponent(id)}`),
  index: (reg: RegId) => get<IndexResponse>(`/api/okf/${reg}/index`),
  article: (reg: RegId, num: string) => get<ArticleResponse>(`/api/okf/${reg}/articles/${encodeURIComponent(num)}`),
  log: (params: { reg?: RegId; limit?: number } = {}) => get<LogResponse>(`/api/okf/log${qs(params)}`),

  // Stateless analysis endpoints (Postman / playground)
  route: (story: string) => post<RouteResponse>('/api/analyze/route', { story }),
  select: (story: string, regulations: RegId[]) => post<SelectResponse>('/api/analyze/select', { story, regulations }),
  providers: () => get<ProvidersResponse>('/api/llm/providers'),
  generate: (body: GenerateRequest) => post<GenerateResponse>('/api/scenarios/generate', body),
  evaluate: (body: EvaluateRequest) => post<EvaluateResponse>('/api/scenarios/evaluate', body),
};
