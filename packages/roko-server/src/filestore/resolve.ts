import { FileStore } from './port';
import { LocalFileStore } from './local';
import { absoluteRoot } from '../paths';
import type { Filestore } from '../types';

/**
 * Map a registry record to a live FileStore adapter. The one place backend kind
 * is dispatched; everything above sees only the port. Unknown or not-yet-
 * implemented kinds fail loudly rather than silently degrading.
 */
export function resolveFileStore(store: Filestore, filestoreRoot: string): FileStore {
  if (store.kind === 'local') {
    return new LocalFileStore(absoluteRoot(filestoreRoot, store.ref), store.readOnly);
  }
  throw new Error(`Filestore kind '${store.kind}' is not supported yet (store ${store.id})`);
}
