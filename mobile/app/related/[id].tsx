import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { ComputerConnectionFields } from '../../components/ComputerConnectionFields';
import { colors, radius, spacing } from '../../components/theme';
import { normalizeWord, relationLabels, requestRelatedWords, wordFamilyLabels, type RelatedWord, type RelationCategory } from '../../localServer/ai';
import { withComputerConnection } from '../../store/useComputerConnection';
import { useLingoStore } from '../../store/useLingoStore';

type Preview = { sourceWord: string; sourceMeaning: string; candidates: RelatedWord[] };
const dictionaryLabels: Record<RelatedWord['dictionaryStatus'], string> = {
  found: '词典已查到该词形',
  not_found: '词典未查到该词形，请自行核对',
  unavailable: '词典暂时不可用，尚未核对',
  not_configured: '词典未配置，尚未核对',
};

export default function RelatedWordsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardId = Number(id);
  const cards = useLingoStore((state) => state.cards);
  const groups = useLingoStore((state) => state.groups);
  const addRecommendedCard = useLingoStore((state) => state.addRecommendedCard);
  const isSaving = useLingoStore((state) => state.isSaving);
  const saveError = useLingoStore((state) => state.error);
  const card = cards.find((item) => item.id === cardId);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<RelatedWord | null>(null);
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [groupId, setGroupId] = useState(0);
  const [editError, setEditError] = useState('');
  const requestId = useRef(0);
  const focused = useRef(false);
  const confirming = useRef(false);
  const stale = !!preview && (!card || card.word !== preview.sourceWord || card.meaning !== preview.sourceMeaning);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(false);
    setSelected(null);
    setPreview(null);
    setError('');
    return () => { focused.current = false; requestId.current += 1; };
  }, [cardId]));

  async function generate() {
    if (!card || busy) return;
    const generation = ++requestId.current;
    const sourceWord = card.word;
    const sourceMeaning = card.meaning;
    setBusy(true);
    setError('');
    setMessage('');
    setPreview(null);
    try {
      const candidates = await withComputerConnection((connection) => requestRelatedWords(connection, sourceWord, sourceMeaning));
      if (!focused.current || requestId.current !== generation) return;
      const source = useLingoStore.getState().cards.find((item) => item.id === cardId);
      if (!source || source.word !== sourceWord || source.meaning !== sourceMeaning) {
        setError('原单词已更改，请重新生成推荐。');
        return;
      }
      setPreview({ sourceWord, sourceMeaning, candidates });
    } catch (failure) {
      if (focused.current && requestId.current === generation) setError(failure instanceof Error ? failure.message : '暂时无法生成推荐，请重试。');
    } finally {
      if (focused.current && requestId.current === generation) setBusy(false);
    }
  }

  function openAdd(candidate: RelatedWord) {
    if (!card || stale) return;
    setSelected(candidate);
    setWord(candidate.word);
    setMeaning(`${candidate.definition}\n${candidate.chineseHint}`);
    setGroupId(card.groupId);
    setEditError('');
    confirming.current = false;
  }

  function confirmAdd() {
    if (!preview || !selected || confirming.current) return;
    if (stale) { setEditError('原单词已更改，请取消后重新生成。'); return; }
    if (!word.trim() || !meaning.trim()) { setEditError('单词和解释都不能为空。'); return; }
    if (cards.some((item) => normalizeWord(item.word) === normalizeWord(word))) {
      setEditError('单词库已有这个词，请到已有单词中查看或编辑。'); return;
    }
    confirming.current = true;
    const newId = addRecommendedCard(cardId, preview.sourceWord, preview.sourceMeaning, word, meaning, groupId);
    if (newId === null) {
      confirming.current = false;
      setEditError('未加入。请检查分组、已有单词或原单词是否发生变化。');
      return;
    }
    setSelected(null);
    setMessage(`已加入「${word.trim()}」，可到单词组查看或前往复习。`);
  }

  if (!card) return <SafeAreaView style={styles.safe}><View style={styles.content}>
    <AppButton label="返回" variant="quiet" onPress={() => router.back()} />
    <Text style={styles.body}>原单词已不存在，请返回单词库。</Text>
  </View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AppButton label="返回单词卡" variant="quiet" compact style={styles.back} onPress={() => router.back()} />
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>EXPLORE WORDS</Text>
        <Text style={styles.title}>从 {card.word} 出发</Text>
        <Text style={styles.body}>{card.meaning}</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>发现关联词</Text>
        <Text style={styles.body}>根据当前词义推荐，每类最多 2 项。先查看，再逐个选择加入。</Text>
        <Text style={styles.hint}>仅发送这个单词和原解释给 AI；候选词会交给词典核对词形。AI 对词义和关系的判断仍可能有误。</Text>
        <ComputerConnectionFields disabled={busy} />
        <AppButton label={busy ? '正在推荐并核对…' : preview ? '重新生成推荐' : '生成关联词'} disabled={busy} onPress={() => void generate()} />
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
      {stale ? <Text accessibilityRole="alert" style={styles.error}>原单词已更改，这些推荐已过期，请重新生成。</Text> : null}
      {message ? <Text accessibilityRole="alert" style={styles.success}>{message}{isSaving ? ' 正在保存…' : saveError ? ' 保存遇到问题，请按顶部提示重试。' : ''}</Text> : null}
      {preview && !stale ? <>
        <Text style={styles.hint}>词典查到词形 ≠ 已验证推荐关系或释义。未查到的搭配也可能正确，请核对后决定是否加入。</Text>
        {preview.candidates.length === 0 ? <View style={styles.panel}><Text style={styles.body}>本次没有找到合适的关联词。可以保留原词学习，或重新生成。</Text></View> : null}
        {(Object.keys(relationLabels) as RelationCategory[]).map((category) => {
          const items = preview.candidates.filter((item) => item.category === category);
          return <View key={category} style={styles.category}>
            <Text style={styles.sectionTitle}>{relationLabels[category]} · {items.length}</Text>
            {!items.length ? <Text style={styles.hint}>本次未推荐，避免勉强凑词。</Text> : items.map((candidate) => {
              const existing = cards.find((item) => normalizeWord(item.word) === normalizeWord(candidate.word));
              return <View key={candidate.word} style={styles.panel}>
                <Text style={styles.word}>{candidate.word}</Text>
                <Text style={styles.body}>{candidate.definition}</Text>
                <Text style={styles.body}>{candidate.chineseHint}</Text>
                {candidate.category === 'word_family' ? <View style={styles.family}>
                  <Text style={styles.familyTitle}>{candidate.wordFamily ? wordFamilyLabels[candidate.wordFamily.kind] : '构词说明暂缺'}</Text>
                  {candidate.wordFamily && candidate.wordFamily.kind !== 'uncertain' ? <>
                    <Text style={styles.body}>{candidate.wordFamily.kind === 'shared_root' ? '共同词根' : candidate.wordFamily.kind === 'inflection' ? '原形' : '基础词'}：{candidate.wordFamily.base}</Text>
                    <Text style={styles.body}>{candidate.wordFamily.kind === 'shared_root' ? '词根含义' : '基础含义'}：{candidate.wordFamily.meaning}</Text>
                    {candidate.wordFamily.affix ? <Text style={styles.body}>相关词缀：{candidate.wordFamily.affix}</Text> : null}
                  </> : <Text style={styles.body}>{candidate.wordFamily ? '暂无法可靠说明词根或构词方式，请核对后再作为记忆参考。' : '请重启更新后的电脑后端，再重新生成推荐。'}</Text>}
                  <Text style={styles.hint}>AI 构词分析，词源尚未经核实；词典仅核对词形。</Text>
                </View> : null}
                <View style={styles.reason}><Text style={styles.hint}>为什么推荐</Text><Text style={styles.body}>{candidate.reason}</Text></View>
                <Text style={candidate.dictionaryStatus === 'found' ? styles.verified : styles.hint}>{dictionaryLabels[candidate.dictionaryStatus]}</Text>
                {existing ? <>
                  <Text style={styles.hint}>已在「{groups.find((group) => group.id === existing.groupId)?.name ?? '单词库'}」中</Text>
                  <AppButton label={`查看已有 ${candidate.word}`} compact variant="quiet" onPress={() => router.push({ pathname: '/cards/[id]', params: { id: String(existing.id) } })} />
                </> : <AppButton label={`加入 ${candidate.word}`} compact variant="secondary" onPress={() => openAdd(candidate)} />}
              </View>;
            })}
          </View>;
        })}
        {preview.candidates.some((item) => item.dictionaryStatus === 'found' || item.dictionaryStatus === 'not_found') ? <View style={styles.attribution}>
          <Image source={require('../../assets/merriam-webster-logo.png')} style={styles.logo} accessibilityLabel="Merriam-Webster" />
          <Text style={styles.hint}>词形核对：Merriam-Webster's Learner's Dictionary with Audio。推荐关系及释义由 AI 生成。</Text>
        </View> : null}
      </> : null}
    </ScrollView>
    <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>确认加入单词库</Text>
              <Text style={styles.hint}>可以先修改单词与解释。确认后作为普通单词卡保存，并进入复习计划。</Text>
              {selected ? <Text style={styles.hint}>{dictionaryLabels[selected.dictionaryStatus]}。核对仅针对原候选「{selected.word}」，修改后的内容由你确认。</Text> : null}
              <AppTextField label="推荐单词" value={word} onChangeText={setWord} autoCapitalize="none" maxLength={100} />
              <AppTextField label="单词解释" value={meaning} onChangeText={setMeaning} multiline maxLength={1000} />
              <Text style={styles.body}>加入分组</Text>
              <View style={styles.groupRow}>{groups.map((group) => <Pressable key={group.id} accessibilityRole="radio" accessibilityLabel={group.name} accessibilityState={{ checked: groupId === group.id }}
                onPress={() => setGroupId(group.id)} style={[styles.chip, groupId === group.id && styles.activeChip]}>
                <Text style={groupId === group.id ? styles.activeText : styles.body}>{group.name}</Text>
              </Pressable>)}</View>
              {editError ? <Text accessibilityRole="alert" style={styles.error}>{editError}</Text> : null}
              <AppButton label="确认加入" onPress={confirmAdd} />
              <AppButton label="取消" variant="secondary" onPress={() => setSelected(null)} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
  back: { alignSelf: 'flex-start' },
  heading: { gap: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800' },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  word: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  body: { color: colors.inkSoft, fontSize: 15, lineHeight: 23 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  category: { gap: spacing.md },
  family: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, gap: spacing.sm },
  familyTitle: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '700' },
  reason: { borderLeftWidth: 3, borderColor: colors.primarySoft, paddingLeft: spacing.md, gap: spacing.xs },
  verified: { color: colors.primary, fontSize: 12, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
  success: { color: colors.primary, fontSize: 14, lineHeight: 22 },
  attribution: { gap: spacing.sm },
  logo: { height: 40, width: 40, resizeMode: 'contain' },
  backdrop: { flex: 1, backgroundColor: 'rgba(24,49,47,0.38)' },
  modalSafe: { flex: 1 },
  modalContainer: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: '100%' },
  activeChip: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  activeText: { color: colors.primary, fontSize: 15, lineHeight: 23, fontWeight: '700' },
});
