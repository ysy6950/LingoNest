import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getVisibleGroupCards, type CardSortMode } from '../../cardCollection';
import { WordPreviewCard } from '../../components/WordPreviewCard';
import { colors, radius, spacing } from '../../components/theme';
import { isReviewDue } from '../../reviewScheduler';
import { useLingoStore, type WordCard } from '../../store/useLingoStore';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Number(id);
  const groups = useLingoStore((state) => state.groups);
  const cards = useLingoStore((state) => state.cards);
  const reviews = useLingoStore((state) => state.reviews);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CardSortMode>('newest');
  const group = groups.find((item) => item.id === groupId);
  const groupCards = cards.filter((card) => card.groupId === groupId);
  const dueCount = groupCards.filter((card) => isReviewDue(reviews[card.id], Date.now())).length;

  const visibleCards = useMemo(
    () => getVisibleGroupCards(cards, groupId, reviews, search, sort),
    [cards, groupId, reviews, search, sort],
  );

  function renderCard({ item }: { item: WordCard }) {
    return (
      <View style={styles.column}>
        <WordPreviewCard
          word={item.word}
          meaning={item.meaning}
          due={isReviewDue(reviews[item.id], Date.now())}
          onPress={() => router.push({ pathname: '/cards/[id]', params: { id: String(item.id), sort } })}
        />
      </View>
    );
  }

  if (!group) {
    return <SafeAreaView style={styles.safe}><View style={styles.missing}><Text style={styles.emptyTitle}>找不到这个单词组</Text><Pressable onPress={() => router.back()}><Text style={styles.link}>返回单词组</Text></Pressable></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={visibleCards}
        numColumns={2}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderCard}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} accessibilityLabel="返回单词组"><Text style={styles.back}>← 单词组</Text></Pressable>
            <Text style={styles.title}>{group.name}</Text>
            <Text style={styles.subtitle}>{groupCards.length} 个单词 · {dueCount} 个待复习</Text>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput placeholder="搜索单词或解释" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} style={styles.searchInput} accessibilityLabel="搜索单词或解释" />
            </View>
            <View style={styles.sortRow}>
              {([['newest', '最近添加'], ['az', '字母顺序'], ['due', '待复习优先']] as const).map(([value, label]) => (
                <Pressable key={value} style={[styles.sortChip, sort === value && styles.sortChipActive]} onPress={() => setSort(value)}>
                  <Text style={[styles.sortText, sort === value && styles.sortTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{search ? '没有找到匹配的单词' : '这个组还没有单词'}</Text><Text style={styles.emptyHint}>{search ? '试试其他关键词' : '到添加页记录第一张卡片'}</Text></View>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 50, flexGrow: 1 },
  header: { marginBottom: spacing.lg }, back: { color: colors.primary, fontSize: 14, fontWeight: '700', marginBottom: 24 },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 14, marginTop: 7 },
  searchBox: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', marginTop: 24, paddingHorizontal: 14 },
  searchIcon: { color: colors.muted, fontSize: 25 }, searchInput: { flex: 1, color: colors.ink, fontSize: 15, minHeight: 50, marginLeft: 8 },
  sortRow: { flexDirection: 'row', gap: 7, marginTop: 14 },
  sortChip: { borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8 },
  sortChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  sortText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, sortTextActive: { color: colors.primary },
  columns: { justifyContent: 'space-between', marginBottom: 12 }, column: { width: '48%', minWidth: 0 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 70 }, missing: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' }, emptyHint: { color: colors.muted, marginTop: 8 }, link: { color: colors.primary, marginTop: 16 },
});
