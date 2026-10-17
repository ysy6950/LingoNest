import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useLingoStore } from '../store/useLingoStore';
import { colors } from '../components/theme';

export default function RootLayout() {
  const hydrate = useLingoStore((state) => state.hydrate);
  const isHydrated = useLingoStore((state) => state.isHydrated);
  const isHydrating = useLingoStore((state) => state.isHydrating);
  const error = useLingoStore((state) => state.error);
  const isSaving = useLingoStore((state) => state.isSaving);
  const isRestoring = useLingoStore((state) => state.isRestoring);
  const retrySave = useLingoStore((state) => state.retrySave);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        {isHydrating || !error ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        <Text style={{ marginTop: 16, color: colors.muted }}>{error ? '暂时无法打开单词本' : '正在打开你的单词本…'}</Text>
        {error ? <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text> : null}
        {error ? <Pressable onPress={() => void hydrate()} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12, marginTop: 20 }}><Text style={{ color: colors.white, fontWeight: '700' }}>重试读取</Text></Pressable> : null}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="groups/[id]" />
        <Stack.Screen name="cards/[id]" />
        <Stack.Screen name="review-session" />
        <Stack.Screen name="local-server" />
        <Stack.Screen name="local-backup" />
      </Stack>
      {error ? (
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={{ marginHorizontal: 14, marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderWidth: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: colors.danger, flex: 1, fontSize: 13, lineHeight: 18 }}>{error} 关闭应用前请重试。</Text>
            <Pressable disabled={isSaving} onPress={() => void retrySave()} accessibilityLabel="重试保存" style={{ marginLeft: 12, paddingVertical: 6, paddingHorizontal: 10 }}>
              <Text style={{ color: colors.danger, fontWeight: '800' }}>{isSaving ? '重试中' : '重试'}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
      {isRestoring ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245, 247, 244, 0.92)' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 16, color: colors.ink }}>正在安全恢复本地单词…</Text>
        </View>
      ) : null}
    </View>
    </SafeAreaProvider>
  );
}
