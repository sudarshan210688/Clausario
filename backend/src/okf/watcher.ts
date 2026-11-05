import { existsSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

// Watches KNOWLEDGE_DIR so edits made outside a scrape job (hand edits, folder renamed / deleted / restored)
// reach the in-memory snapshot without a restart. The parent folder is watched too, because a watcher on
// `dir` itself cannot see `dir` being created or renamed back.

/** Calls `onChange` once per burst of changes (debounced). Returns a function that stops watching. */
export function watchKnowledge(dir: string, onChange: () => void, debounceMs = 500): () => void {
  let timer: NodeJS.Timeout | undefined;
  let inner: FSWatcher | undefined;
  let reattach = false;

  const attach = () => {
    inner?.close();
    inner = undefined;
    if (!existsSync(dir)) return;
    try {
      inner = watch(dir, { recursive: true }, schedule);
      inner.on('error', () => {
        inner?.close();
        inner = undefined;
      });
    } catch (err) {
      console.warn(`Cannot watch ${dir}: ${(err as Error).message}`);
    }
  };

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (reattach || !inner) attach();
      reattach = false;
      onChange();
    }, debounceMs);
  }

  const parent = watch(path.dirname(dir), (_event, name) => {
    if (name !== null && name.toString() !== path.basename(dir)) return;
    reattach = true;
    schedule();
  });
  attach();

  return () => {
    clearTimeout(timer);
    inner?.close();
    parent.close();
  };
}
