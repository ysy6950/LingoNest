import { useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { colors, radius, spacing } from '../../components/theme';
import { isReviewDue } from '../../reviewScheduler';
import { useLingoStore, type WordGroup } from '../../store/useLingoStore';

export default function GroupsScreen() {
  const groups = useLingoStore((state) => state.groups);
  const cards = useLingoStore((state) => state.cards);
  const reviews = useLingoStore((state) => state.reviews);
  const addGroup = useLingoStore((state) => state.addGroup);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function createGroup() {
    const id = addGroup(name);
    if (id === null) {
      setError('请输入不重复的单词组名称。');
      return;
    }
    setName(''); setError(''); setModalOpen(false);
    router.push({ pathname: '/groups/[id]', params: { id: String(id) } });
  }

  function renderGroup({ item }: { item: WordGroup }) {
    const groupCards = cards.filter((card) => card.groupId === item.id);
    const dueCount = groupCards.filter((card) => isReviewDue(reviews[card.id], Date.now())).length;
    return (
      <Pressable style={styles.groupCard} onPress={() => router.push({ pathname: '/groups/[id]', params: { id: String(item.id) } })}>
        <View style={styles.groupSymbol}><Text style={styles.groupSymbolText}>{item.name.slice(0, 1)}</Text></View>
        <View style={styles.groupText}>
          <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.groupMeta}>{groupCards.length} 个单词 · {dueCount} 个待复习</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={groups}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderGroup}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
            <Text style={styles.title}>单词组</Text>
            <Text style={styles.subtitle}>按场景整理，让需要的词更容易找到。</Text>
            <AppButton label="＋ 新建单词组" variant="quiet" onPress={() => setModalOpen(true)} style={styles.newGroup} />
            <Text style={styles.listLabel}>我的分组 · {groups.length}</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>还没有单词组，先创建一个吧。</Text>}
      />
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>新建单词组</Text>
            <AppTextField label="名称" placeholder="例如 考试词汇" value={name} onChangeText={setName} autoFocus error={error} />
            <AppButton label="创建单词组" onPress={createGroup} />
            <AppButton label="取消" variant="secondary" onPress={() => { setModalOpen(false); setError(''); }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.xl, paddingTop: 32, paddingBottom: 48 },
  header: { marginBottom: 2 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 34, fontWeight: '800', marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 7 },
  newGroup: { marginTop: spacing.xxl }, listLabel: { color: colors.inkSoft, fontSize: 14, fontWeight: '700', marginTop: 30, marginBottom: 14 },
  groupCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', marginBottom: 12, padding: 16 },
  groupSymbol: { backgroundColor: colors.primarySoft, width: 48, height: 48, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  groupSymbolText: { color: colors.primary, fontSize: 22, fontWeight: '800' }, groupText: { flex: 1, marginLeft: 14 },
  groupName: { color: colors.ink, fontSize: 18, fontWeight: '800' }, groupMeta: { color: colors.muted, fontSize: 13, marginTop: 4 }, arrow: { color: colors.muted, fontSize: 28 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 60 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 36, 31, 0.38)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, gap: spacing.lg },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
});
