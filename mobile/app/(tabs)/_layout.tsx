import { Tabs } from 'expo-router';
import { Text, View, type ColorValue } from 'react-native';
import { colors } from '../../components/theme';

const tabIcons: Record<string, string> = {
  index: '＋',
  groups: '▦',
  review: '◎',
  stats: '▥',
};

function ProfileTabIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 24, height: 26, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: color }} />
    <View style={{ width: 18, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 2, borderBottomWidth: 0, borderColor: color, marginTop: 3 }} />
  </View>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color }) => route.name === 'me'
          ? <ProfileTabIcon color={color} />
          : <Text style={{ color, fontSize: 23, lineHeight: 26 }}>{tabIcons[route.name]}</Text>,
      })}
    >
      <Tabs.Screen name="index" options={{ title: '添加' }} />
      <Tabs.Screen name="groups" options={{ title: '单词组' }} />
      <Tabs.Screen name="review" options={{ title: '复习' }} />
      <Tabs.Screen name="stats" options={{ title: '统计' }} />
      <Tabs.Screen name="me" options={{ title: '我的' }} />
    </Tabs>
  );
}
