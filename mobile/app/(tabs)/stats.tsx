import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { colors, radius, spacing } from '../../components/theme';
import { isReviewDue } from '../../reviewScheduler';
import { useLingoStore } from '../../store/useLingoStore';

export default function StatsScreen() {
  const cards = useLingoStore((state) => state.cards);
  const groups = useLingoStore((state) => state.groups);
  const reviews = useLingoStore((state) => state.reviews);
  const now = Date.now();
  const due = cards.filter((card) => isReviewDue(reviews[card.id], now)).length;
  const reviewed = cards.filter((card) => (reviews[card.id]?.reviewCount ?? 0) > 0).length;
  const totalAnswers = cards.reduce((sum, card) => sum + (reviews[card.id]?.reviewCount ?? 0), 0);
  const today = new Date(now);
  const todayReviewed = cards.filter((card) => {
    const at = reviews[card.id]?.lastReviewedAt;
    if (!at) return false;
    const date = new Date(at);
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  }).length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR PROGRESS</Text>
        <Text style={styles.title}>学习统计</Text>
        <Text style={styles.subtitle}>每一次记录和复习，都在留下进步。</Text>
        <View style={styles.grid}>
          <StatTile value={cards.length} label="收录单词" />
          <StatTile value={groups.length} label="单词组" />
          <StatTile value={due} label="当前待复习" />
          <StatTile value={todayReviewed} label="今日复习卡片" />
        </View>
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>复习概览</Text>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>至少复习过一次的卡片</Text><Text style={styles.detailValue}>{reviewed}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>累计反馈次数</Text><Text style={styles.detailValue}>{totalAnswers}</Text></View>
          <Text style={styles.detailHint}>“今日复习卡片”按设备本地日期计算，同一张卡在一天内复习多次只计一张。</Text>
        </View>
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>保护学习记录</Text>
          <Text style={styles.detailHint}>主动备份到自己的电脑，或从电脑恢复单词和复习进度。平时继续离线学习。</Text>
          <AppButton label="电脑备份与恢复" variant="secondary" onPress={() => router.push('/local-backup')} style={styles.backupButton} />
          <AppButton label="检查电脑连接" variant="quiet" compact onPress={() => router.push('/local-server')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return <View style={styles.tile}><Text style={styles.tileValue}>{value}</Text><Text style={styles.tileLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.xl, paddingTop: 32, paddingBottom: 48 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }, title: { color: colors.ink, fontSize: 34, fontWeight: '800', marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 30 },
  tile: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, flexBasis: '46%', flexGrow: 1, padding: 18 },
  tileValue: { color: colors.primary, fontSize: 33, fontWeight: '800' }, tileLabel: { color: colors.muted, fontSize: 13, marginTop: 4 },
  detailCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, marginTop: 18 },
  detailTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }, detailLabel: { color: colors.inkSoft, fontSize: 14 }, detailValue: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  detailHint: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 12 },
  backupButton: { marginTop: 16 },
});
