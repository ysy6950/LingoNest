import { buildHealthUrl } from './health';
import { isBackupSnapshot, normalizeBackupSnapshot } from './snapshot';
import type { Snapshot } from '../store/useLingoStore';

export type Connection = { address: string; token: string };
export type ComputerBackup = { revision: number; snapshot: Snapshot; updatedAt: string };
export type BackupState = { serverId: string; backup: ComputerBackup | null };

export class BackupError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

function parseState(value: unknown): BackupState {
  if (typeof value !== 'object' || value === null || !('serverId' in value) ||
      typeof value.serverId !== 'string' || !value.serverId || !('backup' in value)) {
    throw new BackupError('invalid', '电脑返回的数据格式无效，未执行恢复。');
  }
  if (value.backup === null) return { serverId: value.serverId, backup: null };
  const backup = value.backup as Partial<ComputerBackup> | null;
  if (!backup || !Number.isSafeInteger(backup.revision) || (backup.revision ?? 0) < 1 ||
      typeof backup.updatedAt !== 'string' || !Number.isFinite(Date.parse(backup.updatedAt)) ||
      !isBackupSnapshot(backup.snapshot)) {
    throw new BackupError('invalid', '电脑备份不完整或格式无效，本机数据未更改。');
  }
  const snapshot = normalizeBackupSnapshot(backup.snapshot);
  if (!snapshot) throw new BackupError('invalid', '电脑备份不完整或格式无效，本机数据未更改。');
  return { serverId: value.serverId, backup: { revision: backup.revision as number, updatedAt: backup.updatedAt as string, snapshot } };
}

async function request(connection: Connection, body?: unknown, timeoutMs = 10000): Promise<BackupState> {
  const healthUrl = buildHealthUrl(connection.address);
  if (!healthUrl) throw new BackupError('address', '请输入电脑的局域网 IPv4 和端口。');
  if (!/^[a-f0-9]{32}$/i.test(connection.token.trim())) throw new BackupError('auth', '请粘贴电脑终端显示的完整配对码。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(healthUrl.replace(/\/health$/, '/backup'), {
      method: body === undefined ? 'GET' : 'PUT',
      headers: { authorization: `Bearer ${connection.token.trim()}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (response.status === 401) throw new BackupError('auth', '配对码不正确或已过期。电脑服务重启后需要重新输入。');
    if (response.status === 409) throw new BackupError('conflict', '电脑备份已变化。请重新读取并检查，未覆盖电脑记录。');
    if (response.status === 404) throw new BackupError('mode', '电脑仅开放了连接检查，请按说明启用备份模式。');
    if (response.status === 413) throw new BackupError('size', '备份超过 5 MB，未保存。');
    if (!response.ok) throw new BackupError('server', '电脑未接受此次操作，请检查服务后重试。');
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new BackupError('invalid', '电脑返回的数据无法解析，未执行恢复。'); }
    return parseState(value);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(controller.signal.aborted ? 'timeout' : 'network',
      body === undefined
        ? `${controller.signal.aborted ? '读取超时。' : '无法读取电脑备份。'}请检查网络、地址和服务是否运行。`
        : `${controller.signal.aborted ? '等待保存确认超时。' : '未收到保存确认。'}电脑可能已保存，请重新读取状态后再决定是否重试。`);
  } finally { clearTimeout(timer); }
}

export const readComputerBackup = (connection: Connection, timeoutMs = 10000) => request(connection, undefined, timeoutMs);
export async function saveComputerBackup(connection: Connection, snapshot: Snapshot, expected: BackupState): Promise<BackupState> {
  if (!isBackupSnapshot(snapshot)) throw new BackupError('invalid', '本机备份格式无效，未上传。');
  const result = await request(connection, { snapshot, expectedRevision: expected.backup?.revision ?? 0, expectedServerId: expected.serverId });
  if (result.serverId !== expected.serverId || result.backup?.revision !== (expected.backup?.revision ?? 0) + 1 ||
      JSON.stringify(result.backup.snapshot) !== JSON.stringify(snapshot)) {
    throw new BackupError('invalid', '保存响应不符合预期，请重新读取电脑状态后核对。');
  }
  return result;
}

export function sameBackup(a: BackupState, b: BackupState): boolean {
  return a.serverId === b.serverId && (a.backup?.revision ?? 0) === (b.backup?.revision ?? 0);
}
