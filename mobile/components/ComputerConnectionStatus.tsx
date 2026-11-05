import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useComputerConnection } from '../store/useComputerConnection';
import { useAccountSession } from '../store/useAccountSession';
import { AppButton } from './AppButton';
import { colors, spacing } from './theme';

export function ComputerConnectionStatus() {
  const paired = useComputerConnection((state) => state.paired);
  const address = useComputerConnection((state) => state.address);
  const account = useAccountSession((state) => state.active);
  return <View style={styles.container}>
    <Text style={paired ? styles.connected : styles.disconnected}>{account ? paired ? `已登录 · ${account.account.displayName}` : `需重新登录 · ${account.account.displayName}` : paired ? '本次已配对 · ' + address : '尚未配对电脑'}</Text>
    {!paired ? <Text style={styles.hint}>{account ? '本机词库仍可离线使用；重新登录后恢复电脑功能。' : '请先在设置中输入电脑地址和临时配对码。配对后各功能共用这次连接。'}</Text> : null}
    <AppButton label={account ? '前往账号' : paired ? '查看连接设置' : '前往设置连接'} compact variant="secondary" onPress={() => router.push(account ? '/account' : '/settings')} />
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm }, connected: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  disconnected: { color: colors.inkSoft, fontSize: 14, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
});
