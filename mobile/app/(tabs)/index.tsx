import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { colors, radius, spacing } from '../../components/theme';
import { useLingoStore } from '../../store/useLingoStore';
import { isReviewDue } from '../../reviewScheduler';
import { useAutoEnrichment } from '../../store/useAutoEnrichment';

export default function AddScreen() {
  const groups = useLingoStore((state) => state.groups);
  const cards = useLingoStore((state) => state.cards);
  const reviews = useLingoStore((state) => state.reviews);
  const selectedGroupId = useLingoStore((state) => state.selectedGroupId);
  const selectGroup = useLingoStore((state) => state.selectGroup);
  const addCard = useLingoStore((state) => state.addCard);
  const addGroup = useLingoStore((state) => state.addGroup);
  const enrichment = useAutoEnrichment();
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [groupError, setGroupError] = useState('');
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const dueCount = cards.filter((card) => isReviewDue(reviews[card.id], Date.now())).length;

  function saveWord() {
    if (!word.trim() || !meaning.trim()) {
      setError('请填写单词和解释。');
      return;
    }
    const id = addCard(word.trim(), meaning.trim(), selectedGroupId);
    if (id === null) {
      setError('保存失败，请确认单词组仍然存在。');
      return;
    }
    setWord('');
    setMeaning('');
    setError('');
    setMessage(`已加入「${selectedGroup?.name ?? '默认组'}」`);
  }

  function createGroup() {
    const id = addGroup(newGroupName);
    if (id === null) {
      setGroupError('单词组名称不能为空，也不能与已有组重名。');
      return;
    }
    selectGroup(id);
    setNewGroupName('');
    setCreateGroupOpen(false);
    setGroupPickerOpen(false);
    setGroupError('');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.headingRow}>
            <Text style={styles.eyebrow}>LINGONEST · 每日积累</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="设置" onPress={() => router.push('/settings')} style={styles.settingsButton}>
              <Text style={styles.gear}>⚙</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>记录今天遇到的词。</Text>
          <Text style={styles.subtitle}>先留下自己的理解，复习时再慢慢记住它。</Text>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>添加单词</Text>
            <Text style={styles.formHint}>一个单词，一小步。</Text>
            <AppTextField label="单词" placeholder="例如 resilient" value={word} onChangeText={(value) => { setWord(value); setMessage(''); }} autoCapitalize="none" autoCorrect={false} />
            <AppTextField label="解释" placeholder="可以写英语或中文解释" value={meaning} onChangeText={(value) => { setMeaning(value); setMessage(''); }} multiline />
            <Text style={styles.fieldLabel}>加入单词组</Text>
            <Pressable style={styles.groupSelect} onPress={() => setGroupPickerOpen(true)} accessibilityRole="button" accessibilityLabel="选择单词组">
              <Text style={styles.groupSelectText}>{selectedGroup?.name ?? '默认组'}</Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            <AppButton label="保存单词" onPress={saveWord} style={styles.saveButton} />
          </View>

          {enrichment.enabled.dictionary || enrichment.enabled.ai || enrichment.jobs.length || enrichment.error ?
            <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.enrichmentStatus}>
              <Text style={styles.enrichmentLabel}>{enrichment.error ? '自动补全设置需要处理' : `自动补全${enrichment.jobs.length ? ` · ${enrichment.jobs.length} 个待办` : '已开启'}`}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable> : null}

          <Pressable style={styles.reviewPrompt} onPress={() => router.push('/(tabs)/review')}>
            <View>
              <Text style={styles.promptLabel}>下一步 · 复习</Text>
              <Text style={styles.promptNumber}>{dueCount} 张卡片待复习</Text>
            </View>
            <Text style={styles.promptArrow}>→</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={groupPickerOpen} transparent animationType="fade" onRequestClose={() => setGroupPickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>选择单词组</Text>
            <ScrollView style={styles.optionScroll} contentContainerStyle={styles.optionContent}>
              {groups.map((group) => (
                <Pressable key={group.id} style={[styles.groupOption, group.id === selectedGroupId && styles.groupOptionActive]} onPress={() => { selectGroup(group.id); setGroupPickerOpen(false); }}>
                  <Text style={styles.groupOptionText}>{group.name}</Text>
                  {group.id === selectedGroupId ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
            <AppButton label="＋ 新建单词组" variant="quiet" onPress={() => { setGroupPickerOpen(false); setGroupError(''); setCreateGroupOpen(true); }} style={styles.sheetAction} />
            <AppButton label="取消" variant="secondary" onPress={() => setGroupPickerOpen(false)} style={styles.sheetAction} />
          </View>
        </View>
      </Modal>

      <Modal visible={createGroupOpen} transparent animationType="fade" onRequestClose={() => setCreateGroupOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>新建单词组</Text>
            <AppTextField label="名称" placeholder="例如 考试词汇" value={newGroupName} onChangeText={(value) => { setNewGroupName(value); setGroupError(''); }} autoFocus error={groupError} />
            <AppButton label="创建并选中" onPress={createGroup} style={styles.sheetAction} />
            <AppButton label="取消" variant="secondary" onPress={() => setCreateGroupOpen(false)} style={styles.sheetAction} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 32, paddingBottom: 48 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  settingsButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  gear: { color: colors.primary, fontSize: 26 },
  enrichmentStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: spacing.sm },
  enrichmentLabel: { flex: 1, color: colors.primary, fontSize: 13 },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800', lineHeight: 42, marginTop: 10 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 8, marginBottom: 28 },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, gap: spacing.lg, borderWidth: 1, borderColor: colors.border },
  formTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  formHint: { color: colors.muted, fontSize: 14, marginTop: -10 },
  fieldLabel: { color: colors.inkSoft, fontSize: 14, fontWeight: '700', marginBottom: -7 },
  groupSelect: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, minHeight: 50, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupSelectText: { color: colors.ink, fontSize: 16 }, chevron: { color: colors.muted, fontSize: 22 },
  error: { color: colors.danger, fontSize: 13 }, success: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  saveButton: { marginTop: 2 },
  reviewPrompt: { marginTop: 22, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  promptLabel: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  promptNumber: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 5 }, promptArrow: { color: colors.primary, fontSize: 28 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 36, 31, 0.38)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, gap: spacing.md },
  sheetTitle: { color: colors.ink, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  groupOption: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  groupOptionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  groupOptionText: { color: colors.ink, fontSize: 16, fontWeight: '600' }, check: { color: colors.primary, fontSize: 17 },
  optionScroll: { maxHeight: 320 }, optionContent: { gap: spacing.sm },
  sheetAction: { marginTop: 4 },
});
