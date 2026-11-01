import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = Database.Database;

export interface OpenDbOptions {
  /** File path, or ':memory:' for a throwaway database. */
  file: string;
  /** Deletes an existing file first, so a reseed cannot inherit stale rows. */
  fresh?: boolean;
}

/**
 * Opens the SQLite database the mock server reads from.
 *
 * WAL plus a relaxed synchronous mode: this is fixture data that is rebuilt
 * from a seed whenever it is lost, so durability is worth nothing and the
 * write throughput matters while inserting 50,000 devices.
 */
export function openDb({ file, fresh = false }: OpenDbOptions): Db {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
    if (fresh && existsSync(file)) {
      rmSync(file, { force: true });
      for (const suffix of ['-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true });
    }
  }

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = OFF');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Wraps inserts in a single transaction. Inserting 50,000 rows one commit at a
 * time takes minutes; in one transaction it takes a second.
 */
export function bulkInsert<T>(db: Db, sql: string, rows: readonly T[], toParams: (row: T) => unknown[]): void {
  const statement = db.prepare(sql);
  const run = db.transaction((items: readonly T[]) => {
    for (const item of items) statement.run(...toParams(item));
  });
  run(rows);
}
