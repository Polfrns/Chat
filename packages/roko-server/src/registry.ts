import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Filestore, Identity } from './types';

interface Row {
  id: string;
  name: string;
  description: string;
  kind: string;
  ref: string;
  read_only: number;
  shared: number;
  owner: string;
  tenant: string;
  created_at: string;
  updated_at: string;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS filestores (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL,
    ref         TEXT NOT NULL,
    read_only   INTEGER NOT NULL DEFAULT 0,
    shared      INTEGER NOT NULL DEFAULT 0,
    owner       TEXT NOT NULL,
    tenant      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_filestores_tenant_owner ON filestores (tenant, owner);
  CREATE INDEX IF NOT EXISTS idx_filestores_tenant_shared ON filestores (tenant, shared);
`;

const toRecord = (row: Row): Filestore => ({
  id: row.id,
  displayName: row.name,
  description: row.description,
  kind: row.kind === 'graph' ? 'graph' : 'local',
  ref: row.ref,
  readOnly: row.read_only === 1,
  shared: row.shared === 1,
  owner: row.owner,
  tenant: row.tenant,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** SQLite-backed registry of filestore metadata. Access filtering lives in
 *  `access.ts` and is applied by the service; the registry only persists and
 *  retrieves (with the one tenant/owner-scoped list query). */
export class RokoRegistry {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  insert(store: Filestore): Filestore {
    this.db
      .prepare(
        `INSERT INTO filestores
           (id, name, description, kind, ref, read_only, shared, owner, tenant, created_at, updated_at)
         VALUES
           (@id, @name, @description, @kind, @ref, @read_only, @shared, @owner, @tenant, @created_at, @updated_at)`,
      )
      .run({
        id: store.id,
        name: store.displayName,
        description: store.description,
        kind: store.kind,
        ref: store.ref,
        read_only: store.readOnly ? 1 : 0,
        shared: store.shared ? 1 : 0,
        owner: store.owner,
        tenant: store.tenant,
        created_at: store.createdAt,
        updated_at: store.updatedAt,
      });
    return store;
  }

  get(id: string): Filestore | null {
    const row = this.db.prepare('SELECT * FROM filestores WHERE id = ?').get(id) as Row | undefined;
    return row ? toRecord(row) : null;
  }

  listAccessible(who: Identity): Filestore[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM filestores
           WHERE tenant = ? AND (shared = 1 OR owner = ?)
           ORDER BY updated_at DESC`,
      )
      .all(who.tenant, who.subject) as Row[];
    return rows.map(toRecord);
  }

  update(store: Filestore): Filestore {
    this.db
      .prepare(
        `UPDATE filestores
           SET name = @name, description = @description, read_only = @read_only, updated_at = @updated_at
           WHERE id = @id`,
      )
      .run({
        id: store.id,
        name: store.displayName,
        description: store.description,
        read_only: store.readOnly ? 1 : 0,
        updated_at: store.updatedAt,
      });
    return store;
  }

  remove(id: string): boolean {
    return this.db.prepare('DELETE FROM filestores WHERE id = ?').run(id).changes > 0;
  }
}
