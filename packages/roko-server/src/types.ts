/** Backend a filestore is reached through. Local now; Graph (SharePoint /
 *  OneDrive) later — both behind the same FileStore port. */
export type FilestoreKind = 'local' | 'graph';

/** Authenticated caller, projected from the bearer token. Roko knows nothing
 *  about chat sessions — only who (`subject`) within which `tenant`. */
export interface Identity {
  subject: string;
  tenant: string;
}

/** A filestore registry record — metadata only. The bytes live on the backend
 *  (local fs / Graph drive), never in this registry. */
export interface Filestore {
  id: string;
  displayName: string;
  description: string;
  kind: FilestoreKind;
  /** Backend locator: a root path relative to the filestore root (local), or a
   *  drive reference (graph). Never user-supplied — derived at creation. */
  ref: string;
  readOnly: boolean;
  /** true ⇒ visible to every subject in the tenant; false ⇒ owner-only. */
  shared: boolean;
  /** Creating subject; the sole manager (edit/delete) of the store. */
  owner: string;
  tenant: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFilestoreInput {
  displayName: string;
  description?: string;
  shared?: boolean;
  readOnly?: boolean;
}

/** `shared` and `kind` are immutable after creation — they fix the storage
 *  location, so only descriptive fields and the write-gate are editable. */
export type UpdateFilestoreInput = Partial<Pick<Filestore, 'displayName' | 'description' | 'readOnly'>>;

/** One entry in a filestore listing — files and (possibly empty) directories. */
export interface FileEntry {
  path: string;
  bytes: number;
  mtimeMs: number;
  type: 'file' | 'dir';
}

/** A literal-substring search hit. */
export interface SearchHit {
  path: string;
  line: number;
  snippet: string;
}
