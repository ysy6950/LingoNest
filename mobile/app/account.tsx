import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { AppTextField } from '../components/AppTextField';
import { colors, spacing } from '../components/theme';
import { AccountError, loginAccount, registerAccount, resetAccountPassword, renameAccount, changeAccountPassword } from '../localServer/account';
import { useAccountSession } from '../store/useAccountSession';
import { useComputerConnection } from '../store/useComputerConnection';
import { useLingoStore } from '../store/useLingoStore';
import { buildHealthUrl } from '../localServer/health';
import { DISPLAY_NAME_RULE, INVITATION_RULE, PASSWORD_RULE, RESET_TOKEN_RULE, USERNAME_RULE, displayNameError, invitationError, newPasswordError, resetTokenError, usernameError } from '../accountValidation';

type Mode = 'login' | 'register' | 'reset';
type Field = 'address' | 'username' | 'displayName' | 'password' | 'oldPassword' | 'invitation' | 'resetToken';
type FieldErrors = Partial<Record<Field, string>>;
export default function AccountScreen() {
  const session = useAccountSession((state) => state.active);
  const connected = useComputerConnection((state) => state.paired);
  const storedAddress = useComputerConnection((state) => state.address);
  const cards = useLingoStore((state) => state.cards);
  const [address, setAddress] = useState(storedAddress);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(session?.account.displayName ?? '');
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [invitation, setInvitation] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function clearField(field: Field) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
  }

  async function submit() {
    if (busy) return;
    const next: FieldErrors = {};
    if (!buildHealthUrl(address)) next.address = '请输入同一局域网内电脑的 IP 和端口，例如 192.168.1.20:3001。';
    if (mode !== 'reset') next.username = usernameError(username);
    if (mode === 'register') {
      next.invitation = invitationError(invitation);
      next.displayName = displayNameError(displayName);
    }
    if (mode === 'login') {
      if (!password) next.password = '请输入密码。';
    } else {
      next.password = newPasswordError(password);
      if (mode === 'reset') next.resetToken = resetTokenError(resetToken);
    }
    if (Object.values(next).some(Boolean)) { setFieldErrors(next); setError('请先检查标红的输入项。'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'reset') {
        await resetAccountPassword(address, resetToken, password);
        setMode('login'); setMessage('密码已重置，请登录。');
      } else {
        const result = mode === 'login'
          ? await loginAccount(address, username, password)
          : await registerAccount(address, invitation, username, displayName, password);
        await useAccountSession.getState().activate(result);
        setPassword(''); setOldPassword(''); setInvitation('');
        setSwitching(false);
        router.replace('/(tabs)/me');
      }
    } catch (cause) {
      if (cause instanceof AccountError && cause.code === 'name') setFieldErrors({ username: cause.message });
      if (cause instanceof AccountError && cause.code === 'invitation') setFieldErrors({ invitation: cause.message });
      if (cause instanceof AccountError && cause.code === 'reset') setFieldErrors({ resetToken: cause.message });
      setError(cause instanceof Error ? cause.message : '操作失败，请重试。');
    }
    finally { setBusy(false); }
  }

  async function handle(action: 'logout' | 'copy' | 'rename' | 'password') {
    if (busy || !session) return;
    const next: FieldErrors = {};
    if (action === 'rename') next.displayName = displayNameError(displayName);
    if (action === 'password') {
      if (!oldPassword) next.oldPassword = '请输入当前密码。';
      next.password = newPasswordError(password);
    }
    if (Object.values(next).some(Boolean)) { setFieldErrors(next); setError('请先检查标红的输入项。'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'logout') {
        await useAccountSession.getState().logout();
        router.replace('/(tabs)/me');
      } else if (action === 'copy') {
        await useAccountSession.getState().copyGuest();
        setCopyConfirm(false); setMessage('游客词库已复制到当前账号；原游客词库仍保留。');
      } else if (action === 'rename') {
        const account = await renameAccount(session, displayName);
        await useAccountSession.getState().activate({ ...session, account });
        setMessage('昵称已更新。');
      } else {
        await changeAccountPassword(session, oldPassword, password);
        // Changing the password revokes all server sessions, including this device.
        await useAccountSession.getState().clearRevoked();
        setPassword(''); setOldPassword('');
        router.replace('/(tabs)/me');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <AppButton compact variant="quiet" label="返回我的" onPress={() => router.replace('/(tabs)/me')} style={styles.back} />
    <Text style={styles.title}>账号</Text>
    {session && !switching ? <>
      <Text style={styles.summary}>{session.account.displayName} · @{session.account.username}</Text>
      <Text style={styles.hint}>当前词库：{cards.length} 个单词。退出只切回本机游客词库，不删除账号词库。</Text>
      {!connected ? <>
        <Text style={styles.hint}>电脑会话不可用时，本地词库仍可离线学习。重新登录可恢复备份、词典和 AI。</Text>
        <AppButton label="重新登录" variant="secondary" onPress={() => { setAddress(session.address); setUsername(session.account.username); setMode('login'); setSwitching(true); }} />
      </> : null}
      <AppButton label="登录或注册其他账号" variant="secondary" onPress={() => { setAddress(session.address); setMode('login'); setSwitching(true); }} />
      <AppButton label="退出并切回游客" variant="secondary" disabled={busy} onPress={() => void handle('logout')} />
      <View style={styles.section}>
        <Text style={styles.heading}>复制游客词库</Text>
        <Text style={styles.hint}>仅当当前账号在电脑上没有备份、手机账号词库为空时可复制。不会自动上传；复制后仍需手动备份。原游客资料会保留。</Text>
        {!copyConfirm ? <AppButton label="检查并复制游客词库" variant="secondary" disabled={busy || cards.length > 0} onPress={() => setCopyConfirm(true)} /> : <>
          <Text style={styles.hint}>确认将这台手机的游客词库复制到当前账号？请先核对当前登录的用户名。</Text>
          <AppButton label="确认复制" disabled={busy} onPress={() => void handle('copy')} />
          <AppButton label="取消" variant="quiet" onPress={() => setCopyConfirm(false)} />
        </>}
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>昵称</Text>
        <AppTextField label="显示昵称" value={displayName} onChangeText={(value) => { setDisplayName(value); clearField('displayName'); }} maxLength={40} helperText={DISPLAY_NAME_RULE} error={fieldErrors.displayName} />
        <AppButton label="保存昵称" variant="secondary" disabled={busy} onPress={() => void handle('rename')} />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>修改密码</Text>
        <AppTextField label="当前密码" value={oldPassword} onChangeText={(value) => { setOldPassword(value); clearField('oldPassword'); }} secureTextEntry error={fieldErrors.oldPassword} />
        <AppTextField label="新密码" value={password} onChangeText={(value) => { setPassword(value); clearField('password'); }} secureTextEntry autoCapitalize="none" autoCorrect={false} helperText={PASSWORD_RULE} error={fieldErrors.password} />
        <Text style={styles.hint}>修改后所有设备都要重新登录。</Text>
        <AppButton label="修改密码" variant="secondary" disabled={busy} onPress={() => void handle('password')} />
      </View>
    </> : <>
      {session ? <AppButton label="返回当前账号" compact variant="quiet" onPress={() => setSwitching(false)} style={styles.back} /> : null}
      <View style={styles.modes}>
        {(['login', 'register', 'reset'] as const).map((item) => <AppButton key={item} compact label={{ login: '登录', register: '注册', reset: '重置密码' }[item]} variant={mode === item ? 'primary' : 'secondary'} onPress={() => { setMode(item); setPassword(''); if (item === 'register' && session) setDisplayName(''); setFieldErrors({}); setError(''); }} />)}
      </View>
      <AppTextField label="电脑地址" placeholder="192.168.1.20:3001" value={address} onChangeText={(value) => { setAddress(value); clearField('address'); }} autoCapitalize="none" keyboardType="url" helperText="填写电脑在同一局域网下的 IP 和端口；连接自动使用 HTTPS。" error={fieldErrors.address} />
      {mode !== 'reset' ? <AppTextField label="用户名" value={username} onChangeText={(value) => { setUsername(value); clearField('username'); }} autoCapitalize="none" autoCorrect={false} helperText={USERNAME_RULE} error={fieldErrors.username} /> : null}
      {mode === 'register' ? <>
        <AppTextField label="邀请码" value={invitation} onChangeText={(value) => { setInvitation(value); clearField('invitation'); }} autoCapitalize="none" autoCorrect={false} helperText={INVITATION_RULE} error={fieldErrors.invitation} />
        <AppTextField label="显示昵称" value={displayName} onChangeText={(value) => { setDisplayName(value); clearField('displayName'); }} maxLength={40} helperText={DISPLAY_NAME_RULE} error={fieldErrors.displayName} />
      </> : null}
      {mode === 'reset' ? <AppTextField label="重置凭据" value={resetToken} onChangeText={(value) => { setResetToken(value); clearField('resetToken'); }} autoCapitalize="none" autoCorrect={false} helperText={RESET_TOKEN_RULE} error={fieldErrors.resetToken} /> : null}
      <AppTextField label={mode === 'reset' ? '新密码' : '密码'} value={password} onChangeText={(value) => { setPassword(value); clearField('password'); }} secureTextEntry autoCapitalize="none" autoCorrect={false} helperText={PASSWORD_RULE} error={fieldErrors.password} />
      <Text style={styles.hint}>账号属于这台电脑的局域网服务。首次登录需连接电脑；之后已保存的词库可离线学习。</Text>
      <AppButton label={busy ? '处理中…' : mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : '重置密码'} disabled={busy} onPress={() => void submit()} />
    </>}
    {message ? <Text accessibilityRole="alert" style={styles.success}>{message}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.xl, gap: spacing.md, paddingBottom: 48 },
  back: { alignSelf: 'flex-start' }, title: { color: colors.ink, fontSize: 28, fontWeight: '800' },
  summary: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  success: { color: colors.primary, fontSize: 14 }, error: { color: colors.danger, fontSize: 14 },
});
