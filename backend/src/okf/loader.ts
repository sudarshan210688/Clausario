import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { REGULATIONS, type RegId } from '../config/chapterMap.js';
import { env } from '../config/env.js';
import { OkfFrontmatter } from '../schemas/okf.schema.js';
import { buildGraph, type Graph } from './graph.js';
import { globalId, relPath, type DocFolder } from './ids.js';
import { parseDoc } from './writer.js';

// Loads both bundles from KNOWLEDGE_DIR into memory (Architecture.md §5–§7.3). No caching beyond one snapshot.

export interface LoadedDoc {
  /** Global id, e.g. `gdpr:art-017`. */
  id: string;
  reg: RegId;
  /** Relative to KNOWLEDGE_DIR, e.g. `gdpr/articles/art-017.md`. */
  path: string;
  frontmatter: OkfFrontmatter;
  body: string;
}

const FOLDER_TYPE: Record<DocFolder, OkfFrontmatter['type']> = {
  chapters: 'Chapter',
  articles: 'Article',
  recitals: 'Recital',
  annexes: 'Annex',
};

/** Every doc of every bundle by global id, Zod-validated by `type`. Invalid file → throws naming the path; missing bundle → no docs. */
export async function loadKnowledge(dir: string): Promise<Map<string, LoadedDoc>> {
  const docs = new Map<string, LoadedDoc>();
  for (const reg of Object.keys(REGULATIONS) as RegId[]) {
    for (const folder of Object.keys(FOLDER_TYPE) as DocFolder[]) {
      let names: string[];
      try {
        names = (await readdir(path.join(dir, reg, folder))).filter((name) => name.endsWith('.md')).sort();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
      const loaded = await Promise.all(
        names.map(async (name): Promise<LoadedDoc> => {
          const fileId = name.slice(0, -'.md'.length);
          const rel = relPath(reg, folder, fileId);
          let parsed: ReturnType<typeof parseDoc>;
          try {
            parsed = parseDoc(await readFile(path.join(dir, rel), 'utf8'));
          } catch (err) {
            throw new Error(`${rel}: ${(err as Error).message}`);
          }
          const { frontmatter, body } = parsed;
          const result = OkfFrontmatter.safeParse(frontmatter);
          if (!result.success) throw new Error(`${rel}: ${result.error.message}`);
          if (result.data.type !== FOLDER_TYPE[folder]) {
            throw new Error(`${rel}: type ${result.data.type} does not belong in ${folder}/`);
          }
          return { id: globalId(reg, fileId), reg, path: rel, frontmatter: result.data, body };
        }),
      );
      for (const doc of loaded) docs.set(doc.id, doc);
    }
  }
  return docs;
}

let current: Graph | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** The loaded knowledge snapshot; `refreshKnowledge()` must have run (server start). */
export function getKnowledge(): Graph {
  if (!current) throw new Error('Knowledge not loaded');
  return current;
}

/**
 * Reloads KNOWLEDGE_DIR and rebuilds the graph. Refreshes run one at a time, so the last one to finish
 * saw every commit before it. On error the previous snapshot stays.
 */
export function refreshKnowledge(): Promise<Graph> {
  const next = queue.then(async () => {
    const graph = buildGraph(await loadKnowledge(env.KNOWLEDGE_DIR));
    current = graph;
    console.log(`Knowledge loaded: ${graph.docs.size} docs, ${graph.edges.size} articles, ${graph.warnings.length} warnings`);
    for (const warning of graph.warnings) console.warn(`  warning: ${warning}`);
    return graph;
  });
  queue = next.catch(() => undefined);
  return next;
}
