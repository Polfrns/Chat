import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { RokoRegistry } from './registry';
import { resolveFileStore } from './filestore/resolve';
import { isAccessible, canManage } from './access';
import { relativeRef, absoluteRoot } from './paths';
import { AccessError, NotFoundError, ValidationError } from './errors';
import type { Config } from './config';
import type {
  Filestore,
  Identity,
  FileEntry,
  SearchHit,
  CreateFilestoreInput,
  UpdateFilestoreInput,
} from './types';

const NAME_MAX = 150;
const DESCRIPTION_MAX = 1000;

const clamp = (value: string, max: number): string => value.trim().slice(0, max);

/**
 * The one core both faces (MCP, REST) project from — every authorization and
 * file operation lives here exactly once. It speaks `Identity`, never HTTP or
 * the MCP wire format, and raises typed errors the faces translate.
 */
export class FilestoreService {
  constructor(
    private readonly registry: RokoRegistry,
    private readonly config: Config,
  ) {}

  listAccessible(who: Identity): Filestore[] {
    return this.registry.listAccessible(who);
  }

  async createFilestore(who: Identity, input: CreateFilestoreInput): Promise<Filestore> {
    const displayName = clamp(input.displayName ?? '', NAME_MAX);
    if (!displayName) {
      throw new ValidationError('displayName is required');
    }
    const id = randomUUID();
    const shared = input.shared ?? false;
    const ref = relativeRef({ id, owner: who.subject, shared, tenant: who.tenant });
    const now = new Date().toISOString();
    const store: Filestore = {
      id,
      displayName,
      description: clamp(input.description ?? '', DESCRIPTION_MAX),
      kind: 'local',
      ref,
      readOnly: input.readOnly ?? false,
      shared,
      owner: who.subject,
      tenant: who.tenant,
      createdAt: now,
      updatedAt: now,
    };
    await fs.promises.mkdir(absoluteRoot(this.config.filestoreRoot, ref), { recursive: true });
    return this.registry.insert(store);
  }

  getFilestore(who: Identity, id: string): Filestore {
    return this.requireAccessible(who, id);
  }

  updateFilestore(who: Identity, id: string, patch: UpdateFilestoreInput): Filestore {
    const store = this.requireManageable(who, id);
    const next: Filestore = {
      ...store,
      displayName: patch.displayName !== undefined ? clamp(patch.displayName, NAME_MAX) : store.displayName,
      description:
        patch.description !== undefined ? clamp(patch.description, DESCRIPTION_MAX) : store.description,
      readOnly: patch.readOnly !== undefined ? patch.readOnly : store.readOnly,
      updatedAt: new Date().toISOString(),
    };
    if (!next.displayName) {
      throw new ValidationError('displayName cannot be empty');
    }
    return this.registry.update(next);
  }

  async deleteFilestore(who: Identity, id: string): Promise<{ deleted: boolean }> {
    const store = this.requireManageable(who, id);
    await fs.promises.rm(absoluteRoot(this.config.filestoreRoot, store.ref), {
      recursive: true,
      force: true,
    });
    return { deleted: this.registry.remove(id) };
  }

  listFiles(who: Identity, id: string, subdir?: string): Promise<FileEntry[]> {
    return this.drive(who, id).list(subdir);
  }

  readFile(who: Identity, id: string, filePath: string): Promise<string> {
    return this.drive(who, id).readWhole(filePath);
  }

  writeFile(who: Identity, id: string, filePath: string, content: string): Promise<string> {
    return this.drive(who, id).writeWhole(filePath, content);
  }

  createFolder(who: Identity, id: string, dirPath: string): Promise<string> {
    return this.drive(who, id).mkdir(dirPath);
  }

  moveFile(who: Identity, id: string, src: string, dst: string): Promise<string> {
    return this.drive(who, id).move(src, dst);
  }

  searchFiles(who: Identity, id: string, query: string): Promise<SearchHit[]> {
    return this.drive(who, id).searchLiteral(query);
  }

  private drive(who: Identity, id: string) {
    const store = this.requireAccessible(who, id);
    return resolveFileStore(store, this.config.filestoreRoot);
  }

  private requireAccessible(who: Identity, id: string): Filestore {
    const store = this.registry.get(id);
    if (!store) {
      throw new NotFoundError(`Filestore ${id} not found`);
    }
    if (!isAccessible(store, who)) {
      throw new AccessError(`Filestore ${id} is not accessible`);
    }
    return store;
  }

  private requireManageable(who: Identity, id: string): Filestore {
    const store = this.registry.get(id);
    if (!store) {
      throw new NotFoundError(`Filestore ${id} not found`);
    }
    if (!canManage(store, who)) {
      throw new AccessError(`Filestore ${id} can only be managed by its owner`);
    }
    return store;
  }
}
