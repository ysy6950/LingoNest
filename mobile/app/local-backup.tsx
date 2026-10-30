import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Keyboard, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { ComputerConnectionFields } from '../components/ComputerConnectionFields';
import { colors, radius, spacing } from '../components/theme';
import { readComputerBackup, type BackupState } from '../localServer/backup';
import { assertRestored, transferBackup } from '../localServer/transfer';
import { useLingoStore, type Snapshot } from '../store/useLingoStore';
import { useComputerConnection, withComputerConnection } from '../store/useComputerConnection';

type Confirmation = {
  action: 'backup' | 'restore' | 'undo';
  local: Snapshot;
  remote: BackupState | null;
  recovery: Snapshot | null;
};

export default function LocalBackupScreen() {
  const cards = useLingoStore((state) => state.cards);
  const groups = useLingoStore((state) => state.groups);
  const exportSnapshot = useLingoStore((state) => state.exportSnapshot);
  const restoreFromBackup = useLingoStore((state) => state.restoreFromBackup);
  const latestRecoverySnapshot = useLingoStore((state) => state.latestRecoverySnapshot);
  const address = useComputerConnection((state) => state.address);
  const token = useComputerConnection((state) => state.token);
  const [remote, setRemote] = useState<BackupState | null>(null);
  const [recovery, setRecovery] = useState<Snapshot | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const working = useRef(false);

  useEffect(() => { setRemote(null); setConfirmation(null); setMessage(''); setError(''); }, [address, token]);

  useEffect(() => {
    let active = true;
    void latestRecoverySnapshot().then((snapshot) => { if (active) setRecovery(snapshot); })
      .catch(() => { if (active) setError('无法读取本机恢复副本，请退出此页后重试。'); });
    return () => { active = false; };
  }, [latestRecoverySnapshot]);

  function begin() {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    return true;
  }
  function finish() { working.current = false; setBusy(false); }

  async function read() {
    if (!begin()) return;
    Keyboard.dismiss();
    setRemote(null);
    try {
      setRemote(await withComputerConnection(readComputerBackup));
      setMessage('已读取电脑状态。请核对数量和时间后，再选择备份或恢复。');
    } catch (cause) { setError(describe(cause)); }
    finally { finish(); }
  }

  function ask(action: Confirmation['action']) {
    if (working.current) return;
    Keyboard.dismiss();
    const local = exportSnapshot();
    if (!local) { setError('本机数据尚未准备好，请稍后重试。'); return; }
    if (action !== 'undo' && !remote) return;
    if (action === 'undo' && !recovery) return;
    setConfirmation({ action, local, remote, recovery });
  }

  async function confirm() {
    if (!confirmation || !begin()) return;
    const request = confirmation;
    setConfirmation(null);
    try {
      if (request.action === 'undo') {
        if (!request.recovery) throw new Error('没有可撤销的恢复记录。');
        assertRestored(await restoreFromBackup(request.recovery, JSON.stringify(request.local)));
        setRecovery(request.local);
        setMessage('已恢复上次替换前的手机数据。刚替换的内容也已保留为恢复副本。');
      } else {
        if (!request.remote) throw new Error('请重新读取电脑状态。');
        const result = await withComputerConnection((connection) => transferBackup(request.action as 'backup' | 'restore', connection, request.remote!, request.local,
          { exportSnapshot, restoreFromBackup }));
        setRemote(result.remote);
        if (request.action === 'restore') {
          setRecovery(request.local);
          setMessage('恢复完成，单词、分组和复习进度已替换。原手机数据已留档，可在下方撤销。');
        } else setMessage(result.localChanged
          ? '电脑已保存操作开始时的数据；手机随后有新改动，请再备份一次。'
          : '备份完成，电脑已保存当前单词、分组和复习进度。');
      }
    } catch (cause) {
      if (request.action !== 'undo') setRemote(null);
      setError(describe(cause));
    } finally { finish(); }
  }

  const target = confirmation?.action === 'undo' ? confirmation.recovery : confirmation?.remote?.backup?.snapshot;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppButton label="返回统计" compact variant="quiet" onPress={() => router.back()} disabled={busy} style={styles.back} />
        <Text style={styles.title}>电脑备份</Text>
        <Text style={styles.body}>手动保存到自己的电脑。恢复会替换手机内容，不会合并两边的单词。</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>连接电脑</Text>
          <ComputerConnectionFields disabled={busy || !!confirmation} />
          <AppButton label={busy ? '处理中…' : '读取电脑备份'} onPress={() => void read()} disabled={busy} variant="secondary" />
          <AppButton label="只检查连接" compact variant="quiet" onPress={() => router.push('/local-server')} disabled={busy} />
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>核对数据</Text>
          <Text style={styles.body}>手机：{cards.length} 个单词 · {groups.length} 个分组</Text>
          <Text style={styles.body}>{!remote ? '电脑：尚未读取' : remote.backup
            ? `电脑：${remote.backup.snapshot.cards.length} 个单词 · ${remote.backup.snapshot.groups.length} 个分组\n版本 ${remote.backup.revision} · ${new Date(remote.backup.updatedAt).toLocaleString()}`
            : '电脑：还没有备份'}</Text>
          <AppButton label="备份手机数据到电脑" onPress={() => ask('backup')} disabled={busy || !remote} />
          <AppButton label="从电脑恢复到手机" onPress={() => ask('restore')} disabled={busy || !remote?.backup} variant="secondary" />
        </View>
        {message ? <Text accessibilityRole="alert" style={styles.success}>{message}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {recovery ? <View style={styles.card}>
          <Text style={styles.heading}>恢复前的手机副本</Text>
          <Text style={styles.body}>{recovery.cards.length} 个单词 · {recovery.groups.length} 个分组。无需连接电脑也能撤销；撤销也会替换当前手机数据。</Text>
          <AppButton label="撤销上次恢复" variant="secondary" onPress={() => ask('undo')} disabled={busy} />
        </View> : null}
        <Text style={styles.note}>仅用于可信的私人局域网。当前连接未加密，配对码不能代替正式账号和安全部署。电脑关机时仍能离线学习。</Text>
      </ScrollView>
      <Modal visible={confirmation !== null} transparent animationType="fade" onRequestClose={() => setConfirmation(null)}>
        <View style={styles.overlay}><ScrollView style={styles.dialog} contentContainerStyle={styles.dialogContent}>
          <Text style={styles.heading}>{confirmation?.action === 'backup' ? '确认备份到电脑？' : confirmation?.action === 'undo' ? '确认撤销恢复？' : '确认恢复到手机？'}</Text>
          <Text style={styles.body}>{confirmation?.action === 'backup'
            ? `把手机的 ${confirmation.local.cards.length} 个单词和复习进度保存到电脑。${confirmation.remote?.backup ? `这会覆盖电脑版本 ${confirmation.remote.backup.revision} 的 ${confirmation.remote.backup.snapshot.cards.length} 个单词，旧电脑版本不保留。` : '这是此电脑的第一份备份。'}`
            : `用所选副本的 ${target?.cards.length ?? 0} 个单词及复习进度，替换手机当前 ${confirmation?.local.cards.length ?? 0} 个单词。当前手机内容会先留档。`}</Text>
          <AppButton label={confirmation?.action === 'backup' ? '确认保存到电脑' : '确认替换手机数据'} onPress={() => void confirm()} />
          <AppButton label="取消" variant="secondary" onPress={() => setConfirmation(null)} />
        </ScrollView></View>
      </Modal>
    </SafeAreaView>
  );
}

function describe(cause: unknown) { return cause instanceof Error ? cause.message : '操作失败，请重试。'; }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 48 },
  back: { alignSelf: 'flex-start' },
  title: { color: colors.ink, fontSize: 25, fontWeight: '800' },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  body: { color: colors.inkSoft, fontSize: 14, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  note: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  success: { color: colors.primary, lineHeight: 22 },
  error: { color: colors.danger, lineHeight: 22 },
  overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.lg, maxHeight: '90%', flexGrow: 0 },
  dialogContent: { padding: spacing.xl, gap: spacing.lg },
});
