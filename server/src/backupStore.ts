import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type Backup = {
  revision: number;
  snapshot: unknown;
  updatedAt: string;
};

export type BackupStore = {
  serverId: string;
  read: () => Backup | null;
  save: (snapshot: unknown, expectedRevision: number) => Backup | null;
  close: () => void;
};

type BackupRow = { revision: number; snapshot: string; updated_at: string };

export function openBackupStore(path: string): BackupStore {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS backup (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL CHECK (revision > 0),
      snapshot TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.prepare('INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)').run('server_id', randomUUID());
  const serverId = (db.prepare('SELECT value FROM metadata WHERE key = ?').get('server_id') as { value: string }).value;

  const select = db.prepare('SELECT revision, snapshot, updated_at FROM backup WHERE id = 1');
  const insert = db.prepare('INSERT OR IGNORE INTO backup (id, revision, snapshot, updated_at) VALUES (1, 1, ?, ?)');
  const update = db.prepare('UPDATE backup SET revision = revision + 1, snapshot = ?, updated_at = ? WHERE id = 1 AND revision = ?');

  function read(): Backup | null {
    const row = select.get() as BackupRow | undefined;
    return row ? {
      revision: row.revision,
      snapshot: JSON.parse(row.snapshot) as unknown,
      updatedAt: row.updated_at,
    } : null;
  }

  const saveTransaction = db.transaction((snapshot: unknown, expectedRevision: number): Backup | null => {
    const serialized = JSON.stringify(snapshot);
    const updatedAt = new Date().toISOString();
    const changes = expectedRevision === 0
      ? insert.run(serialized, updatedAt).changes
      : update.run(serialized, updatedAt, expectedRevision).changes;
    return changes === 1 ? read() : null;
  });

  return {
    serverId,
    read,
    save: (snapshot, expectedRevision) => saveTransaction(snapshot, expectedRevision),
    close: () => db.close(),
  };
}
