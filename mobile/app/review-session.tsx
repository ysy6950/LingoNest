import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { FlipCard } from '../components/FlipCard';
import { colors, radius, spacing } from '../components/theme';
import { isReviewDue, type ReviewResult } from '../reviewScheduler';
import { useLingoStore } from '../store/useLingoStore';

export default function ReviewSessionScreen() {
  const cards = useLingoStore((state) => state.cards);
  const reviews = useLingoStore((state) => state.reviews);
  const answerReview = useLingoStore((state) => state.answerReview);
  // Snapshot the queue once. A missed word may become due again later, but it
  // should never jump back into the current session unexpectedly.
  const [queue] = useState(() => cards.filter((card) => isReviewDue(reviews[card.id], Date.now())).map((card) => card.id));
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState({ again: 0, hard: 0, remembered: 0 });
  const current = cards.find((card) => card.id === queue[cursor]);
  const done = cursor >= queue.length || !current;

  function answer(result: ReviewResult) {
    if (!current || !revealed) return;
    answerReview(current.id, result);
    setCounts((value) => ({ ...value, [result]: value[result] + 1 }));
    setRevealed(false);
    setCursor((value) => value + 1);
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.summary}>
          <Text style={styles.summaryIcon}>✓</Text>
          <Text style={styles.summaryTitle}>{queue.length ? '本次复习完成' : '目前没有待复习卡片'}</Text>
          <Text style={styles.summaryText}>{queue.length ? `完成 ${cursor} 张 · 记住 ${counts.remembered} 张 · 模糊 ${counts.hard} 张 · 再来一次 ${counts.again} 张` : '稍后回来看看，或先添加一个新单词。'}</Text>
          <AppButton label="返回复习页" onPress={() => router.back()} style={styles.summaryButton} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityLabel="结束复习并返回"><Text style={styles.back}>← 结束本次复习</Text></Pressable>
        <View style={styles.progressRow}><Text style={styles.progressLabel}>当前进度</Text><Text style={styles.progressCount}>{cursor + 1} / {queue.length}</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(cursor / queue.length) * 100}%` }]} /></View>
        <Text style={styles.prompt}>{revealed ? '你记得这个单词吗？' : '先想一想它的意思，再翻面查看。'}</Text>
        <FlipCard key={current.id} word={current.word} meaning={current.meaning} revealed={revealed} onRevealChange={setRevealed} style={styles.flipCard} />
        {revealed ? (
          <View style={styles.answers}>
            <AppButton label="再来一次" variant="danger" onPress={() => answer('again')} style={styles.answerButton} />
            <AppButton label="有点模糊" variant="secondary" onPress={() => answer('hard')} style={styles.answerButton} />
            <AppButton label="记住了" onPress={() => answer('remembered')} style={styles.answerButton} />
          </View>
        ) : <Text style={styles.flipPrompt}>轻点卡片翻面后选择结果</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 48, flexGrow: 1 },
  back: { color: colors.primary, fontSize: 14, fontWeight: '700', marginBottom: 32 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' }, progressLabel: { color: colors.muted, fontSize: 13 }, progressCount: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  progressTrack: { backgroundColor: colors.border, height: 6, borderRadius: 3, marginTop: 10 }, progressFill: { backgroundColor: colors.primary, height: 6, borderRadius: 3 },
  prompt: { color: colors.ink, fontSize: 19, fontWeight: '700', marginTop: 40, marginBottom: 18 }, flipCard: { minHeight: 300 },
  answers: { gap: 10, marginTop: 30 }, answerButton: { width: '100%' }, flipPrompt: { color: colors.muted, textAlign: 'center', fontSize: 13, marginTop: 24 },
  summary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  summaryIcon: { backgroundColor: colors.primarySoft, color: colors.primary, width: 70, height: 70, borderRadius: 35, textAlign: 'center', textAlignVertical: 'center', fontSize: 32, fontWeight: '800' },
  summaryTitle: { color: colors.ink, fontSize: 27, fontWeight: '800', marginTop: 24 }, summaryText: { color: colors.muted, textAlign: 'center', fontSize: 15, lineHeight: 23, marginTop: 12 }, summaryButton: { alignSelf: 'stretch', marginTop: 30 },
});
