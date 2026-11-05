import { assertPlatform, env } from './config/env.js';
import { createClausarioApp } from './composition.js';
import { refreshKnowledge } from './okf/loader.js';
import { watchKnowledge } from './okf/watcher.js';
import { createQdrantClient } from './qdrant/client.js';

// The server needs Qdrant and auth settings (Architecture.md §6); errors name the variable, never its value.
try {
  assertPlatform(env, 'server');
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// Invalid frontmatter on disk is a startup error naming the file; a missing bundle just loads empty.
try {
  await refreshKnowledge();
} catch (err) {
  console.error(`Failed to load knowledge from ${env.KNOWLEDGE_DIR}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

// Later changes on disk reload the snapshot; an invalid file keeps the previous one.
watchKnowledge(env.KNOWLEDGE_DIR, () => {
  console.log('Knowledge dir changed on disk; reloading');
  refreshKnowledge().catch((err: unknown) => {
    console.warn(`Reload failed, keeping the previous snapshot: ${err instanceof Error ? err.message : String(err)}`);
  });
});

const qdrant = createQdrantClient({ url: env.QDRANT_URL!, apiKey: env.QDRANT_API_KEY! });
const app = await createClausarioApp(env, qdrant);
app.listen(env.PORT, () => {
  console.log(`Clausario backend listening on http://localhost:${env.PORT}`);
});
