import { scriptContext } from './env.js';

/** Read-only connection check for a 401 or 403 from Qdrant. Never prints the key. */
const { env } = scriptContext();
const base = env.QDRANT_URL!.replace(/\/+$/, '');
const apiKey = env.QDRANT_API_KEY!;

async function check(label: string, target: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(target, { headers, signal: AbortSignal.timeout(20_000) });
    const body = (await res.text()).slice(0, 120).replace(/\s+/g, ' ');
    console.log(`${label}: ${res.status} ${body}`);
    return res.ok;
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : String(err);
    console.log(`${label}: no response (${cause})`);
    return false;
  }
}

const port = new URL(base).port;
console.log(`Key length ${apiKey.length}, has spaces or quotes: ${/[\s"']/.test(apiKey)}`);
const ok = port
  ? await check(`Port ${port}, with key`, `${base}/collections`, { 'api-key': apiKey })
  : await check('Port 443, with key', `${base}:443/collections`, { 'api-key': apiKey });
process.exitCode = ok ? 0 : 1;
