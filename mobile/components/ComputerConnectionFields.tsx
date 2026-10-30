import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useComputerConnection } from '../store/useComputerConnection';
import { AppButton } from './AppButton';
import { AppTextField } from './AppTextField';
import { colors, spacing } from './theme';

export function ComputerConnectionFields({ disabled = false }: { disabled?: boolean }) {
  const connection = useComputerConnection();
  useEffect(() => { void connection.hydrate(); }, [connection.hydrate]);

  return <View style={styles.container}>
    {connection.paired ? <>
      <Text style={styles.connected}>已配对 · {connection.address}</Text>
      <Text style={styles.hint}>AI、词典和备份共用此连接。</Text>
      <AppButton label="更换或断开连接" compact variant="quiet" disabled={disabled} onPress={connection.disconnect} />
    </> : <>
      <AppTextField label="电脑 IP 和端口" placeholder="例如 192.168.1.20:3001" value={connection.address}
        editable={!disabled} autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={connection.setAddress} />
      <AppTextField label="临时配对码" placeholder="粘贴电脑终端显示的配对码" value={connection.token}
        editable={!disabled} autoCapitalize="none" autoCorrect={false} secureTextEntry onChangeText={connection.setToken}
        helperText="操作成功后全 App 复用。地址会记住；重开 App 或电脑服务重启后需重新配对。" />
    </>}
    {!connection.addressSaved ? <Text style={styles.hint}>地址暂未保存，当前连接仍可使用。</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  connected: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
