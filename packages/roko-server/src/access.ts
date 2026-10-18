import type { Filestore, Identity } from './types';

/**
 * The whole access model, in one place: a store is reachable when it's in the
 * caller's tenant AND (it's shared, or the caller owns it).
 *
 *   accessible = shared(tenant) ∪ private(subject)
 */
export function isAccessible(store: Filestore, who: Identity): boolean {
  return store.tenant === who.tenant && (store.shared || store.owner === who.subject);
}

/** Management (edit / delete) is owner-only — even for shared stores. */
export function canManage(store: Filestore, who: Identity): boolean {
  return store.tenant === who.tenant && store.owner === who.subject;
}
