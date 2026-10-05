import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { FlipCard } from '../../components/FlipCard';
import { colors, radius, spacing } from '../../components/theme';
import { isReviewDue } from '../../reviewScheduler';
import { useLingoStore } from '../../store/useLingoStore';

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardId = Number(id);
  const cards = useLingoStore((state) => state.cards);
  const groups = useLingoStore((state) => state.groups);
  const reviews = useLingoStore((state) => state.reviews);
  const editCard = useLingoStore((state) => state.editCard);
  const deleteCard = useLingoStore((state) => state.deleteCard);
  const moveCard = useLingoStore((state) => state.moveCard);
  const card = cards.find((item) => item.id === cardId);
  const group = groups.find((item) => item.id === card?.groupId);
  const review = reviews[cardId];
  const [revealed, setRevealed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [draftWord, setDraftWord] = useState('');
  const [draftMeaning, setDraftMeaning] = useState('');
  const [editError, setEditError] = useState('');

  function openEdit() {
    if (!card) return;
    setDraftWord(card.word); setDraftMeaning(card.meaning); setEditError(''); setEditOpen(true);
  }

  function saveEdit() {
    if (!editCard(cardId, draftWord, draftMeaning)) {
      setEditError('单词和解释都不能为空。');
      return;
    }
    setEditOpen(false);
    setRevealed(false);
  }

  function confirmDelete() {
    Alert.alert('删除单词卡', `确定删除「${card?.word}」吗？此操作无法恢复。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { deleteCard(cardId); router.back(); } },
    ]);
  }

  if (!card) {
    return <SafeAreaView style={styles.safe}><View style={styles.missing}><Text style={styles.title}>单词卡不存在</Text><AppButton label="返回" onPress={() => router.back()} style={styles.missingButton} /></View></SafeAreaView>;
  }

  const due = review ? isReviewDue(review, Date.now()) : true;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityLabel="返回"><Text style={styles.back}>← 返回</Text></Pressable>
        <Text style={styles.eyebrow}>WORD CARD</Text>
        <Text style={styles.title}>单词卡</Text>
        <Text style={styles.subtitle}>收录于「{group?.name ?? '未知分组'}」</Text>
        <FlipCard word={card.word} meaning={card.meaning} revealed={revealed} onRevealChange={setRevealed} style={styles.flipCard} />

        <View style={styles.statusCard}>
          <View style={[styles.statusDot, due && styles.statusDotDue]} />
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>{due ? '等待复习' : '下次复习已安排'}</Text>
            <Text style={styles.statusHint}>
              {due ? '前往复习页巩固这个单词' : `预计 ${new Date(review.dueAt).toLocaleString('zh-CN')}`}
            </Text>
          </View>
        </View>

        <Text style={styles.actionsTitle}>管理这张卡片</Text>
        <View style={styles.actionRow}>
          <AppButton label="修改" variant="secondary" onPress={openEdit} style={styles.actionButton} />
          <AppButton label="移动分组" variant="secondary" onPress={() => setMoveOpen(true)} style={styles.actionButton} />
        </View>
        <AppButton label="删除单词卡" variant="danger" onPress={confirmDelete} style={styles.deleteButton} />
      </ScrollView>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.backdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>修改单词卡</Text>
          <AppTextField label="单词" value={draftWord} onChangeText={setDraftWord} autoCapitalize="none" />
          <AppTextField label="解释" value={draftMeaning} onChangeText={setDraftMeaning} multiline error={editError} />
          <AppButton label="保存修改" onPress={saveEdit} />
          <AppButton label="取消" variant="secondary" onPress={() => setEditOpen(false)} />
        </View></View>
      </Modal>

      <Modal visible={moveOpen} transparent animationType="fade" onRequestClose={() => setMoveOpen(false)}>
        <View style={styles.backdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>移动到单词组</Text>
          <ScrollView style={styles.optionScroll} contentContainerStyle={styles.optionContent}>
            {groups.map((item) => (
              <Pressable key={item.id} style={[styles.groupOption, item.id === card.groupId && styles.groupOptionActive]} onPress={() => { moveCard(cardId, item.id); setMoveOpen(false); }}>
                <Text style={styles.groupOptionText}>{item.name}</Text>
                {item.id === card.groupId ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
          <AppButton label="取消" variant="secondary" onPress={() => setMoveOpen(false)} />
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 48 },
  back: { color: colors.primary, fontSize: 14, fontWeight: '700', marginBottom: 28 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800', marginTop: 7 }, subtitle: { color: colors.muted, fontSize: 14, marginTop: 5 },
  flipCard: { marginTop: 26 }, statusCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginTop: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }, statusDotDue: { backgroundColor: colors.accent },
  statusText: { marginLeft: 12, flex: 1 }, statusTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, statusHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  actionsTitle: { color: colors.inkSoft, fontSize: 13, fontWeight: '700', marginTop: 30, marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 10 }, actionButton: { flex: 1 }, deleteButton: { marginTop: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 36, 31, 0.38)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, gap: spacing.lg },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  groupOption: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  groupOptionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, groupOptionText: { color: colors.ink, fontSize: 16 }, check: { color: colors.primary },
  optionScroll: { maxHeight: 320 }, optionContent: { gap: spacing.sm },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' }, missingButton: { marginTop: 20 },
});
