import { inspectCollection } from '../src/qdrant/client.js';
import { scriptContext } from './env.js';

/** Read-only report on the configured collections. Creates and changes nothing. */
const { env, client } = scriptContext();

for (const name of [env.QDRANT_USERS_COLLECTION, env.QDRANT_CHECKPOINTS_COLLECTION, env.QDRANT_MENU_COLLECTION]) {
  const s = await inspectCollection(client, name);
  console.log(s.exists ? `${name}: exists, ${s.pointCount} points, vectors: ${s.vectorMode}` : `${name}: does not exist yet`);
}
