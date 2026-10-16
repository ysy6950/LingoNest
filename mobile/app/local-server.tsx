import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { AppTextField } from '../components/AppTextField';
import { colors, spacing } from '../components/theme';
import { checkLocalServer, type HealthResult } from '../localServer/health';

const messages: Record<HealthResult['kind'], string> = {
  ok: '连接成功。手机收到了电脑服务的响应。',
  'invalid-address': '请输入电脑的私有局域网 IPv4 地址，例如 192.168.1.20。',
  timeout: '连接超时。请检查服务是否运行、IP 是否正确，以及手机与电脑是否在同一网络。',
  unreachable: '无法连接电脑。请检查局域网、防火墙和服务监听地址；当前 Expo Go 也可能不允许此 HTTP 请求。',
  'unexpected-response': '已收到响应，但它不是 LingoNest 健康检查结果。请核对端口。',
};

export default function LocalServerScreen() {
  const [address, setAddress] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);

  async function check() {
    if (checking) return;
    setChecking(true);
    setResult(null);
    try {
      setResult(await checkLocalServer(address));
    } finally {
      setChecking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppButton label="返回统计" variant="quiet" compact onPress={() => router.back()} style={styles.back} />
        <Text style={styles.title}>电脑连接检查</Text>
        <Text style={styles.detail}>输入运行本地服务的电脑 IP。这里只检查连接，不会读取或上传手机单词。</Text>
        <AppTextField
          label="电脑的局域网 IPv4 地址"
          placeholder="例如 192.168.1.20"
          value={address}
          editable={!checking}
          onChangeText={(value) => { setAddress(value); setResult(null); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          helperText="如果服务端口不是 3000，可输入 192.168.1.20:3001。"
        />
        <AppButton label={checking ? '检查中…' : '检查连接'} disabled={checking} onPress={() => void check()} />
        {result ? (
          <View style={[styles.result, result.kind === 'ok' ? styles.success : styles.failure]}>
            <Text accessibilityRole="alert" style={result.kind === 'ok' ? styles.successText : styles.failureText}>
              {messages[result.kind]}
            </Text>
          </View>
        ) : null}
        <Text style={styles.note}>服务只用于开发测试。电脑关机或离开同一网络时，本机单词和复习仍可正常使用。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.lg },
  back: { alignSelf: 'flex-start' },
  title: { color: colors.ink, fontSize: 25, fontWeight: '800' },
  detail: { color: colors.inkSoft, fontSize: 14, lineHeight: 22 },
  result: { padding: spacing.lg, borderWidth: 1 },
  success: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  failure: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  successText: { color: colors.primary, lineHeight: 21 },
  failureText: { color: colors.danger, lineHeight: 21 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: spacing.md },
});
