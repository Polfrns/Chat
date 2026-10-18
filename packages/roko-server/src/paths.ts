import path from 'node:path';
import type { Filestore } from './types';

type Located = Pick<Filestore, 'id' | 'owner' | 'shared' | 'tenant'>;

/**
 * The on-disk location of a local filestore is DERIVED, never user-supplied —
 * the single source of truth for where a store's bytes live:
 *
 *   shared  → <tenant>/shared/<id>
 *   private → <tenant>/<owner>/<id>
 *
 * Stored on the record as a path RELATIVE to the configured filestore root, so
 * relocating the root moves every store consistently.
 */
export function relativeRef(store: Located): string {
  const scope = store.shared ? 'shared' : store.owner;
  return path.posix.join(store.tenant, scope, store.id);
}

export function absoluteRoot(filestoreRoot: string, ref: string): string {
  return path.join(filestoreRoot, ref);
}
