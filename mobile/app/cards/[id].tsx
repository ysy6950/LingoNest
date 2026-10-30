import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getVisibleGroupCards, type CardSortMode } from '../../cardCollection';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { ComputerConnectionFields } from '../../components/ComputerConnectionFields';
import { useWordAudio } from '../../components/useWordAudio';
import { WordEnrichment } from '../../components/WordEnrichment';
import { withComputerConnection } from '../../store/useComputerConnection';
import { FlipCard } from '../../components/FlipCard';
import { SwipeableCard, type SwipeableCardHandle } from '../../components/SwipeableCard';
import { colors, radius, spacing } from '../../components/theme';
import { isReviewDue } from '../../reviewScheduler';
import { requestWordAnalysis } from '../../localServer/ai';
import { requestWordPronunciation } from '../../localServer/dictionary';
import { useLingoStore, type AiNote, type Pronunciation } from '../../store/useLingoStore';

type MenuPage = 'manage' | 'edit' | 'move' | 'delete' | 'ai' | 'edit-ai' | 'delete-ai' | 'pronunciation' | null;
type AiPreview = { sourceWord: string; sourceMeaning: string; note: AiNote };
type PronunciationPreview = { sourceWord: string; value: Pronunciation };

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
  const saveAiNote = useLingoStore((state) => state.saveAiNote);
  const removeAiNote = useLingoStore((state) => state.removeAiNote);
  const savePronunciation = useLingoStore((state) => state.savePronunciation);
  const deleteCard = useLingoStore((state) => state.deleteCard);
  const moveCard = useLingoStore((state) => state.moveCard);
  const card = cards.find((item) => item.id === cardId);
  const group = groups.find((item) => item.id === card?.groupId);
  const review = reviews[cardId];
  const [face, setFace] = useState({ cardId, revealed: false });
  const revealed = face.cardId === cardId && face.revealed;
  const ignoreFlipUntil = useRef(0);
  const focusedRef = useRef(false);
  const swipeableRef = useRef<SwipeableCardHandle>(null);
  const [menuPage, setMenuPage] = useState<MenuPage>(null);
  const [draftWord, setDraftWord] = useState('');
  const [draftMeaning, setDraftMeaning] = useState('');
  const [editError, setEditError] = useState('');
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [pronunciationPreview, setPronunciationPreview] = useState<PronunciationPreview | null>(null);
  const [dictionaryError, setDictionaryError] = useState('');
  const [dictionaryBusy, setDictionaryBusy] = useState(false);
  const aiRequestId = useRef(0);
  const dictionaryRequestId = useRef(0);
  const audio = useWordAudio(card?.word ?? '', card?.pronunciation?.audioUrl);

  useEffect(() => {
    aiRequestId.current += 1;
    dictionaryRequestId.current += 1;
    setAiPreview(null);
    setAiError('');
    setAiBusy(false);
    setPronunciationPreview(null);
    setDictionaryError('');
    setDictionaryBusy(false);
  }, [cardId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    return () => {
      focusedRef.current = false;
      aiRequestId.current += 1;
      dictionaryRequestId.current += 1;
      swipeableRef.current?.reset();
    };
  }, []));

  const sortMode: CardSortMode = sort === 'az' || sort === 'due' ? sort : 'newest';
  // Search filters the grid only; browsing always includes this entire group.
  const siblings = card ? getVisibleGroupCards(cards, card.groupId, reviews, '', sortMode) : [];
  const currentIndex = siblings.findIndex((item) => item.id === cardId);
  const previous = currentIndex > 0 ? siblings[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? siblings[currentIndex + 1] : undefined;

  function showCard(nextId: number) {
    if (!focusedRef.current) return;
    aiRequestId.current += 1;
    dictionaryRequestId.current += 1;
    setAiPreview(null);
    setAiBusy(false);
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

  function closeMenu() {
    aiRequestId.current += 1;
    dictionaryRequestId.current += 1;
    setAiBusy(false);
    setAiPreview(null);
    setAiError('');
    setPronunciationPreview(null);
    setDictionaryError('');
    setDictionaryBusy(false);
    setMenuPage(null);
  }

  function openAi() {
    setAiPreview(null);
    setAiError('');
    setMenuPage('ai');
  }

  function openAiEdit() {
    if (!card?.aiNote) return;
    aiRequestId.current += 1;
    setAiBusy(false);
    setAiError('');
    setAiPreview({
      sourceWord: card.word,
      sourceMeaning: card.meaning,
      note: { ...card.aiNote, examples: [...card.aiNote.examples] },
    });
    setMenuPage('edit-ai');
  }

  function openPronunciation() {
    setPronunciationPreview(null);
    setDictionaryError('');
    setMenuPage('pronunciation');
  }

  async function lookupPronunciation() {
    if (!card || dictionaryBusy) return;
    const requestId = ++dictionaryRequestId.current;
    const sourceWord = card.word;
    setDictionaryBusy(true);
    setPronunciationPreview(null);
    setDictionaryError('');
    try {
      const value = await withComputerConnection((connection) => requestWordPronunciation(connection, sourceWord));
      if (requestId === dictionaryRequestId.current) setPronunciationPreview({ sourceWord, value });
    } catch (cause) {
      if (requestId === dictionaryRequestId.current) setDictionaryError(cause instanceof Error ? cause.message : '查询失败，请稍后重试。');
    } finally {
      if (requestId === dictionaryRequestId.current) setDictionaryBusy(false);
    }
  }

  function confirmPronunciation() {
    if (!card || !pronunciationPreview) return;
    if (!savePronunciation(cardId, pronunciationPreview.sourceWord, pronunciationPreview.value)) {
      setDictionaryError('单词已变化或音标无效，请重新查询。');
      return;
    }
    closeMenu();
  }

  async function generateAiPreview() {
    if (!card || aiBusy) return;
    const requestId = ++aiRequestId.current;
    const sourceWord = card.word;
    const sourceMeaning = card.meaning;
    setAiBusy(true);
    setAiPreview(null);
    setAiError('');
    try {
      const note = await withComputerConnection((connection) => requestWordAnalysis(connection, sourceWord, sourceMeaning));
      if (requestId === aiRequestId.current) setAiPreview({ sourceWord, sourceMeaning, note });
    } catch (cause) {
      if (requestId === aiRequestId.current) setAiError(cause instanceof Error ? cause.message : '生成失败，请稍后重试。');
    } finally {
      if (requestId === aiRequestId.current) setAiBusy(false);
    }
  }

  function updateAiPreview(field: 'definition' | 'chineseHint', value: string) {
    setAiPreview((current) => current ? { ...current, note: { ...current.note, [field]: value } } : null);
    setAiError('');
  }

  function updateAiExample(index: number, value: string) {
    setAiPreview((current) => current ? {
      ...current,
      note: { ...current.note, examples: current.note.examples.map((example, item) => item === index ? value : example) },
    } : null);
    setAiError('');
  }

  function removeAiExample(index: number) {
    setAiPreview((current) => current && current.note.examples.length > 1 ? {
      ...current,
      note: { ...current.note, examples: current.note.examples.filter((_, item) => item !== index) },
    } : current);
    setAiError('');
  }

  function addAiExample() {
    setAiPreview((current) => current && current.note.examples.length < 3 ? {
      ...current,
      note: { ...current.note, examples: [...current.note.examples, ''] },
    } : current);
    setAiError('');
  }

  function confirmAiNote() {
    if (!aiPreview || !card) return;
    if (!saveAiNote(cardId, aiPreview.sourceWord, aiPreview.sourceMeaning, aiPreview.note)) {
      setAiError('未能保存：单词可能已变化，或笔记有空白、过长内容或重复例句。请检查后重试。');
      return;
    }
    closeMenu();
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
          ref={swipeableRef}
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
            ipa={card.pronunciation?.ipa}
            partOfSpeech={card.pronunciation?.partOfSpeech}
            frontAccessory={
              <View style={styles.pronunciationActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={audio.phase === 'loading' ? '加载美式音频' : audio.phase === 'playing' ? '重播美式音频' : '播放美式发音'}
                  accessibilityHint={card.pronunciation?.audioUrl ? '播放词典音频，需要手机联网' : '暂无美式音频，请先获取音标'}
                  accessibilityState={{ disabled: !card.pronunciation?.audioUrl || audio.phase === 'loading', busy: audio.phase === 'loading' }}
                  disabled={!card.pronunciation?.audioUrl || audio.phase === 'loading'}
                  onPress={() => void audio.playAmerican()}
                  style={({ pressed }) => [styles.pronunciationButton, (!card.pronunciation?.audioUrl || audio.phase === 'loading') && styles.pronunciationButtonDisabled, pressed && styles.pronunciationButtonPressed]}
                >
                  {audio.phase === 'loading' ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.speakerIcon}>🔊</Text>}
                  <Text style={styles.pronunciationButtonText}>美</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="播放英式发音"
                  accessibilityHint="使用设备英式语音朗读"
                  onPress={() => void audio.speakBritish()}
                  style={({ pressed }) => [styles.pronunciationButton, pressed && styles.pronunciationButtonPressed]}
                >
                  <Text style={styles.speakerIcon}>🔊</Text>
                  <Text style={styles.pronunciationButtonText}>英</Text>
                </Pressable>
              </View>
            }
            revealed={revealed}
            onRevealChange={(value) => {
              if (Date.now() >= ignoreFlipUntil.current) setFace({ cardId, revealed: value });
            }}
          />
        </SwipeableCard>
        <View style={styles.browseRow}>
          <Pressable onPress={() => swipeableRef.current?.slideTo('previous')} disabled={!previous} accessibilityRole="button" accessibilityLabel="上一张单词卡" style={[styles.browseButton, !previous && styles.browseButtonDisabled]}>
            <Text style={[styles.browseArrow, !previous && styles.browseArrowDisabled]}>←</Text>
          </Pressable>
          <View style={styles.browseCenter}>
            <Text style={styles.browseCount}>{currentIndex + 1} / {siblings.length}</Text>
            <Text style={styles.browseHint}>左右滑动切换 · 轻点翻面</Text>
          </View>
          <Pressable onPress={() => swipeableRef.current?.slideTo('next')} disabled={!next} accessibilityRole="button" accessibilityLabel="下一张单词卡" style={[styles.browseButton, !next && styles.browseButtonDisabled]}>
            <Text style={[styles.browseArrow, !next && styles.browseArrowDisabled]}>→</Text>
          </Pressable>
        </View>

        <View style={styles.pronunciationSection}>
          <View style={styles.pronunciationHeadingRow}>
            <Text style={styles.pronunciationHeading}>发音</Text>
          </View>
          {!card.pronunciation?.ipa ? <Text style={styles.pronunciationEmpty}>词典音标会显示在上方单词下</Text> : null}
          {card.pronunciation?.source === 'merriam-webster-learners' ? <View style={styles.dictionaryAttribution}>
            <Image source={require('../../assets/merriam-webster-logo.png')} style={styles.dictionaryLogo} accessibilityLabel="Merriam-Webster 标志" />
            <Text style={styles.previewSource}>音标、词性和美式音频来自 Merriam-Webster's Learner's Dictionary with Audio；英式音频由设备生成。</Text>
          </View> : null}
          {!card.pronunciation?.audioUrl ? <Text style={styles.pronunciationEmpty}>暂无美式词典音频，可尝试获取音标；播放词典音频需要手机联网。</Text> : null}
          {audio.error ? <Text accessibilityRole="alert" style={styles.aiError}>{audio.error}</Text> : null}
          <AppButton label="获取音标" compact variant="quiet" onPress={openPronunciation} />
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

        <WordEnrichment key={card.id} card={card} />

        <View style={styles.aiSection}>
          <View style={styles.aiHeadingRow}>
            <Text style={styles.aiHeading}>AI 学习笔记</Text>
            <View style={styles.aiActions}>
              {card.aiNote ? <AppButton label="编辑" compact variant="secondary" onPress={openAiEdit} /> : null}
              {card.aiNote ? <AppButton label="删除笔记" compact variant="quiet" onPress={() => setMenuPage('delete-ai')} /> : null}
              <AppButton label="AI 辅助" compact variant="secondary" onPress={openAi} />
            </View>
          </View>
          {card.aiNote ? <>
            <Text style={styles.aiHint}>AI 辅助生成 · 可编辑核对</Text>
            <View style={styles.definitionBlock}>
              <Text style={styles.aiLabel}>英语解释</Text>
              <Text style={styles.aiDefinition}>{card.aiNote.definition}</Text>
              <View style={styles.meaningDivider} />
              <Text style={styles.aiLabel}>中文提示</Text>
              <Text style={styles.aiBody}>{card.aiNote.chineseHint}</Text>
            </View>
            <Text style={styles.examplesHeading}>例句 · {card.aiNote.examples.length}</Text>
            {card.aiNote.examples.map((example, index) => (
              <View key={index} style={styles.exampleRow}>
                <Text style={styles.exampleNumber}>{String(index + 1).padStart(2, '0')}</Text>
                <Text style={[styles.aiBody, styles.exampleText]}>{example}</Text>
              </View>
            ))}
          </> : <View style={styles.aiEmptyBlock}><Text style={styles.aiEmpty}>尚未保存 AI 学习笔记</Text></View>}
        </View>

        <View style={styles.aiSection}>
          <Text style={styles.aiHeading}>拓展这个单词</Text>
          <Text style={styles.aiBody}>发现近义词、反义词、常见搭配和词形家族，选择想学的再加入。</Text>
          <AppButton label="关联词推荐" variant="secondary" onPress={() => router.push({ pathname: '/related/[id]', params: { id: String(cardId) } })} />
        </View>
      </ScrollView>

      <Modal visible={menuPage !== null} transparent animationType="fade" onRequestClose={closeMenu}>
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
              {menuPage === 'ai' ? <>
                <Text style={styles.modalTitle}>AI 辅助 · {card.word}</Text>
                <Text style={styles.aiHint}>发送这个单词及现有解释到你配置的 AI 服务商。结果仅作预览，保存后也不会覆盖原解释。</Text>
                <ComputerConnectionFields disabled={aiBusy} />
                <AppButton label={aiBusy ? '生成中…' : '生成预览'} onPress={() => void generateAiPreview()} disabled={aiBusy} variant="secondary" />
              </> : null}
              {menuPage === 'pronunciation' ? <>
                <Text style={styles.modalTitle}>获取音标 · {card.word}</Text>
                <Text style={styles.aiHint}>向电脑后端配置的学习者词典查询音标和词性。查询结果先预览，确认后才保存。</Text>
                <ComputerConnectionFields disabled={dictionaryBusy} />
                <AppButton label={dictionaryBusy ? '查询中…' : '查询音标'} onPress={() => void lookupPronunciation()} disabled={dictionaryBusy} variant="secondary" />
                {dictionaryError ? <Text accessibilityRole="alert" style={styles.aiError}>{dictionaryError}</Text> : null}
                {pronunciationPreview ? <View style={styles.dictionaryPreview}>
                  <Text style={styles.aiPreviewTitle}>查询结果</Text>
                  <Text style={styles.previewIpa}>/{pronunciationPreview.value.ipa}/</Text>
                  {pronunciationPreview.value.partOfSpeech ? <Text style={styles.previewPartOfSpeech}>词性：{pronunciationPreview.value.partOfSpeech}</Text> : null}
                  <View style={styles.dictionaryAttribution}>
                    <Image source={require('../../assets/merriam-webster-logo.png')} style={styles.dictionaryLogo} accessibilityLabel="Merriam-Webster 标志" />
                    <Text style={styles.previewSource}>音标、词性和美式音频来自 Merriam-Webster's Learner's Dictionary with Audio；英式音频由设备生成。</Text>
                  </View>
                  <Text style={styles.previewAudio}>{pronunciationPreview.value.audioUrl ? '美式词典音频：可用' : '美式词典音频：词典未提供'}</Text>
                  <AppButton label="保存音标" onPress={confirmPronunciation} />
                </View> : null}
              </> : null}
              {menuPage === 'edit-ai' ? <Text style={styles.modalTitle}>编辑学习笔记 · {card.word}</Text> : null}
              {menuPage === 'delete-ai' ? <>
                <Text style={styles.modalTitle}>删除学习笔记？</Text>
                <Text style={styles.aiHint}>只删除「{card.word}」的 AI 笔记，保留原解释、音标和复习记录。</Text>
                <AppButton label="确认删除笔记" variant="danger" onPress={() => { removeAiNote(cardId); closeMenu(); }} />
              </> : null}
              {menuPage === 'ai' || menuPage === 'edit-ai' ? <>
                {aiError ? <Text accessibilityRole="alert" style={styles.aiError}>{aiError}</Text> : null}
                {aiPreview ? <View style={[styles.aiPreview, menuPage === 'edit-ai' && styles.aiEditFields]}>
                  {menuPage === 'ai' ? <Text style={styles.aiPreviewTitle}>检查并修改</Text> : null}
                  <AppTextField label="英语解释" value={aiPreview.note.definition} onChangeText={(value) => updateAiPreview('definition', value)} multiline />
                  <AppTextField label="中文提示" value={aiPreview.note.chineseHint} onChangeText={(value) => updateAiPreview('chineseHint', value)} multiline />
                  {aiPreview.note.examples.map((example, index) => (
                    <View key={index} style={styles.exampleEditor}>
                      <AppTextField label={`例句 ${index + 1}`} value={example} onChangeText={(value) => updateAiExample(index, value)} multiline />
                      {aiPreview.note.examples.length > 1 ? <AppButton label={`删除例句 ${index + 1}`} compact variant="quiet" onPress={() => removeAiExample(index)} style={styles.exampleAction} /> : null}
                    </View>
                  ))}
                  {aiPreview.note.examples.length < 3 ? <AppButton label="添加例句" compact variant="quiet" onPress={addAiExample} style={styles.exampleAction} /> : null}
                  <AppButton label={menuPage === 'edit-ai' ? '保存修改' : '确认保存学习笔记'} onPress={confirmAiNote} disabled={aiBusy} />
                </View> : null}
              </> : null}
              <AppButton label="取消" variant="secondary" onPress={closeMenu} />
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
  pronunciationSection: { marginTop: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
  pronunciationHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pronunciationActions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pronunciationButton: { minWidth: 58, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.primarySoft },
  pronunciationButtonDisabled: { opacity: 0.4 }, pronunciationButtonPressed: { opacity: 0.65 },
  speakerIcon: { fontSize: 16 }, pronunciationButtonText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  pronunciationHeading: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  pronunciationEmpty: { color: colors.muted, fontSize: 13 },
  dictionaryAttribution: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dictionaryLogo: { width: 50, height: 50 },
  aiSection: { marginTop: spacing.section, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.lg, gap: spacing.md },
  aiHeadingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  aiHeading: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  aiActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  definitionBlock: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: 8, padding: spacing.lg, gap: spacing.sm },
  aiLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  aiDefinition: { color: colors.ink, fontSize: 17, lineHeight: 25 },
  meaningDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  aiBody: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  examplesHeading: { color: colors.inkSoft, fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
  exampleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing.lg },
  exampleNumber: { width: 24, color: colors.primary, fontSize: 12, lineHeight: 22, fontWeight: '700' },
  exampleText: { flex: 1, minWidth: 0 },
  aiEmptyBlock: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8, padding: spacing.lg },
  aiEmpty: { color: colors.muted, fontSize: 13 },
  aiHint: { color: colors.inkSoft, fontSize: 13, lineHeight: 20 },
  aiError: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  aiPreview: { gap: spacing.md, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.md },
  aiEditFields: { borderTopWidth: 0, paddingTop: 0 },
  aiPreviewTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  dictionaryPreview: { gap: spacing.md, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.md },
  previewIpa: { color: colors.primary, fontSize: 24, fontWeight: '700' },
  previewPartOfSpeech: { color: colors.ink, fontSize: 14 }, previewAudio: { color: colors.inkSoft, fontSize: 13 }, previewSource: { flex: 1, color: colors.muted, fontSize: 12 },
  exampleEditor: { gap: spacing.sm },
  exampleAction: { alignSelf: 'flex-end' },
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
