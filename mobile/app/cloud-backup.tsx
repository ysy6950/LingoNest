import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import type { User } from '@supabase/supabase-js';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { AppTextField } from '../components/AppTextField';
import { colors, radius, spacing } from '../components/theme';
import {
  expectedUploadRevision,
  readKnownRevision,
  readRemoteBackup,
  rememberRevision,
  uploadBackup,
  type RemoteBackup,
} from '../cloud/backup';
import { cloudClient, cloudConfigured } from '../cloud/client';
import { useLingoStore, type Snapshot } from '../store/useLingoStore';

type Confirmation = {
  action: 'backup' | 'restore' | 'undo';
  localSnapshot: string;
  cloudRevision: number | null;
};

export default function CloudBackupScreen() {
  const cards = useLingoStore((state) => state.cards);
  const exportSnapshot = useLingoStore((state) => state.exportSnapshot);
  const latestRecoverySnapshot = useLingoStore((state) => state.latestRecoverySnapshot);
  const restoreFromBackup = useLingoStore((state) => state.restoreFromBackup);
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(!cloudConfigured);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [remote, setRemote] = useState<RemoteBackup | null>(null);
  const [knownRevision, setKnownRevision] = useState<number | null>(null);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [recovery, setRecovery] = useState<Snapshot | null>(null);
  const activeUserId = useRef<string | null>(null);
  const refreshSequence = useRef(0);
  activeUserId.current = user?.id ?? null;

  useEffect(() => {
    void latestRecoverySnapshot().then(setRecovery).catch(() => undefined);
  }, [latestRecoverySnapshot]);

  useEffect(() => {
    if (!cloudClient) return;
    let active = true;
    const { data: listener } = cloudClient.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setSessionReady(true);
      }
    });
    void cloudClient.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError('无法读取登录状态，请稍后重试。');
        setUser(data.session?.user ?? null);
        setSessionReady(true);
      })
      .catch(() => {
        if (!active) return;
        setError('无法读取登录状态，请稍后重试。');
        setSessionReady(true);
      });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const refreshRemote = useCallback(async (userId: string) => {
    if (!cloudClient) return;
    const sequence = ++refreshSequence.current;
    setRemoteLoaded(false);
    try {
      const [cloud, known] = await Promise.all([
        readRemoteBackup(cloudClient, userId),
        readKnownRevision(userId),
      ]);
      if (activeUserId.current !== userId || refreshSequence.current !== sequence) return;
      setRemote(cloud);
      setKnownRevision(known);
      setRemoteLoaded(true);
    } catch (cause) {
      if (activeUserId.current === userId && refreshSequence.current === sequence) {
        setRemoteLoaded(false);
        setError(`读取云端状态失败：${describeError(cause)}`);
      }
    }
  }, []);

  useEffect(() => {
    setRemote(null);
    setKnownRevision(null);
    setRemoteLoaded(false);
    setError('');
    if (user) void refreshRemote(user.id);
  }, [user?.id, refreshRemote]);

  async function sendCode() {
    if (!cloudClient || busy) return;
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('请先输入有效的邮箱地址。');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: authError } = await cloudClient.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: true },
      });
      if (authError) setError(`发送验证码失败：${authError.message}`);
      else {
        setEmail(address);
        setCodeSent(true);
        setMessage('验证码已发送。请查看邮箱，并输入邮件中的数字验证码。');
      }
    } catch (cause) {
      setError(`发送验证码失败：${describeError(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!cloudClient || busy) return;
    if (!code.trim()) {
      setError('请输入邮件中的验证码。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await cloudClient.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'email',
      });
      if (authError) setError(`验证失败：${authError.message}`);
      else {
        setCode('');
        setCodeSent(false);
        setMessage('登录成功。本机单词不会自动上传，请检查云端状态后选择备份或恢复。');
      }
    } catch (cause) {
      setError(`验证失败：${describeError(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  function askToConfirm(action: 'backup' | 'restore' | 'undo') {
    const snapshot = exportSnapshot();
    if (!snapshot) {
      setError('本机数据尚未准备好，请稍后再试。');
      return;
    }
    setError('');
    setConfirmation({
      action,
      localSnapshot: JSON.stringify(snapshot),
      cloudRevision: remote?.revision ?? null,
    });
  }

  async function confirmAction() {
    if (!confirmation || busy) return;
    const request = confirmation;
    setConfirmation(null);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const snapshot = exportSnapshot();
      if (!snapshot || JSON.stringify(snapshot) !== request.localSnapshot) {
        throw new Error('确认期间本机数据已变化，请重新检查并操作。');
      }
      if (request.action === 'undo') {
        const previous = await latestRecoverySnapshot();
        if (!previous) throw new Error('找不到可恢复的本机副本。');
        const result = await restoreFromBackup(previous, request.localSnapshot);
        if (result !== 'restored') throw new Error('本机数据已变化或保存失败，未执行撤销。');
        setRecovery(snapshot);
        setMessage('已恢复上次的本机内容。刚刚替换掉的数据也保留为新的恢复副本。');
        return;
      }
      if (!cloudClient || !user) throw new Error('请先登录账号。');
      const latest = await readRemoteBackup(cloudClient, user.id);
      if ((latest?.revision ?? null) !== request.cloudRevision) {
        setRemote(latest);
        throw new Error('云端数据刚刚变化。请重新检查后再操作，未覆盖任何记录。');
      }

      if (request.action === 'backup') {
        const expected = expectedUploadRevision(latest?.revision ?? null, knownRevision);
        if (expected === null) {
          throw new Error('云端已有其他版本，不能直接覆盖。请先恢复或在原设备继续备份。');
        }
        const revision = await uploadBackup(cloudClient, snapshot, expected);
        setRemote({ revision, snapshot, updatedAt: new Date().toISOString() });
        setKnownRevision(revision);
        try {
          await rememberRevision(user.id, revision);
          const changed = JSON.stringify(exportSnapshot()) !== request.localSnapshot;
          setMessage(changed
            ? '云端已保存操作开始时的数据；本机随后又有改动，请再备份一次。'
            : '备份完成。现在可以在另一台手机登录并恢复。');
        } catch {
          setMessage('云端已保存，但本机未能记录备份版本。下次备份前请先刷新并检查云端数据。');
        }
      } else {
        if (!latest) throw new Error('云端尚无备份可恢复。');
        const result = await restoreFromBackup(latest.snapshot, request.localSnapshot);
        if (result !== 'restored') {
          const reasons = {
            changed: '本机数据在恢复期间有变化，未覆盖。请重新确认。',
            invalid: '云端备份格式无效，本机数据未更改。',
            'save-failed': '本机保存失败，原有数据未被清除。',
          };
          throw new Error(reasons[result]);
        }
        setRemote(latest);
        setKnownRevision(latest.revision);
        setRecovery(snapshot);
        try {
          await rememberRevision(user.id, latest.revision);
          setMessage('恢复完成。本机旧数据已另存为恢复副本，当前显示云端单词和复习进度。');
        } catch {
          setMessage('单词已恢复，但本机未能记录云端版本；后续备份前请先检查云端状态。');
        }
      }
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!cloudClient || busy) return;
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await cloudClient.auth.signOut();
      if (authError) setError(`退出失败：${authError.message}`);
      else setMessage('已退出账号。本机单词仍保留在这台设备上。');
    } catch (cause) {
      setError(`退出失败：${describeError(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  const uploadExpected = expectedUploadRevision(remote?.revision ?? null, knownRevision);
  const canBackup = Boolean(user && remoteLoaded && uploadExpected !== null);
  const remoteCards = remote && isRecord(remote.snapshot) && Array.isArray(remote.snapshot.cards)
    ? remote.snapshot.cards.length
    : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} accessibilityLabel="返回统计页" style={styles.backArea}>
          <Text style={styles.back}>← 返回</Text>
        </Pressable>
        <Text style={styles.eyebrow}>CLOUD BACKUP</Text>
        <Text style={styles.title}>云端备份</Text>
        <Text style={styles.subtitle}>本机可以继续离线学习。只有你点击备份或恢复时，才会传输单词和复习记录。</Text>

        {!cloudConfigured ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>云端功能尚未配置</Text>
            <Text style={styles.body}>本地添加和复习照常可用。项目开发者完成 Supabase 配置后，此处会开放邮箱登录。</Text>
          </View>
        ) : !sessionReady ? (
          <Text style={styles.body}>正在读取登录状态…</Text>
        ) : !user ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>用邮箱登录</Text>
            <Text style={styles.body}>首次验证邮箱会创建账号；以后使用同一邮箱即可找回备份。</Text>
            <AppTextField label="邮箱" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!busy} />
            {codeSent ? <AppTextField label="邮件验证码" value={code} onChangeText={setCode} keyboardType="number-pad" autoCapitalize="none" editable={!busy} /> : null}
            <AppButton label={codeSent ? '重新发送验证码' : '发送验证码'} onPress={() => void sendCode()} disabled={busy} variant={codeSent ? 'secondary' : 'primary'} />
            {codeSent ? <AppButton label="验证并登录" onPress={() => void verifyCode()} disabled={busy} /> : null}
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>当前账号</Text>
              <Text style={styles.body}>{user.email ?? '已登录'}</Text>
              <Text style={styles.detail}>本机：{cards.length} 张单词卡</Text>
              <Text style={styles.detail}>
                {remoteLoaded
                  ? remote
                    ? `云端：${remoteCards} 张单词卡 · 版本 ${remote.revision} · ${formatDate(remote.updatedAt)}`
                    : '云端：还没有备份'
                  : '正在读取云端备份…'}
              </Text>
              {remote && uploadExpected === null ? (
                <Text style={styles.notice}>这台设备尚未确认云端最新版本。为避免覆盖，请先恢复或在原备份设备继续操作。</Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>备份与恢复</Text>
              <Text style={styles.body}>备份会保存当前本机内容；恢复会用云端内容替换当前本机内容，并先保留一份本机恢复副本。</Text>
              <AppButton label="备份当前手机数据" onPress={() => askToConfirm('backup')} disabled={busy || !canBackup} />
              <AppButton label="从云端恢复到此手机" variant="secondary" onPress={() => askToConfirm('restore')} disabled={busy || !remoteLoaded || !remote} />
              <AppButton label="刷新云端状态" variant="quiet" onPress={() => void refreshRemote(user.id)} disabled={busy} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>账号与本机数据</Text>
              <Text style={styles.body}>退出登录不会清除这台手机上的单词。共用设备时，请注意本机数据仍可能被下一个使用者看到。</Text>
              <AppButton label="退出账号" variant="secondary" onPress={() => void signOut()} disabled={busy} />
            </View>
          </>
        )}

        {message ? <Text style={styles.success} accessibilityRole="alert">{message}</Text> : null}
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        {recovery ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>上次恢复前的本机副本</Text>
            <Text style={styles.body}>保留了 {recovery.cards.length} 张单词卡。若恢复了错误的云端版本，可在这里找回上次的本机内容。</Text>
            <AppButton label="恢复上次本机内容" variant="secondary" onPress={() => askToConfirm('undo')} disabled={busy} />
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={confirmation !== null} transparent animationType="fade" onRequestClose={() => setConfirmation(null)}>
        <View style={styles.backdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.cardTitle}>{confirmation?.action === 'backup' ? '确认备份？' : confirmation?.action === 'undo' ? '恢复上次本机内容？' : '确认恢复？'}</Text>
            <Text style={styles.body}>
              {confirmation?.action === 'backup'
                ? `将本机 ${cards.length} 张单词卡保存到账号「${user?.email ?? ''}」。云端现有版本会在版本一致时更新。`
                : confirmation?.action === 'undo'
                  ? `将上次保留的 ${recovery?.cards.length ?? 0} 张单词卡恢复到本机。当前本机内容也会先保存为新的恢复副本。`
                : `将云端 ${remoteCards} 张单词卡恢复到本机。本机现有 ${cards.length} 张卡会先保留恢复副本，再被云端数据替换。`}
            </Text>
            <AppButton label={confirmation?.action === 'backup' ? '确认备份' : confirmation?.action === 'undo' ? '恢复本机副本' : '确认恢复'} onPress={() => void confirmAction()} />
            <AppButton label="取消" variant="secondary" onPress={() => setConfirmation(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '时间未知' : parsed.toLocaleString('zh-CN');
}

function describeError(cause: unknown): string {
  if (isRecord(cause) && cause.code === '40001') {
    return '另一台设备刚更新了云端备份。请刷新后再决定是否恢复，未覆盖任何数据。';
  }
  return cause instanceof Error ? cause.message : '操作失败，请检查网络后重试。';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 48, gap: spacing.lg },
  backArea: { minHeight: 40, justifyContent: 'center' },
  back: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  cardTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  body: { color: colors.inkSoft, fontSize: 14, lineHeight: 21 },
  detail: { color: colors.inkSoft, fontSize: 13, lineHeight: 20 },
  notice: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  success: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 36, 31, 0.45)', justifyContent: 'center', padding: 20 },
  confirmCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, gap: spacing.lg },
});
