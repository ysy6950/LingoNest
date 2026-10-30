import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { colors, radius, spacing } from '../../components/theme';
import { isReviewDue } from '../../reviewScheduler';
import { useLingoStore } from '../../store/useLingoStore';

export default function ReviewScreen() {
  const cards = useLingoStore((state) => state.cards);
  const reviews = useLingoStore((state) => state.reviews);
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []));
  const dueCards = cards.filter((card) => isReviewDue(reviews[card.id], now));
  const futureTimes = cards.map((card) => reviews[card.id]?.dueAt).filter((dueAt): dueAt is number => typeof dueAt === 'number' && dueAt > now);
  const nextDueAt = futureTimes.length ? Math.min(...futureTimes) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>REVIEW YOUR WORDS</Text>
        <Text style={styles.title}>复习</Text>
        <Text style={styles.subtitle}>一张一张来，让记忆慢慢变牢。</Text>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>现在待复习</Text>
          <Text style={styles.heroCount}>{dueCards.length}<Text style={styles.heroUnit}> 张</Text></Text>
          <Text style={styles.heroDescription}>{dueCards.length ? '看完解释后，告诉 LingoNest 你记得多少。' : '做得好，目前没有到期的单词卡。'}</Text>
          <AppButton label={dueCards.length ? '开始复习 →' : '暂时没有待复习卡片'} variant="secondary" onPress={() => router.push('/review-session')} disabled={dueCards.length === 0} style={styles.startButton} />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>复习如何安排？</Text>
          <Text style={styles.infoBody}>新单词会进入复习队列。记住后，间隔逐步延长为 1、3、7、14、30 天；忘记了，10 分钟后再练一次。</Text>
        </View>
        {dueCards.length === 0 && nextDueAt !== null ? (
          <Text style={styles.nextDue}>下一张预计在 {new Date(nextDueAt).toLocaleString('zh-CN')} 到期</Text>
        ) : null}
        <View style={styles.practice}>
          <Text style={styles.infoTitle}>AI 语境练习</Text>
          <AppButton label="开始语境选词" variant="secondary" onPress={() => router.push('/exercises')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.xl, paddingTop: 32, paddingBottom: 48 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }, title: { color: colors.ink, fontSize: 34, fontWeight: '800', marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 7 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.card, padding: 26, marginTop: 30 },
  heroLabel: { color: '#D5EBE0', fontSize: 14, fontWeight: '700' }, heroCount: { color: colors.white, fontSize: 68, fontWeight: '800', marginTop: 10 }, heroUnit: { fontSize: 21, fontWeight: '600' },
  heroDescription: { color: '#E4F2E9', fontSize: 14, lineHeight: 21, marginTop: 8 }, startButton: { backgroundColor: colors.surface, marginTop: 24 },
  infoCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, padding: 20, marginTop: 18 },
  infoTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' }, infoBody: { color: colors.inkSoft, fontSize: 14, lineHeight: 23, marginTop: 8 },
  nextDue: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 18 },
  practice: { borderTopWidth: 1, borderColor: colors.border, marginTop: spacing.xxl, paddingTop: spacing.xl, gap: spacing.md },
});
