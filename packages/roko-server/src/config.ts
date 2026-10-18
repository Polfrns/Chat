import path from 'node:path';

/** Resolved runtime configuration, loaded once at boot and injected downstream
 *  (no module-level globals). */
export interface Config {
  port: number;
  /** Shared secret the bearer JWT is signed/verified with. TEMPORARY: stands in
   *  for the future auth broker; swapping issuance/validation later won't change
   *  the "bearer with sub+tenant" shape. */
  jwtSecret: string;
  /** Absolute root under which every local filestore's bytes live. */
  filestoreRoot: string;
  /** Absolute path to the SQLite registry file. */
  dbPath: string;
}

const DEFAULT_PORT = 3100;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[roko] missing required env var: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  const dataDir = path.resolve(process.env.ROKO_DATA_DIR ?? path.join(process.cwd(), 'data'));
  return {
    port: Number(process.env.ROKO_PORT ?? DEFAULT_PORT),
    jwtSecret: required('ROKO_SHARED_SECRET'),
    filestoreRoot: path.resolve(process.env.ROKO_FILESTORE_ROOT ?? path.join(dataDir, 'filestores')),
    dbPath: path.resolve(process.env.ROKO_DB_PATH ?? path.join(dataDir, 'roko.sqlite')),
  };
}
