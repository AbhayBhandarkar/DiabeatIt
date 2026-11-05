import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Role, State } from '../shared/domain';

export interface Database { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; close(): Promise<void> }
export async function openDatabase(memory = false, dataDir = process.env.PGLITE_DATA_DIR || '.data/diabeatit'): Promise<Database> {
  let db: Database;
  if (process.env.DATABASE_URL && !memory) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = { query: async <T>(sql: string, params?: unknown[]) => { const r = await pool.query(sql, params); return { rows: r.rows as T[] }; }, close: () => pool.end() };
  } else {
    if (!memory) {
      await mkdir(dataDir, { recursive: true });
      // OneDrive may mark directories read-only on Windows. Emscripten interprets
      // those bits as Unix write denial even when Windows permits ordinary writes.
      // Only our generated database directory is affected; no ACLs are changed.
      if (process.platform === 'win32') {
        const run = promisify(execFile);
        await run('attrib.exe', ['-R', path.resolve(dataDir)]);
        await run('attrib.exe', ['-R', path.join(path.resolve(dataDir), '*'), '/S', '/D']);
      }
    }
    const p = new PGlite(memory ? undefined : dataDir);
    await p.waitReady;
    db = { query: <T>(sql: string, params?: unknown[]) => p.query<T>(sql, params), close: () => p.close() };
  }
  if (process.env.NODE_ENV !== 'production') {
  await db.query(`CREATE TABLE IF NOT EXISTS demo_sessions (
    token_hash TEXT PRIMARY KEY, state JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    role TEXT NOT NULL DEFAULT 'patient', expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS demo_sessions_expiry ON demo_sessions(expires_at)');
  await db.query('DELETE FROM demo_sessions WHERE expires_at < NOW()');
  }
  return db;
}
export type SessionRow = { state: State; version: number; role: Role };