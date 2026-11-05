import { assertPlatform, env, type Env } from '../src/config/env.js';
import { createQdrantClient } from '../src/qdrant/client.js';

/** Validated env + Qdrant client for CLI scripts; exits with the variable names (never values) on error. */
export function scriptContext(): { env: Env; client: ReturnType<typeof createQdrantClient> } {
  try {
    assertPlatform(env, 'qdrant');
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  return { env, client: createQdrantClient({ url: env.QDRANT_URL!, apiKey: env.QDRANT_API_KEY! }) };
}
