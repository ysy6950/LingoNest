import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { colors, radius, spacing } from '../../components/theme';
import { createMemberInvitation } from '../../localServer/account';
import { useAccountSession } from '../../store/useAccountSession';
import { useComputerConnection } from '../../store/useComputerConnection';

export default function MeScreen() {
  const session = useAccountSession((state) => state.active);
  const paired = useComputerConnection((state) => state.paired);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState('');

  async function inviteMember() {
    if (!session || session.account.role !== 'admin' || !paired || inviting) return;
    setInviting(true);
    setInvite('');
    setInviteError('');
    try {
      const code = await createMemberInvitation(session);
      if (useAccountSession.getState().active?.token === session.token) setInvite(code);
    } catch (cause) {
      setInviteError(cause instanceof Error ? cause.message : '生成邀请码失败，请重试。');
    } finally {
      setInviting(false);
    }
  }

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>我的</Text>
        <AppButton label="设置" compact variant="quiet" onPress={() => router.push('/settings')} />
      </View>
      <View style={styles.profile}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{session ? session.account.displayName.slice(0, 1) : '游'}</Text></View>
          <View style={styles.identity}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{session?.account.displayName || '游客'}</Text>
              {session ? <AppButton label="编辑" accessibilityLabel="编辑账号" compact variant="quiet" onPress={() => router.push('/account')} style={styles.edit} /> : null}
            </View>
            <Text style={styles.meta}>{session ? `@${session.account.username} · ${session.account.role === 'admin' ? '管理员' : '成员'}` : '当前使用本机游客词库'}</Text>
          </View>
        </View>
        {!session ? <AppButton label="登录或注册" onPress={() => router.push('/account')} /> : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>学习资料</Text>
        <Text style={styles.hint}>将当前词库和复习记录备份到电脑，或从电脑恢复。</Text>
        <AppButton label="电脑备份与恢复" variant="secondary" onPress={() => router.push('/local-backup')} />
      </View>
      {session?.account.role === 'admin' ? <View style={styles.section}>
        <Text style={styles.heading}>邀请新成员</Text>
        <Text style={styles.hint}>生成一次性邀请码，私下交给朋友注册。邀请码 7 天内有效，不要发到公开仓库。</Text>
        {!paired ? <Text style={styles.hint}>电脑未连接。请先通过账号旁的「编辑」重新登录。</Text> : null}
        <AppButton label={inviting ? '生成中…' : '生成邀请码'} variant="secondary" disabled={inviting || !paired} onPress={() => void inviteMember()} />
        {invite ? <>
          <Text selectable style={styles.invite}>{invite}</Text>
          <AppButton label="隐藏邀请码" compact variant="quiet" onPress={() => setInvite('')} />
        </> : null}
        {inviteError ? <Text accessibilityRole="alert" style={styles.error}>{inviteError}</Text> : null}
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingTop: 32, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.ink, fontSize: 34, fontWeight: '800' },
  profile: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginTop: 24, gap: spacing.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontSize: 22, fontWeight: '800' },
  identity: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.ink, fontSize: 18, fontWeight: '800', flex: 1 },
  edit: { minHeight: 36 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  section: { marginTop: spacing.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  invite: { color: colors.ink, fontSize: 14, lineHeight: 21, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
