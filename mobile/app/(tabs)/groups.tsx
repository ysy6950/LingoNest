import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { colors, radius, spacing } from '../../components/theme';
import { isReviewDue } from '../../reviewScheduler';
import { searchAllCards } from '../../cardCollection';
import { DEFAULT_GROUP_ID, useLingoStore, type WordCard, type WordGroup } from '../../store/useLingoStore';

type CollectionRow = { kind: 'group'; group: WordGroup } | { kind: 'card'; card: WordCard };
type GroupDialog = { kind: 'create' } | { kind: 'edit' | 'delete'; groupId: number };

export default function GroupsScreen() {
  const groups = useLingoStore((state) => state.groups);
  const cards = useLingoStore((state) => state.cards);
  const reviews = useLingoStore((state) => state.reviews);
  const addGroup = useLingoStore((state) => state.addGroup);
  const renameGroup = useLingoStore((state) => state.renameGroup);
  const deleteGroup = useLingoStore((state) => state.deleteGroup);
  const [dialog, setDialog] = useState<GroupDialog | null>(null);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const searching = !!query.trim();
  const results = useMemo(() => searchAllCards(cards, query), [cards, query]);
  const rows: CollectionRow[] = searching
    ? results.map((card) => ({ kind: 'card', card }))
    : groups.map((group) => ({ kind: 'group', group }));
  const managedGroup = dialog && dialog.kind !== 'create'
    ? groups.find((group) => group.id === dialog.groupId) : undefined;

  function openDialog(next: GroupDialog) {
    setName(next.kind === 'create' ? '' : groups.find((group) => group.id === next.groupId)?.name ?? '');
    setError('');
    setDialog(next);
  }

  function saveGroup() {
    if (!dialog || dialog.kind === 'delete') return;
    if (dialog.kind === 'edit') {
      if (!renameGroup(dialog.groupId, name)) { setError('请输入不重复的名称，默认组不能修改。'); return; }
      setDialog(null);
      return;
    }
    const id = addGroup(name);
    if (id === null) {
      setError('请输入不重复的单词组名称。');
      return;
    }
    setName(''); setError(''); setDialog(null);
    router.push({ pathname: '/groups/[id]', params: { id: String(id) } });
  }

  function confirmDelete() {
    if (!managedGroup || !deleteGroup(managedGroup.id)) { setError('无法删除此分组，默认组必须保留。'); return; }
    setDialog(null);
  }

  function renderRow({ item: row }: { item: CollectionRow }) {
    if (row.kind === 'card') {
      const card = row.card;
      return <Pressable accessibilityRole="button" accessibilityLabel={'查看 ' + card.word} style={styles.resultRow}
        onPress={() => router.push({ pathname: '/cards/[id]', params: { id: String(card.id) } })}>
        <View style={styles.resultCopy}>
          <Text style={styles.groupName}>{card.word}</Text>
          <Text style={styles.meaning} numberOfLines={2}>{card.meaning}</Text>
          <Text style={styles.groupMeta}>{groups.find((group) => group.id === card.groupId)?.name}</Text>
        </View><Text style={styles.arrow}>›</Text>
      </Pressable>;
    }
    const item = row.group;
    const groupCards = cards.filter((card) => card.groupId === item.id);
    const dueCount = groupCards.filter((card) => isReviewDue(reviews[card.id], Date.now())).length;
    return (
      <View style={styles.groupCard}>
      <Pressable accessibilityRole="button" accessibilityLabel={'打开 ' + item.name} style={styles.groupLink} onPress={() => router.push({ pathname: '/groups/[id]', params: { id: String(item.id) } })}>
        <View style={styles.groupSymbol}><Text style={styles.groupSymbolText}>{item.name.slice(0, 1)}</Text></View>
        <View style={styles.groupText}>
          <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.groupMeta}>{groupCards.length} 个单词 · {dueCount} 个待复习</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>
      {item.id !== DEFAULT_GROUP_ID ? <Pressable accessibilityRole="button" accessibilityLabel={'管理 ' + item.name}
        hitSlop={4} style={styles.iconButton} onPress={() => openDialog({ kind: 'edit', groupId: item.id })}>
        <Text style={styles.menuIcon}>⋯</Text>
      </Pressable> : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList<CollectionRow>
        data={rows}
        keyExtractor={(item) => item.kind === 'group' ? 'group-' + item.group.id : 'card-' + item.card.id}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
            <View style={styles.titleRow}>
              <Text style={styles.title}>单词组</Text>
              <AppButton label="新建分组" compact variant="quiet" onPress={() => openDialog({ kind: 'create' })} />
            </View>
            <Text style={styles.subtitle}>按场景整理，让需要的词更容易找到。</Text>
            <View style={styles.search}>
              <Text style={styles.searchIcon} accessible={false}>⌕</Text>
              <TextInput accessibilityLabel="搜索全部分组的单词或解释" placeholder="搜索全部单词或解释" placeholderTextColor={colors.muted}
                value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.searchInput} />
              {query ? <Pressable accessibilityRole="button" accessibilityLabel="清空搜索" style={styles.iconButton} onPress={() => setQuery('')}>
                <Text style={styles.clearIcon}>×</Text>
              </Pressable> : null}
            </View>
            <Text style={styles.listLabel}>{searching ? '搜索结果 · ' + results.length : '我的分组 · ' + groups.length}</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>没有匹配的单词，换个关键词试试。</Text>}
      />
      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={() => setDialog(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>{dialog?.kind === 'create' ? '新建单词组' : dialog?.kind === 'delete' ? '删除单词组？' : '管理单词组'}</Text>
              {dialog?.kind === 'delete' ? <>
                <Text style={styles.deleteHint}>删除「{managedGroup?.name}」后，其中 {cards.filter((card) => card.groupId === managedGroup?.id).length} 个单词将移回默认组。单词资料和复习记录会保留。</Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <AppButton label="删除分组，保留单词" variant="danger" onPress={confirmDelete} />
              </> : <>
                <AppTextField label="名称" placeholder="例如 考试词汇" value={name} onChangeText={setName} autoFocus error={error} onSubmitEditing={saveGroup} />
                <AppButton label={dialog?.kind === 'create' ? '创建单词组' : '保存名称'} onPress={saveGroup} />
                {dialog?.kind === 'edit' ? <AppButton label="删除单词组" variant="danger" onPress={() => openDialog({ kind: 'delete', groupId: dialog.groupId })} /> : null}
              </>}
              <AppButton label="取消" variant="secondary" onPress={() => setDialog(null)} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.xl, paddingTop: 32, paddingBottom: 48 },
  header: { marginBottom: 2 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: 8 },
  title: { color: colors.ink, fontSize: 34, fontWeight: '800', flexShrink: 1 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 7 },
  search: { marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingLeft: 14 },
  searchIcon: { color: colors.muted, fontSize: 25 }, searchInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 15, minHeight: 50, paddingHorizontal: 8 },
  clearIcon: { color: colors.muted, fontSize: 24 }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, menuIcon: { color: colors.inkSoft, fontSize: 26 },
  listLabel: { color: colors.inkSoft, fontSize: 14, fontWeight: '700', marginTop: 24, marginBottom: 14 },
  groupCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', marginBottom: 12, paddingRight: 8 },
  groupLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', padding: 16 },
  groupSymbol: { backgroundColor: colors.primarySoft, width: 48, height: 48, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  groupSymbolText: { color: colors.primary, fontSize: 22, fontWeight: '800' }, groupText: { flex: 1, minWidth: 0, marginLeft: 14 },
  groupName: { color: colors.ink, fontSize: 18, fontWeight: '800' }, groupMeta: { color: colors.muted, fontSize: 13, marginTop: 4 }, arrow: { color: colors.muted, fontSize: 28 },
  resultRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 16, marginBottom: 12 },
  resultCopy: { flex: 1, minWidth: 0, gap: 4 }, meaning: { color: colors.inkSoft, fontSize: 14 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 36, 31, 0.38)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.card, maxHeight: '90%' },
  modalContent: { padding: spacing.xl, gap: spacing.lg },
  deleteHint: { color: colors.inkSoft, fontSize: 15, lineHeight: 24 }, error: { color: colors.danger, fontSize: 13 },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
});
