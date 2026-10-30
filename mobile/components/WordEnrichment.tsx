import { useState } from 'react';
import { router } from 'expo-router';
import { Modal, StyleSheet, Switch, Text, View } from 'react-native';
import { ENRICHMENT_KINDS, needsEnrichment, useAutoEnrichment } from '../store/useAutoEnrichment';
import { useComputerConnection } from '../store/useComputerConnection';
import type { WordCard } from '../store/useLingoStore';
import { AppButton } from './AppButton';
import { colors, spacing } from './theme';

export function WordEnrichment({ card }: { card: WordCard }) {
  const queue = useAutoEnrichment();
  const paired = useComputerConnection((state) => state.paired);
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState({ dictionary: true, ai: true });
  const job = queue.jobs.find((item) => item.cardId === card.id);
  const missing = ENRICHMENT_KINDS.filter((kind) => needsEnrichment(card, kind));
  if (!job && !missing.length && !queue.error) return null;

  return <View style={styles.section}>
    <View style={styles.headingRow}>
      <Text style={styles.heading}>资料补全</Text>
      {missing.length && !job ? <AppButton label="补全缺失资料" compact variant="secondary" disabled={!queue.isHydrated}
        onPress={() => { setSelected({ dictionary: true, ai: true }); setConfirming(true); }} /> : null}
    </View>
    {job ? <>
      {ENRICHMENT_KINDS.map((kind) => job[kind] ? <Text key={kind} style={job[kind]?.status === 'failed' ? styles.error : styles.hint}>
        {kind === 'dictionary' ? '词典资料' : 'AI 笔记'} · {job[kind]?.status === 'running' ? '补全中…' : job[kind]?.status === 'failed' ? job[kind]?.error : paired ? '等待补全' : '等待连接电脑'}
      </Text> : null)}
      <View style={styles.actions}>
        {!paired ? <AppButton label="连接电脑" compact variant="secondary" onPress={() => router.push('/settings')} /> : null}
        {job.ai?.status === 'failed' || job.dictionary?.status === 'failed' ? <AppButton label="重试失败项" compact variant="secondary" onPress={() => queue.retry(card.id)} /> : null}
        <AppButton label="取消补全" compact variant="quiet" onPress={() => queue.remove(card.id)} />
      </View>
    </> : null}
    {queue.error ? <Text style={styles.error}>{queue.error}</Text> : null}
    <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
      <View style={styles.backdrop}><View style={styles.dialog}>
        <Text style={styles.heading}>补全「{card.word}」</Text>
        <Text style={styles.hint}>词典查询会发送这个单词；AI 会收到这个单词及你的解释。结果会自动保存，已有内容会保留，AI 内容可编辑或删除。</Text>
        {missing.map((kind) => <View key={kind} style={styles.headingRow}>
          <Text style={styles.option}>{kind === 'dictionary' ? '词典音标、词性和可用音频' : 'AI 解释与三条例句'}</Text>
          <Switch accessibilityLabel={kind === 'dictionary' ? '补全词典资料' : '补全 AI 笔记'} value={selected[kind]}
            trackColor={{ false: colors.border, true: colors.primary }}
            onValueChange={(value) => setSelected((current) => ({ ...current, [kind]: value }))} />
        </View>)}
        <AppButton label="确认补全" disabled={!missing.some((kind) => selected[kind])} onPress={() => {
          queue.enqueue(card, missing.filter((kind) => selected[kind]), false); setConfirming(false);
        }} />
        <AppButton label="取消" variant="secondary" onPress={() => setConfirming(false)} />
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.lg },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  heading: { color: colors.ink, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  option: { flex: 1, color: colors.inkSoft, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 }, error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(15, 36, 31, 0.38)' },
  dialog: { backgroundColor: colors.surface, padding: spacing.xl, borderRadius: 8, gap: spacing.lg, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
