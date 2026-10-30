import { BackupError, readComputerBackup, sameBackup, saveComputerBackup, type BackupState, type Connection } from './backup';
import type { RestoreResult, Snapshot } from '../store/useLingoStore';

type LocalAccess = {
  exportSnapshot: () => Snapshot | null;
  restoreFromBackup: (raw: unknown, expectedLocal: string) => Promise<RestoreResult>;
};

export async function transferBackup(
  action: 'backup' | 'restore', connection: Connection, expected: BackupState,
  localSnapshot: Snapshot, local: LocalAccess,
): Promise<{ remote: BackupState; localChanged: boolean }> {
  const serialized = JSON.stringify(localSnapshot);
  const checkLocal = () => {
    if (JSON.stringify(local.exportSnapshot()) !== serialized) {
      throw new BackupError('changed', '确认期间本机数据已变化，请重新确认。');
    }
  };
  checkLocal();
  const latest = await readComputerBackup(connection);
  if (!sameBackup(expected, latest)) throw new BackupError('conflict', '电脑备份已变化，请重新读取并确认。');
  checkLocal();
  if (action === 'backup') {
    const remote = await saveComputerBackup(connection, localSnapshot, latest);
    return { remote, localChanged: JSON.stringify(local.exportSnapshot()) !== serialized };
  }
  if (!latest.backup) throw new BackupError('empty', '电脑还没有备份可恢复。');
  assertRestored(await local.restoreFromBackup(latest.backup.snapshot, serialized));
  return { remote: latest, localChanged: false };
}

export function assertRestored(result: RestoreResult): void {
  if (result === 'restored') return;
  const messages = {
    changed: '本机数据已变化，未执行恢复。请重新确认。',
    invalid: '备份格式无效，本机数据未更改。',
    'save-failed': '手机保存失败，原数据未被清除。请检查存储空间后重试。',
  };
  throw new BackupError(result, messages[result]);
}
