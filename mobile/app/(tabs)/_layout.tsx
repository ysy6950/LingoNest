import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../components/theme';

const tabIcons: Record<string, string> = {
  index: '＋',
  groups: '▦',
  review: '◎',
  stats: '▥',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { height: 62, paddingTop: 7, paddingBottom: 7, backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23, lineHeight: 26 }}>{tabIcons[route.name]}</Text>,
      })}
    >
      <Tabs.Screen name="index" options={{ title: '添加' }} />
      <Tabs.Screen name="groups" options={{ title: '单词组' }} />
      <Tabs.Screen name="review" options={{ title: '复习' }} />
      <Tabs.Screen name="stats" options={{ title: '统计' }} />
    </Tabs>
  );
}
