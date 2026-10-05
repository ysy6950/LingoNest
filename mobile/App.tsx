import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type ReviewResult = 'known' | 'unknown';
type TabName = 'cards' | 'stats';

type WordCard = {
  id: number;
  word: string;
  meaning: string;
  isRevealed: boolean;
  groupId: number;
  reviewResult?: ReviewResult;
  lastReviewedAt?: string;
};

type WordGroup = {
  id: number;
  name: string;
};

const CARDS_STORAGE_KEY = 'lingonest.cards';
const GROUPS_STORAGE_KEY = 'lingonest.groups';
const DEMO_SEEDED_STORAGE_KEY = 'lingonest.demo-seeded';
const UNGROUPED_GROUP_ID = 0;
const DEFAULT_GROUP_ID = 1;

const initialGroups: WordGroup[] = [
  { id: DEFAULT_GROUP_ID, name: '默认组' },
  { id: UNGROUPED_GROUP_ID, name: '未分组' },
];

const demoCards: WordCard[] = [
  {
    id: -1,
    word: 'persist',
    meaning: 'to continue doing something',
    isRevealed: false,
    groupId: DEFAULT_GROUP_ID,
  },
  {
    id: -2,
    word: 'resilient',
    meaning: 'able to recover quickly after difficulties',
    isRevealed: false,
    groupId: DEFAULT_GROUP_ID,
  },
  {
    id: -3,
    word: 'consistent',
    meaning: 'reliable and steady over time',
    isRevealed: false,
    groupId: DEFAULT_GROUP_ID,
  },
  {
    id: -4,
    word: 'immerse',
    meaning: 'to become deeply involved in something',
    isRevealed: false,
    groupId: DEFAULT_GROUP_ID,
  },
];

function normalizeGroups(savedGroups: unknown): WordGroup[] {
  if (!Array.isArray(savedGroups) || savedGroups.length === 0) {
    return initialGroups;
  }

  const groups = savedGroups as WordGroup[];
  const hasDefault = groups.some((group) => group.id === DEFAULT_GROUP_ID);
  const hasUngrouped = groups.some(
    (group) => group.id === UNGROUPED_GROUP_ID,
  );

  return [
    ...(hasDefault ? [] : [{ id: DEFAULT_GROUP_ID, name: '默认组' }]),
    ...groups,
    ...(hasUngrouped ? [] : [{ id: UNGROUPED_GROUP_ID, name: '未分组' }]),
  ];
}

function normalizeCards(savedCards: unknown): WordCard[] {
  if (!Array.isArray(savedCards)) {
    return demoCards;
  }

  return (savedCards as WordCard[]).map((card) => ({
    ...card,
    groupId: card.groupId ?? DEFAULT_GROUP_ID,
  }));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('cards');
  const [wordInput, setWordInput] = useState('');
  const [meaningInput, setMeaningInput] = useState('');
  const [groupInput, setGroupInput] = useState('');
  const [cards, setCards] = useState<WordCard[]>(demoCards);
  const [groups, setGroups] = useState<WordGroup[]>(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState(DEFAULT_GROUP_ID);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [isGroupModalVisible, setIsGroupModalVisible] = useState(false);
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editingWord, setEditingWord] = useState('');
  const [editingMeaning, setEditingMeaning] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [savedCards, savedGroups, demoSeeded] = await Promise.all([
          AsyncStorage.getItem(CARDS_STORAGE_KEY),
          AsyncStorage.getItem(GROUPS_STORAGE_KEY),
          AsyncStorage.getItem(DEMO_SEEDED_STORAGE_KEY),
        ]);

        const parsedCards = savedCards === null ? null : JSON.parse(savedCards);
        const parsedGroups = savedGroups === null ? null : JSON.parse(savedGroups);
        let loadedCards = normalizeCards(parsedCards);

        if (demoSeeded !== 'true') {
          const existingWords = new Set(
            loadedCards.map((card) => card.word.toLowerCase()),
          );
          const missingDemoCards = demoCards.filter(
            (card) => !existingWords.has(card.word.toLowerCase()),
          );
          loadedCards = [...loadedCards, ...missingDemoCards];
          await AsyncStorage.setItem(DEMO_SEEDED_STORAGE_KEY, 'true');
        }

        setCards(loadedCards);
        setGroups(normalizeGroups(parsedGroups));
      } catch {
        setCards(demoCards);
        setGroups(initialGroups);
      } finally {
        setHasLoadedData(true);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (!hasLoadedData) {
      return;
    }

    AsyncStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
    AsyncStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  }, [cards, groups, hasLoadedData]);

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? initialGroups[0];

  const visibleCards = useMemo(
    () => cards.filter((card) => card.groupId === selectedGroupId),
    [cards, selectedGroupId],
  );

  const reviewedCount = visibleCards.filter((card) => card.reviewResult).length;
  const knownCount = visibleCards.filter(
    (card) => card.reviewResult === 'known',
  ).length;
  const unknownCount = visibleCards.filter(
    (card) => card.reviewResult === 'unknown',
  ).length;
  const reviewedTodayCount = visibleCards.filter((card) =>
    wasReviewedToday(card.lastReviewedAt),
  ).length;

  function handleAddGroup() {
    const nextGroupName = groupInput.trim();

    if (nextGroupName === '') {
      return;
    }

    if (
      groups.some(
        (group) => group.name.toLowerCase() === nextGroupName.toLowerCase(),
      )
    ) {
      Alert.alert('单词组已存在', '请换一个名称。');
      return;
    }

    const nextGroup = { id: Date.now(), name: nextGroupName };
    setGroups((currentGroups) => [...currentGroups, nextGroup]);
    setSelectedGroupId(nextGroup.id);
    setGroupInput('');
    setIsGroupModalVisible(false);
  }

  function handleAddWord() {
    const nextWord = wordInput.trim();
    const nextMeaning = meaningInput.trim();

    if (nextWord === '' || nextMeaning === '') {
      Alert.alert('还差一点', '请填写单词和解释后再添加。');
      return;
    }

    setCards((currentCards) => [
      ...currentCards,
      {
        id: Date.now(),
        word: nextWord,
        meaning: nextMeaning,
        isRevealed: false,
        groupId: selectedGroupId,
      },
    ]);
    setWordInput('');
    setMeaningInput('');
  }

  function toggleMeaning(cardId: number) {
    setCards((currentCards) =>
      currentCards.map((card) =>
        card.id === cardId
          ? { ...card, isRevealed: !card.isRevealed }
          : card,
      ),
    );
  }

  function handleReview(cardId: number, result: ReviewResult) {
    setCards((currentCards) =>
      currentCards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              reviewResult: result,
              lastReviewedAt: new Date().toISOString(),
              isRevealed: true,
            }
          : card,
      ),
    );
  }

  function handleMoveCard(cardId: number, destinationGroupId: number) {
    setCards((currentCards) =>
      currentCards.map((card) =>
        card.id === cardId ? { ...card, groupId: destinationGroupId } : card,
      ),
    );
  }

  function startEditing(card: WordCard) {
    setEditingCardId(card.id);
    setEditingWord(card.word);
    setEditingMeaning(card.meaning);
  }

  function saveEditing() {
    const nextWord = editingWord.trim();
    const nextMeaning = editingMeaning.trim();

    if (editingCardId === null || nextWord === '' || nextMeaning === '') {
      return;
    }

    setCards((currentCards) =>
      currentCards.map((card) =>
        card.id === editingCardId
          ? { ...card, word: nextWord, meaning: nextMeaning }
          : card,
      ),
    );
    cancelEditing();
  }

  function deleteCard(cardId: number) {
    Alert.alert('删除单词', '删除后无法恢复，确定要删除这张卡吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () =>
          setCards((currentCards) =>
            currentCards.filter((card) => card.id !== cardId),
          ),
      },
    ]);
  }

  function cancelEditing() {
    setEditingCardId(null);
    setEditingWord('');
    setEditingMeaning('');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>ENGLISH HABIT BUILDER</Text>
              <Text style={styles.title}>LingoNest</Text>
              <Text style={styles.subtitle}>每天认识一个新单词</Text>
            </View>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeNumber}>{cards.length}</Text>
              <Text style={styles.headerBadgeLabel}>单词</Text>
            </View>
          </View>

          <View style={styles.tabBar}>
            <TabButton
              label="我的单词"
              active={activeTab === 'cards'}
              onPress={() => setActiveTab('cards')}
            />
            <TabButton
              label="学习统计"
              active={activeTab === 'stats'}
              onPress={() => setActiveTab('stats')}
            />
          </View>

          {activeTab === 'cards' ? (
            <>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>单词组</Text>
                  <Text style={styles.sectionHint}>先选择一个学习场景</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.groupListContent}
              >
                <Pressable
                  accessibilityLabel="新建单词组"
                  style={styles.addGroupButton}
                  onPress={() => setIsGroupModalVisible(true)}
                >
                  <Text style={styles.addGroupPlus}>＋</Text>
                </Pressable>
                {groups.map((group) => {
                  const groupCount = cards.filter(
                    (card) => card.groupId === group.id,
                  ).length;

                  return (
                    <Pressable
                      key={group.id}
                      style={[
                        styles.groupButton,
                        group.id === selectedGroupId &&
                          styles.selectedGroupButton,
                      ]}
                      onPress={() => setSelectedGroupId(group.id)}
                    >
                      <Text
                        style={[
                          styles.groupButtonText,
                          group.id === selectedGroupId &&
                            styles.selectedGroupButtonText,
                        ]}
                      >
                        {group.name}
                      </Text>
                      <Text
                        style={[
                          styles.groupCount,
                          group.id === selectedGroupId &&
                            styles.selectedGroupCount,
                        ]}
                      >
                        {groupCount}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.currentGroupCard}>
                <View>
                  <Text style={styles.currentGroupLabel}>正在学习</Text>
                  <Text style={styles.currentGroupName}>{selectedGroup.name}</Text>
                </View>
                <Text style={styles.currentGroupCount}>
                  {visibleCards.length} 个单词
                </Text>
              </View>

              <View style={styles.addWordCard}>
                <Text style={styles.cardSectionTitle}>添加新单词</Text>
                <Text style={styles.cardSectionHint}>
                  新单词会加入“{selectedGroup.name}”
                </Text>
                <TextInput
                  placeholder="单词，例如 resilient"
                  placeholderTextColor="#9CA3AF"
                  value={wordInput}
                  onChangeText={setWordInput}
                  style={styles.input}
                  autoCapitalize="none"
                />
                <TextInput
                  placeholder="英语或中文解释"
                  placeholderTextColor="#9CA3AF"
                  value={meaningInput}
                  onChangeText={setMeaningInput}
                  style={styles.input}
                />
                <Pressable style={styles.primaryButton} onPress={handleAddWord}>
                  <Text style={styles.primaryButtonText}>添加到当前组</Text>
                </Pressable>
              </View>

              <View style={styles.listHeader}>
                <View>
                  <Text style={styles.sectionTitle}>单词卡</Text>
                  <Text style={styles.sectionHint}>点击卡片翻面查看解释</Text>
                </View>
                <Text style={styles.listCount}>{visibleCards.length} 张</Text>
              </View>

              {visibleCards.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>＋</Text>
                  <Text style={styles.emptyTitle}>这个单词组还没有单词</Text>
                  <Text style={styles.emptyHint}>使用上方表单添加第一张卡片</Text>
                </View>
              ) : (
                visibleCards.map((card) => (
                  <WordCardView
                    key={card.id}
                    card={card}
                    groups={groups}
                    onToggleMeaning={toggleMeaning}
                    onReview={handleReview}
                    onMove={handleMoveCard}
                    onEdit={startEditing}
                    onDelete={deleteCard}
                  />
                ))
              )}
            </>
          ) : (
            <StatsView
              cards={cards}
              visibleCards={visibleCards}
              selectedGroup={selectedGroup}
              reviewedTodayCount={reviewedTodayCount}
              reviewedCount={reviewedCount}
              knownCount={knownCount}
              unknownCount={unknownCount}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={isGroupModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsGroupModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>新建单词组</Text>
            <Text style={styles.modalHint}>例如：考试词汇、旅行英语、每日积累</Text>
            <TextInput
              autoFocus
              placeholder="输入单词组名称"
              placeholderTextColor="#9CA3AF"
              value={groupInput}
              onChangeText={setGroupInput}
              style={styles.input}
              onSubmitEditing={handleAddGroup}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => setIsGroupModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>取消</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={handleAddGroup}>
                <Text style={styles.primaryButtonText}>创建单词组</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingCardId !== null}
        transparent
        animationType="fade"
        onRequestClose={cancelEditing}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>修改单词卡</Text>
            <TextInput
              placeholder="单词"
              placeholderTextColor="#9CA3AF"
              value={editingWord}
              onChangeText={setEditingWord}
              style={styles.input}
              autoCapitalize="none"
            />
            <TextInput
              placeholder="解释"
              placeholderTextColor="#9CA3AF"
              value={editingMeaning}
              onChangeText={setEditingMeaning}
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={cancelEditing}>
                <Text style={styles.secondaryButtonText}>取消</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={saveEditing}>
                <Text style={styles.primaryButtonText}>保存修改</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tabButton, active && styles.activeTabButton]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active && styles.activeTabText]}>{label}</Text>
    </Pressable>
  );
}

function WordCardView({
  card,
  groups,
  onToggleMeaning,
  onReview,
  onMove,
  onEdit,
  onDelete,
}: {
  card: WordCard;
  groups: WordGroup[];
  onToggleMeaning: (cardId: number) => void;
  onReview: (cardId: number, result: ReviewResult) => void;
  onMove: (cardId: number, groupId: number) => void;
  onEdit: (card: WordCard) => void;
  onDelete: (cardId: number) => void;
}) {
  return (
    <View style={styles.wordCard}>
      <Pressable
        style={[styles.cardFace, card.isRevealed && styles.cardBack]}
        onPress={() => onToggleMeaning(card.id)}
      >
        <Text style={styles.cardFaceLabel}>{card.isRevealed ? '解释' : '单词'}</Text>
        <Text style={styles.cardWord}>{card.isRevealed ? card.meaning : card.word}</Text>
        <Text style={styles.flipHint}>
          {card.isRevealed ? '点击翻回单词' : '点击翻面查看解释'}
        </Text>
      </Pressable>

      <View style={styles.cardToolbar}>
        <Pressable style={styles.toolButton} onPress={() => onEdit(card)}>
          <Text style={styles.toolButtonText}>修改</Text>
        </Pressable>
        <Pressable style={styles.toolButton} onPress={() => onDelete(card.id)}>
          <Text style={styles.deleteButtonText}>删除</Text>
        </Pressable>
      </View>

      <View style={styles.reviewActions}>
        <Pressable
          style={[styles.reviewButton, styles.knownButton]}
          onPress={() => onReview(card.id, 'known')}
        >
          <Text style={styles.reviewButtonText}>认识</Text>
        </Pressable>
        <Pressable
          style={[styles.reviewButton, styles.unknownButton]}
          onPress={() => onReview(card.id, 'unknown')}
        >
          <Text style={styles.reviewButtonText}>不认识</Text>
        </Pressable>
      </View>

      {card.reviewResult ? (
        <Text style={styles.reviewStatus}>
          最近复习：{card.reviewResult === 'known' ? '认识' : '不认识'}
        </Text>
      ) : null}

      <Text style={styles.moveLabel}>移动到其他组</Text>
      <View style={styles.moveActions}>
        {groups
          .filter((group) => group.id !== card.groupId)
          .map((group) => (
            <Pressable
              key={group.id}
              style={styles.moveButton}
              onPress={() => onMove(card.id, group.id)}
            >
              <Text style={styles.moveButtonText}>{group.name}</Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

function StatsView({
  cards,
  visibleCards,
  selectedGroup,
  reviewedTodayCount,
  reviewedCount,
  knownCount,
  unknownCount,
}: {
  cards: WordCard[];
  visibleCards: WordCard[];
  selectedGroup: WordGroup;
  reviewedTodayCount: number;
  reviewedCount: number;
  knownCount: number;
  unknownCount: number;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>学习统计</Text>
      <Text style={styles.sectionHint}>看看自己的学习进度</Text>
      <View style={styles.statsGrid}>
        <StatTile label="全部单词" value={cards.length} color="#2563EB" />
        <StatTile label="当前组" value={visibleCards.length} color="#7C3AED" />
        <StatTile label="今日复习" value={reviewedTodayCount} color="#059669" />
        <StatTile label="已复习" value={reviewedCount} color="#D97706" />
      </View>
      <View style={styles.statsDetailCard}>
        <Text style={styles.cardSectionTitle}>{selectedGroup.name} · 复习结果</Text>
        <Text style={styles.statsDetailText}>认识：{knownCount}</Text>
        <Text style={styles.statsDetailText}>不认识：{unknownCount}</Text>
        <Text style={styles.statsDetailText}>
          尚未复习：{visibleCards.length - reviewedCount}
        </Text>
      </View>
    </View>
  );
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={[styles.statTile, { borderTopColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function wasReviewedToday(lastReviewedAt?: string) {
  if (!lastReviewedAt) {
    return false;
  }

  const reviewedDate = new Date(lastReviewedAt);
  const today = new Date();

  return (
    reviewedDate.getFullYear() === today.getFullYear() &&
    reviewedDate.getMonth() === today.getMonth() &&
    reviewedDate.getDate() === today.getDate()
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#F7F8FC', flex: 1 },
  flex: { flex: 1 },
  container: { paddingBottom: 40, paddingHorizontal: 20, paddingTop: 24 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#7C3AED',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: { color: '#172033', fontSize: 34, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#64748B', fontSize: 15, marginTop: 4 },
  headerBadge: {
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderRadius: 18,
    minWidth: 66,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerBadgeNumber: { color: '#6D28D9', fontSize: 22, fontWeight: '800' },
  headerBadgeLabel: { color: '#7C3AED', fontSize: 12, marginTop: 2 },
  tabBar: {
    backgroundColor: '#EDEFF5',
    borderRadius: 14,
    flexDirection: 'row',
    marginTop: 24,
    padding: 4,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingVertical: 11,
  },
  activeTabButton: { backgroundColor: '#FFFFFF' },
  tabText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  activeTabText: { color: '#4C1D95' },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 26,
  },
  sectionTitle: { color: '#172033', fontSize: 21, fontWeight: '800' },
  sectionHint: { color: '#94A3B8', fontSize: 13, marginTop: 3 },
  addGroupButton: {
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  addGroupPlus: { color: '#FFFFFF', fontSize: 28, fontWeight: '300', lineHeight: 30 },
  groupListContent: { gap: 10, paddingVertical: 14 },
  groupButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  selectedGroupButton: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  groupButtonText: { color: '#475569', fontSize: 14, fontWeight: '600' },
  selectedGroupButtonText: { color: '#FFFFFF' },
  groupCount: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    color: '#64748B',
    fontSize: 12,
    minWidth: 22,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: 'center',
  },
  selectedGroupCount: { backgroundColor: '#60A5FA', color: '#FFFFFF' },
  currentGroupCard: {
    alignItems: 'center',
    backgroundColor: '#172033',
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  currentGroupLabel: { color: '#CBD5E1', fontSize: 12 },
  currentGroupName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 3 },
  currentGroupCount: { color: '#93C5FD', fontSize: 15, fontWeight: '700' },
  addWordCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 18,
    padding: 18,
  },
  cardSectionTitle: { color: '#172033', fontSize: 17, fontWeight: '800' },
  cardSectionHint: { color: '#94A3B8', fontSize: 13, marginTop: 4 },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    color: '#172033',
    fontSize: 15,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  listHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  listCount: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginTop: 14,
    padding: 30,
  },
  emptyIcon: { color: '#94A3B8', fontSize: 28 },
  emptyTitle: { color: '#475569', fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptyHint: { color: '#94A3B8', fontSize: 13, marginTop: 5 },
  wordCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  cardFace: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 15,
    justifyContent: 'center',
    minHeight: 150,
    padding: 20,
  },
  cardBack: { backgroundColor: '#F5F3FF' },
  cardFaceLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  cardWord: { color: '#172033', fontSize: 27, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  flipHint: { color: '#64748B', fontSize: 12, marginTop: 14 },
  cardToolbar: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  toolButton: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  toolButtonText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  deleteButtonText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },
  reviewActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  reviewButton: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', paddingVertical: 11 },
  knownButton: { backgroundColor: '#059669' },
  unknownButton: { backgroundColor: '#D97706' },
  reviewButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  reviewStatus: { color: '#64748B', fontSize: 12, marginTop: 10 },
  moveLabel: { color: '#94A3B8', fontSize: 12, marginTop: 14 },
  moveActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 },
  moveButton: { backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  moveButtonText: { color: '#6D28D9', fontSize: 12, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  statTile: { backgroundColor: '#FFFFFF', borderRadius: 16, borderTopWidth: 4, flexBasis: '47%', flexGrow: 1, padding: 18 },
  statValue: { color: '#172033', fontSize: 28, fontWeight: '800' },
  statLabel: { color: '#64748B', fontSize: 13, marginTop: 4 },
  statsDetailCard: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 18 },
  statsDetailText: { color: '#475569', fontSize: 15, marginTop: 10 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.45)', flex: 1, justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22, width: '100%' },
  modalTitle: { color: '#172033', fontSize: 21, fontWeight: '800' },
  modalHint: { color: '#64748B', fontSize: 13, lineHeight: 19, marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, flex: 1, justifyContent: 'center', paddingVertical: 13 },
  secondaryButtonText: { color: '#475569', fontSize: 15, fontWeight: '700' },
});
