import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { AppTextField } from '../components/AppTextField';
import { ComputerConnectionFields } from '../components/ComputerConnectionFields';
import { colors, spacing } from '../components/theme';
import { buildExerciseQuestions, eligibleExerciseWords, exerciseSourcesMatch, gradeExercise, randomExerciseWords, summarizeExercises, type ExerciseAnswer, type ExerciseQuestion } from '../exercises';
import { requestExercises } from '../localServer/ai';
import { withComputerConnection } from '../store/useComputerConnection';
import { useLingoStore, type WordCard } from '../store/useLingoStore';

type Round = { sources: WordCard[]; questions: ExerciseQuestion[]; cursor: number; answers: Record<number, ExerciseAnswer> };

export default function ExercisesScreen() {
  const cards = useLingoStore((state) => state.cards);
  const groups = useLingoStore((state) => state.groups);
  const [groupId, setGroupId] = useState<number | null>(null);
  const eligible = useMemo(() => eligibleExerciseWords(cards.filter((card) => groupId === null || card.groupId === groupId)), [cards, groupId]);
  const [selectedIds, setSelectedIds] = useState(() => eligible.slice(0, 5).map((card) => card.id));
  const selected = eligible.filter((card) => selectedIds.includes(card.id));
  const [round, setRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const matching = eligible.filter((card) => card.word.toLowerCase().includes(search.trim().toLowerCase()));
  const requestId = useRef(0);
  const pending = useRef(false);
  const focused = useRef(false);
  const stale = !!round && !exerciseSourcesMatch(round.sources, cards);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    pending.current = false;
    setBusy(false);
    return () => { focused.current = false; requestId.current++; };
  }, []));

  function selectGroup(id: number | null) {
    if (pending.current) return;
    setGroupId(id);
    setSelectedIds(eligibleExerciseWords(cards.filter((card) => id === null || card.groupId === id)).slice(0, 5).map((card) => card.id));
    setError('');
    setSearch('');
  }

  function toggleWord(id: number) {
    if (pending.current) return;
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 5 ? [...ids, id] : ids);
  }

  function selectRandomWords() {
    if (pending.current || eligible.length < 4) return;
    setSelectedIds(randomExerciseWords(eligible).map((card) => card.id));
    setSearch('');
    setError('');
  }

  async function generate() {
    if (pending.current || selected.length < 4 || selected.length > 5) return;
    const sources = selected.map((card) => ({ ...card }));
    const generation = ++requestId.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const drafts = await withComputerConnection((connection) => requestExercises(connection, sources));
      if (!focused.current || requestId.current !== generation) return;
      if (!exerciseSourcesMatch(sources, useLingoStore.getState().cards)) {
        setError('所选单词已修改或删除，请重新选择后生成。');
        return;
      }
      const questions = buildExerciseQuestions(drafts, sources);
      if (!questions.length) { setError('本次没有生成合适的题目，请调整所选单词后再试。'); return; }
      setRound({ sources, questions, cursor: 0, answers: {} });
    } catch (failure) {
      if (focused.current && requestId.current === generation) setError(failure instanceof Error ? failure.message : '暂时无法生成练习。');
    } finally {
      if (focused.current && requestId.current === generation) { pending.current = false; setBusy(false); }
    }
  }

  function answer(selectedId: number) {
    setRound((current) => {
      if (!current || !exerciseSourcesMatch(current.sources, useLingoStore.getState().cards)) return current;
      const question = current.questions[current.cursor];
      if (!question || current.answers[question.cardId] || !question.options.some((option) => option.id === selectedId)) return current;
      return { ...current, answers: { ...current.answers, [question.cardId]: { selectedId, excluded: false } } };
    });
  }

  function exclude() {
    setRound((current) => {
      if (!current) return current;
      const question = current.questions[current.cursor];
      if (!question) return current;
      const existing = current.answers[question.cardId];
      return { ...current, answers: { ...current.answers, [question.cardId]: { selectedId: existing?.selectedId ?? question.cardId, excluded: true } } };
    });
  }

  function next() {
    setRound((current) => {
      const question = current?.questions[current.cursor];
      if (!current || !question || !current.answers[question.cardId]) return current;
      return { ...current, cursor: current.cursor + 1 };
    });
  }

  function reset() { setRound(null); setError(''); }
  const current = round?.questions[round.cursor];
  const response = current ? round?.answers[current.cardId] : undefined;
  const correctOption = current?.options.find((option) => option.id === current.cardId);
  const summary = round ? summarizeExercises(round.questions, round.answers) : null;

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AppButton label="返回复习页" compact variant="quiet" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/review')} />
      <View style={styles.heading}><Text style={styles.eyebrow}>AI PRACTICE</Text><Text style={styles.title}>语境选词</Text></View>
      {stale ? <View style={styles.section}>
        <Text accessibilityRole="alert" style={styles.error}>本轮单词已修改或删除，请重新生成练习。</Text>
        <AppButton label="重新选择单词" onPress={reset} />
      </View> : !round ? <>
        <Text style={styles.body}>从单词库选 4～5 个词。所选单词和原解释将发送给你配置的 AI 服务商。</Text>
        <Text style={styles.hint}>本轮结果不保存，也不改变原有复习间隔。</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>单词范围</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupRow}>
            {[{ id: null, name: '全部单词' }, ...groups].map((group) => <Pressable key={String(group.id)} accessibilityRole="radio"
              accessibilityLabel={group.name} accessibilityState={{ checked: groupId === group.id, disabled: busy }} disabled={busy}
              onPress={() => selectGroup(group.id)} style={[styles.group, groupId === group.id && styles.activeGroup]}>
              <Text style={[styles.groupText, groupId === group.id && styles.activeGroupText]}>{group.name}</Text>
            </Pressable>)}
          </ScrollView>
          <View style={styles.row}>
            <Text style={styles.body}>已选 {selected.length} / 5 · 可用 {eligible.length} 个</Text>
            <AppButton label="随机选词" compact variant="secondary" onPress={selectRandomWords} disabled={busy || eligible.length < 4} />
          </View>
          {selected.length ? <Text accessibilityLiveRegion="polite" style={styles.selection}>本轮单词：{selected.map((card) => card.word).join(' · ')}</Text> : null}
          {eligible.length < 4 ? <Text style={styles.hint}>至少需要 4 个拼写不同的英文单词。可换到全部单词，或先补充单词；单词解释需在 500 字以内。</Text> : null}
          <AppTextField label="搜索练习单词" value={search} onChangeText={setSearch} editable={!busy} autoCapitalize="none" />
          <ScrollView nestedScrollEnabled style={styles.wordList}>
            {matching.slice(0, 50).map((item) => {
              const checked = selectedIds.includes(item.id);
              const disabled = busy || (!checked && selected.length >= 5);
              return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={item.word} accessibilityState={{ checked, disabled }} disabled={disabled}
                onPress={() => toggleWord(item.id)} style={[styles.wordRow, disabled && !checked && styles.dim]}>
                <View style={[styles.checkbox, checked && styles.checked]}><Text style={styles.check}>{checked ? '✓' : ''}</Text></View>
                <View style={styles.wordCopy}><Text style={styles.wordName}>{item.word}</Text><Text numberOfLines={2} style={styles.hint}>{item.meaning}</Text></View>
              </Pressable>;
            })}
          </ScrollView>
          {matching.length > 50 ? <Text style={styles.hint}>显示前 50 个结果，请搜索缩小范围。</Text> : null}
          {!matching.length ? <Text style={styles.hint}>没有匹配的可用单词。</Text> : null}
        </View>
        <View style={styles.section}>
          <ComputerConnectionFields disabled={busy} />
          <AppButton label={busy ? '正在出题…' : '生成练习'} onPress={() => void generate()} disabled={busy || selected.length < 4} />
          {busy ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.hint}>正在生成语境，请稍候。</Text></View> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </View>
      </> : current ? <>
        <View style={styles.row}><Text style={styles.body}>第 {round.cursor + 1} / {round.questions.length} 题</Text><Text style={styles.hint}>选择最合适的单词</Text></View>
        <View style={styles.track}><View style={[styles.fill, { width: `${round.cursor / round.questions.length * 100}%` }]} /></View>
        <Text style={styles.sentence}>{current.sentence}</Text>
        <View accessibilityRole="radiogroup" style={styles.options}>
          {current.options.map((option, index) => {
            const selectedOption = response?.selectedId === option.id;
            const correct = !!response && option.id === current.cardId;
            const wrong = !!response && selectedOption && !correct && !response.excluded;
            return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${String.fromCharCode(65 + index)} ${option.word}`}
              accessibilityState={{ checked: selectedOption, disabled: !!response }} disabled={!!response} onPress={() => answer(option.id)}
              style={[styles.option, correct && styles.correctOption, wrong && styles.wrongOption]}>
              <Text style={styles.optionLetter}>{String.fromCharCode(65 + index)}</Text><Text style={styles.optionWord}>{option.word}</Text>
              {correct ? <Text style={styles.correctLabel}>正确答案</Text> : wrong ? <Text style={styles.error}>你的选择</Text> : null}
            </Pressable>;
          })}
        </View>
        {response ? <View style={styles.feedback}>
          <Text accessibilityLiveRegion="polite" style={styles.sectionTitle}>{response.excluded ? '此题已排除计分' : gradeExercise(current, response.selectedId) ? '回答正确' : `正确答案：${correctOption?.word}`}</Text>
          <Text style={styles.body}>{current.explanation}</Text>
          <Text style={styles.hint}>AI 讲解可能有误，有歧义的题目可排除计分。</Text>
          {!response.excluded ? <AppButton label="此题有疑问" compact variant="quiet" onPress={exclude} /> : null}
          <AppButton label={round.cursor + 1 === round.questions.length ? '查看本轮结果' : '下一题'} onPress={next} />
        </View> : <AppButton label="跳过此题" compact variant="quiet" onPress={exclude} />}
      </> : summary ? <>
        <View style={styles.result}>
          <Text style={styles.sectionTitle}>本轮练习完成</Text>
          <Text style={styles.score}>{summary.correct}<Text style={styles.scoreUnit}> / {summary.total}</Text></Text>
          <Text style={styles.body}>答对 {summary.correct} 题 · 答错 {summary.wrong} 题 · 排除 {summary.excluded} 题</Text>
          <Text style={styles.hint}>{summary.total ? '分数只计算未排除的题目。' : '本轮全部题目已排除，不计算分数。'} 本轮结果不保存，复习间隔未改变。</Text>
        </View>
        {round.questions.map((question, index) => {
          const answer = round.answers[question.cardId];
          const target = question.options.find((option) => option.id === question.cardId)!;
          const picked = question.options.find((option) => option.id === answer.selectedId);
          return <View key={question.cardId} style={styles.resultRow}>
            <Text style={styles.sectionTitle}>{index + 1}. {target.word} · {answer.excluded ? '已排除' : gradeExercise(question, answer.selectedId) ? '答对' : '答错'}</Text>
            <Text style={styles.body}>{question.sentence.replace('_____', target.word)}</Text>
            {!answer.excluded ? <Text style={styles.hint}>你的选择：{picked?.word}</Text> : null}
            <Text style={styles.body}>{question.explanation}</Text>
          </View>;
        })}
        <AppButton label="再练一组" onPress={reset} />
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.lg, width: '100%', maxWidth: 720, alignSelf: 'center' },
  back: { alignSelf: 'flex-start' }, heading: { gap: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800' },
  sectionTitle: { color: colors.ink, fontSize: 17, lineHeight: 26, fontWeight: '700' },
  body: { color: colors.inkSoft, fontSize: 15, lineHeight: 23 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  section: { borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  selection: { color: colors.primary, fontSize: 14, lineHeight: 23 },
  groupRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  group: { borderBottomWidth: 2, borderColor: 'transparent', padding: spacing.sm, maxWidth: 220 },
  activeGroup: { borderColor: colors.primary }, groupText: { color: colors.muted, fontSize: 14, lineHeight: 21 }, activeGroupText: { color: colors.primary, fontWeight: '700' },
  wordList: { maxHeight: 250, borderTopWidth: 1, borderColor: colors.border },
  wordRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  wordCopy: { flex: 1 }, wordName: { color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.muted, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary }, check: { color: colors.white, fontSize: 15, lineHeight: 20 }, dim: { opacity: 0.45 },
  loading: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, error: { color: colors.danger, fontSize: 13, lineHeight: 21 },
  track: { height: 4, backgroundColor: colors.border }, fill: { height: 4, backgroundColor: colors.primary },
  sentence: { color: colors.ink, fontSize: 23, lineHeight: 35, paddingVertical: spacing.xl, fontWeight: '600' },
  options: { gap: spacing.md }, option: { minHeight: 64, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: 8, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  optionLetter: { color: colors.muted, fontSize: 14, width: 16 }, optionWord: { color: colors.ink, fontSize: 17, lineHeight: 25, flex: 1, minWidth: 0 },
  correctOption: { backgroundColor: colors.primarySoft, borderColor: colors.primary }, wrongOption: { backgroundColor: colors.dangerSoft, borderColor: colors.danger }, correctLabel: { color: colors.primary, fontSize: 12, lineHeight: 20 },
  feedback: { borderTopWidth: 2, borderColor: colors.border, paddingTop: spacing.lg, gap: spacing.md },
  result: { gap: spacing.md, paddingVertical: spacing.lg }, score: { color: colors.primary, fontSize: 48, fontWeight: '800' }, scoreUnit: { color: colors.muted, fontSize: 24 },
  resultRow: { borderTopWidth: 1, borderColor: colors.border, paddingVertical: spacing.lg, gap: spacing.sm },
});
