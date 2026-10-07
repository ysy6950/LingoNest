import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getVisibleGroupCards, type CardSortMode } from '../../cardCollection';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { FlipCard } from '../../components/FlipCard';
import { SwipeableCard } from '../../components/SwipeableCard';
import { colors, radius, spacing } from '../../components/theme';
import { isReviewDue } from '../../reviewScheduler';
import { useLingoStore } from '../../store/useLingoStore';

type MenuPage = 'manage' | 'edit' | 'move' | 'delete' | null;

export default function CardDetailScreen() {
  const { id, sort = 'newest' } = useLocalSearchParams<{
    id: string;
    sort?: string;
  }>();
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
  const [face, setFace] = useState({ cardId, revealed: false });
  const revealed = face.cardId === cardId && face.revealed;
  const ignoreFlipUntil = useRef(0);
  const focusedRef = useRef(false);
  const [menuPage, setMenuPage] = useState<MenuPage>(null);
  const [draftWord, setDraftWord] = useState('');
  const [draftMeaning, setDraftMeaning] = useState('');
  const [editError, setEditError] = useState('');

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    return () => { focusedRef.current = false; };
  }, []));

  const sortMode: CardSortMode = sort === 'az' || sort === 'due' ? sort : 'newest';
  // Search filters the grid only; browsing always includes this entire group.
  const siblings = card ? getVisibleGroupCards(cards, card.groupId, reviews, '', sortMode) : [];
  const currentIndex = siblings.findIndex((item) => item.id === cardId);
  const previous = currentIndex > 0 ? siblings[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? siblings[currentIndex + 1] : undefined;

  function showCard(nextId: number) {
    if (!focusedRef.current) return;
    setMenuPage(null);
    router.setParams({ id: String(nextId) });
  }

  function openEdit() {
    if (!card) return;
    setDraftWord(card.word);
    setDraftMeaning(card.meaning);
    setEditError('');
    setMenuPage('edit');
  }

  function saveEdit() {
    if (!editCard(cardId, draftWord, draftMeaning)) {
      setEditError('单词和解释都不能为空。');
      return;
    }
    setMenuPage(null);
    setFace({ cardId, revealed: false });
  }

  function removeCard() {
    deleteCard(cardId);
    setMenuPage(null);
    router.back();
  }

  if (!card) {
    return <SafeAreaView style={styles.safe}><View style={styles.missing}><Text style={styles.title}>单词卡不存在</Text><AppButton label="返回" onPress={() => router.back()} style={styles.missingButton} /></View></SafeAreaView>;
  }

  const due = review ? isReviewDue(review, Date.now()) : true;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} accessibilityLabel="返回" style={styles.topAction}><Text style={styles.back}>← 返回</Text></Pressable>
          <Pressable onPress={() => setMenuPage('manage')} accessibilityRole="button" accessibilityLabel="管理单词卡" style={styles.manageButton}>
            <Text style={styles.manageText}>管理 ···</Text>
          </Pressable>
        </View>
        <Text style={styles.eyebrow}>WORD CARD</Text>
        <Text style={styles.title}>单词卡</Text>
        <Text style={styles.subtitle}>收录于「{group?.name ?? '未知分组'}」</Text>
        <SwipeableCard
          cardKey={cardId}
          onSwipeLeft={next ? () => showCard(next.id) : undefined}
          onSwipeRight={previous ? () => showCard(previous.id) : undefined}
          onSwipeStart={() => { ignoreFlipUntil.current = Date.now() + 450; }}
          style={styles.flipCard}
        >
          <FlipCard
            key={cardId}
            word={card.word}
            meaning={card.meaning}
            revealed={revealed}
            onRevealChange={(value) => {
              if (Date.now() >= ignoreFlipUntil.current) setFace({ cardId, revealed: value });
            }}
          />
        </SwipeableCard>
        <View style={styles.browseRow}>
          <Pressable onPress={() => previous && showCard(previous.id)} disabled={!previous} accessibilityRole="button" accessibilityLabel="上一张单词卡" style={[styles.browseButton, !previous && styles.browseButtonDisabled]}>
            <Text style={[styles.browseArrow, !previous && styles.browseArrowDisabled]}>←</Text>
          </Pressable>
          <View style={styles.browseCenter}>
            <Text style={styles.browseCount}>{currentIndex + 1} / {siblings.length}</Text>
            <Text style={styles.browseHint}>左右滑动切换 · 轻点翻面</Text>
          </View>
          <Pressable onPress={() => next && showCard(next.id)} disabled={!next} accessibilityRole="button" accessibilityLabel="下一张单词卡" style={[styles.browseButton, !next && styles.browseButtonDisabled]}>
            <Text style={[styles.browseArrow, !next && styles.browseArrowDisabled]}>→</Text>
          </Pressable>
        </View>

        <View style={styles.statusCard}>
          <View style={[styles.statusDot, due && styles.statusDotDue]} />
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>{due ? '等待复习' : '下次复习已安排'}</Text>
            <Text style={styles.statusHint}>
              {due ? '前往复习页巩固这个单词' : `预计 ${new Date(review.dueAt).toLocaleString('zh-CN')}`}
            </Text>
          </View>
        </View>

      </ScrollView>

      <Modal visible={menuPage !== null} transparent animationType="fade" onRequestClose={() => setMenuPage(null)}>
        <View style={styles.backdrop}>
          <ScrollView contentContainerStyle={styles.modalContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              {menuPage === 'manage' ? <>
                <Text style={styles.modalTitle}>管理「{card.word}」</Text>
                <AppButton label="修改单词卡" variant="secondary" onPress={openEdit} />
                <AppButton label="移动分组" variant="secondary" onPress={() => setMenuPage('move')} />
                <AppButton label="删除单词卡" variant="danger" onPress={() => setMenuPage('delete')} />
              </> : null}
              {menuPage === 'edit' ? <>
                <Text style={styles.modalTitle}>修改单词卡</Text>
                <AppTextField label="单词" value={draftWord} onChangeText={setDraftWord} autoCapitalize="none" />
                <AppTextField label="解释" value={draftMeaning} onChangeText={setDraftMeaning} multiline error={editError} />
                <AppButton label="保存修改" onPress={saveEdit} />
              </> : null}
              {menuPage === 'move' ? <>
                <Text style={styles.modalTitle}>移动到单词组</Text>
                <ScrollView style={styles.optionScroll} contentContainerStyle={styles.optionContent}>
                  {groups.map((item) => (
                    <Pressable key={item.id} style={[styles.groupOption, item.id === card.groupId && styles.groupOptionActive]} onPress={() => { moveCard(cardId, item.id); setMenuPage(null); }}>
                      <Text style={styles.groupOptionText}>{item.name}</Text>
                      {item.id === card.groupId ? <Text style={styles.check}>✓</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </> : null}
              {menuPage === 'delete' ? <>
                <Text style={styles.modalTitle}>删除单词卡？</Text>
                <Text style={styles.deleteDescription}>确定删除「{card.word}」吗？此操作无法恢复。</Text>
                <AppButton label="确认删除" variant="danger" onPress={removeCard} />
              </> : null}
              <AppButton label="取消" variant="secondary" onPress={() => setMenuPage(null)} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 48 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  topAction: { minHeight: 40, justifyContent: 'center' }, back: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  manageButton: { borderRadius: radius.pill, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  manageText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800', marginTop: 7 }, subtitle: { color: colors.muted, fontSize: 14, marginTop: 5 },
  flipCard: { marginTop: 26 },
  browseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  browseButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  browseButtonDisabled: { opacity: 0.4 }, browseArrow: { color: colors.primary, fontSize: 21 }, browseArrowDisabled: { color: colors.muted },
  browseCenter: { alignItems: 'center' }, browseCount: { color: colors.ink, fontSize: 14, fontWeight: '700' }, browseHint: { color: colors.muted, fontSize: 11, marginTop: 3 },
  statusCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginTop: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }, statusDotDue: { backgroundColor: colors.accent },
  statusText: { marginLeft: 12, flex: 1 }, statusTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, statusHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 36, 31, 0.38)' },
  modalContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, gap: spacing.lg },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  deleteDescription: { color: colors.inkSoft, fontSize: 15, lineHeight: 22 },
  groupOption: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  groupOptionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, groupOptionText: { color: colors.ink, fontSize: 16 }, check: { color: colors.primary },
  optionScroll: { maxHeight: 320 }, optionContent: { gap: spacing.sm },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' }, missingButton: { marginTop: 20 },
});
