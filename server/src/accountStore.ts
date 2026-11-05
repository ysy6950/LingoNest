import { randomBytes, randomUUID, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Backup } from './backupStore.js';

const passwordOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const scrypt = (password: string, salt: Buffer, size: number) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, size, passwordOptions, (error, derived) => error ? reject(error) : resolve(derived));
});
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;

export type Account = { id: string; username: string; displayName: string; role: 'admin' | 'member' };
type AccountRow = Account & { password_hash: string };
type BackupRow = { revision: number; snapshot: string; updated_at: string };
type TokenRow = { id: string; role: 'admin' | 'member'; expires_at: number };
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const publicAccount = (row: AccountRow): Account => ({ id: row.id, username: row.username, displayName: row.displayName, role: row.role });

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, Buffer.from(salt, 'hex'), 32);
  return `scrypt-v1:${salt}:${derived.toString('hex')}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(password, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const validUsername = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_]{2,23}$/.test(value);
export const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length >= 10 && value.length <= 128 && Buffer.byteLength(value, 'utf8') <= 256;
export const validDisplayName = (value: unknown): value is string => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 40 && !/[\u0000-\u001f]/.test(value);

export function openAccountStore(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')), password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_invitations (
      token_hash TEXT PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      expires_at INTEGER NOT NULL, used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS account_resets (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id),
      expires_at INTEGER NOT NULL, used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS account_backups (
      user_id TEXT PRIMARY KEY REFERENCES accounts(id), revision INTEGER NOT NULL CHECK (revision > 0),
      snapshot TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  db.prepare('INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)').run('server_id', randomUUID());
  const serverId = (db.prepare('SELECT value FROM metadata WHERE key = ?').get('server_id') as { value: string }).value;
  const accountById = db.prepare('SELECT id, username, display_name AS displayName, role, password_hash FROM accounts WHERE id = ?');
  const accountByName = db.prepare('SELECT id, username, display_name AS displayName, role, password_hash FROM accounts WHERE username = ?');
  const readBackupRow = db.prepare('SELECT revision, snapshot, updated_at FROM account_backups WHERE user_id = ?');
  const parseBackup = (row: BackupRow | undefined): Backup | null => row ? { revision: row.revision, snapshot: JSON.parse(row.snapshot) as unknown, updatedAt: row.updated_at } : null;

  function createInvitation(role: 'admin' | 'member'): string {
    if (role === 'admin' && (db.prepare('SELECT COUNT(*) AS count FROM accounts WHERE role = ?').get('admin') as { count: number }).count !== 0) {
      throw new Error('admin_already_exists');
    }
    const value = token();
    db.prepare('INSERT INTO account_invitations VALUES (?, ?, ?, NULL)').run(digest(value), role, Date.now() + INVITE_MS);
    return value;
  }

  async function register(input: { invitation: string; username: string; displayName: string; password: string }): Promise<Account | null> {
    const row = db.prepare('SELECT role, expires_at, used_at FROM account_invitations WHERE token_hash = ?').get(digest(input.invitation)) as (TokenRow & { used_at: number | null }) | undefined;
    if (!row || row.used_at !== null || row.expires_at <= Date.now()) return null;
    const hash = await hashPassword(input.password);
    return db.transaction(() => {
      const claimed = db.prepare('UPDATE account_invitations SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
        .run(Date.now(), digest(input.invitation), Date.now()).changes;
      if (!claimed) return null;
      if (row.role === 'admin' && (db.prepare("SELECT COUNT(*) AS count FROM accounts WHERE role = 'admin'").get() as { count: number }).count !== 0) return null;
      const id = randomUUID();
      db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?)').run(id, input.username, input.displayName.trim(), row.role, hash);
      return { id, username: input.username, displayName: input.displayName.trim(), role: row.role } as Account;
    })();
  }

  function createSession(id: string) {
    const value = token();
    const expiresAt = Date.now() + SESSION_MS;
    db.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').run(digest(value), id, expiresAt);
    return { token: value, expiresAt };
  }

  return {
    serverId,
    createInvitation,
    register,
    async login(username: string, password: string) {
      const row = accountByName.get(username) as AccountRow | undefined;
      // Equal-cost check avoids revealing whether a username exists through a quick response.
      const valid = row ? await checkPassword(password, row.password_hash) : (await hashPassword(password), false);
      return row && valid ? { account: publicAccount(row), ...createSession(row.id) } : null;
    },
    session(value: string): Account | null {
      if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
      const row = db.prepare('SELECT user_id, expires_at FROM account_sessions WHERE token_hash = ?').get(digest(value)) as { user_id: string; expires_at: number } | undefined;
      if (!row || row.expires_at <= Date.now()) return null;
      const account = accountById.get(row.user_id) as AccountRow | undefined;
      return account ? publicAccount(account) : null;
    },
    revoke(value: string) { db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(digest(value)); },
    async changePassword(id: string, oldPassword: string, newPassword: string) {
      const row = accountById.get(id) as AccountRow | undefined;
      if (!row || !await checkPassword(oldPassword, row.password_hash)) return false;
      const hash = await hashPassword(newPassword);
      db.transaction(() => {
        db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hash, id);
        db.prepare('DELETE FROM account_sessions WHERE user_id = ?').run(id);
      })();
      return true;
    },
    rename(id: string, name: string) {
      db.prepare('UPDATE accounts SET display_name = ? WHERE id = ?').run(name.trim(), id);
      return publicAccount(accountById.get(id) as AccountRow);
    },
    listAccounts(): Account[] {
      return (db.prepare('SELECT id, username, display_name AS displayName, role, password_hash FROM accounts ORDER BY username').all() as AccountRow[]).map(publicAccount);
    },
    findAccount(username: string): Account | null {
      const row = accountByName.get(username) as AccountRow | undefined;
      return row ? publicAccount(row) : null;
    },
    createReset(id: string): string | null {
      if (!accountById.get(id)) return null;
      const value = token();
      db.prepare('INSERT INTO account_resets VALUES (?, ?, ?, NULL)').run(digest(value), id, Date.now() + RESET_MS);
      return value;
    },
    async resetPassword(value: string, password: string): Promise<boolean> {
      const row = db.prepare('SELECT user_id, expires_at, used_at FROM account_resets WHERE token_hash = ?').get(digest(value)) as { user_id: string; expires_at: number; used_at: number | null } | undefined;
      if (!row || row.used_at !== null || row.expires_at <= Date.now()) return false;
      const hash = await hashPassword(password);
      return db.transaction(() => {
        const claimed = db.prepare('UPDATE account_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').run(Date.now(), digest(value), Date.now()).changes;
        if (!claimed) return false;
        db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
        db.prepare('DELETE FROM account_sessions WHERE user_id = ?').run(row.user_id);
        return true;
      })();
    },
    readBackup(id: string) { return parseBackup(readBackupRow.get(id) as BackupRow | undefined); },
    saveBackup(id: string, snapshot: unknown, expectedRevision: number): Backup | null {
      return db.transaction(() => {
        const serialized = JSON.stringify(snapshot);
        const updatedAt = new Date().toISOString();
        const changes = expectedRevision === 0
          ? db.prepare('INSERT OR IGNORE INTO account_backups VALUES (?, 1, ?, ?)').run(id, serialized, updatedAt).changes
          : db.prepare('UPDATE account_backups SET revision = revision + 1, snapshot = ?, updated_at = ? WHERE user_id = ? AND revision = ?').run(serialized, updatedAt, id, expectedRevision).changes;
        return changes ? parseBackup(readBackupRow.get(id) as BackupRow) : null;
      })();
    },
    legacyBackup(): Backup | null {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'backup'").get();
      return exists ? parseBackup(db.prepare('SELECT revision, snapshot, updated_at FROM backup WHERE id = 1').get() as BackupRow | undefined) : null;
    },
    claimLegacyBackup(id: string, expectedRevision: number): boolean {
      return db.transaction(() => {
        if (!accountById.get(id) || readBackupRow.get(id)) return false;
        const legacy = this.legacyBackup();
        if (!legacy || legacy.revision !== expectedRevision) return false;
        db.prepare('INSERT INTO account_backups VALUES (?, 1, ?, ?)').run(id, JSON.stringify(legacy.snapshot), new Date().toISOString());
        return true;
      })();
    },
    close() { db.close(); },
  };
}

export type AccountStore = ReturnType<typeof openAccountStore>;
