import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type WordCard = {
  id: number;
  word: string;
  meaning: string;
  isRevealed: boolean;
  groupId: number;
  reviewResult?: 'known' | 'unknown';
  lastReviewedAt?: string;
};

type WordGroup = {
  id: number;
  name: string;
};

const CARDS_STORAGE_KEY = 'lingonest.cards';
const GROUPS_STORAGE_KEY = 'lingonest.groups';
const UNGROUPED_GROUP_ID = 0;

const initialGroups: WordGroup[] = [
  { id: 1, name: '默认组' },
  { id: UNGROUPED_GROUP_ID, name: '未分组' },
];

const initialCards: WordCard[] = [
  {
    id: 1,
    word: 'persist',
    meaning: 'to continue doing something',
    isRevealed: false,
    groupId: 1,
  },
];

export default function App() {
  const [wordInput, setWordInput] = useState('');
  const [meaningInput, setMeaningInput] = useState('');
  const [groupInput, setGroupInput] = useState('');
  const [cards, setCards] = useState<WordCard[]>(initialCards);
  const [groups, setGroups] = useState<WordGroup[]>(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState(1);
  const [hasLoadedData, setHasLoadedData] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [savedCards, savedGroups] = await Promise.all([
          AsyncStorage.getItem(CARDS_STORAGE_KEY),
          AsyncStorage.getItem(GROUPS_STORAGE_KEY),
        ]);

        if (savedCards !== null) {
          const parsedCards: unknown = JSON.parse(savedCards);

          if (Array.isArray(parsedCards)) {
            const migratedCards = parsedCards.map((card) => ({
              ...(card as WordCard),
              groupId: (card as WordCard).groupId ?? 1,
            }));
            setCards(migratedCards);
          }
        }

        if (savedGroups !== null) {
          const parsedGroups: unknown = JSON.parse(savedGroups);

          if (Array.isArray(parsedGroups) && parsedGroups.length > 0) {
            const savedGroupList = parsedGroups as WordGroup[];
            const hasUngrouped = savedGroupList.some(
              (group) => group.id === UNGROUPED_GROUP_ID,
            );
            setGroups(
              hasUngrouped
                ? savedGroupList
                : [...savedGroupList, { id: UNGROUPED_GROUP_ID, name: '未分组' }],
            );
          }
        }
      } catch {
        setCards(initialCards);
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

  function handleAddGroup() {
    const nextGroupName = groupInput.trim();

    if (nextGroupName === '') {
      return;
    }

    const nextGroup = { id: Date.now(), name: nextGroupName };
    setGroups((currentGroups) => [...currentGroups, nextGroup]);
    setSelectedGroupId(nextGroup.id);
    setGroupInput('');
  }

  function handleAddWord() {
    const nextWord = wordInput.trim();
    const nextMeaning = meaningInput.trim();

    if (nextWord === '' || nextMeaning === '') {
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

  function handleReview(cardId: number, result: 'known' | 'unknown') {
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

  const visibleCards = cards.filter(
    (card) => card.groupId === selectedGroupId,
  );
  const reviewedCount = visibleCards.filter((card) => card.reviewResult).length;
  const knownCount = visibleCards.filter(
    (card) => card.reviewResult === 'known',
  ).length;
  const unknownCount = visibleCards.filter(
    (card) => card.reviewResult === 'unknown',
  ).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LingoNest</Text>
      <Text style={styles.subtitle}>我的单词学习空间</Text>

      <Text style={styles.sectionTitle}>单词组</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.groupList}
        contentContainerStyle={styles.groupListContent}
      >
        {groups.map((group) => (
          <Pressable
            key={group.id}
            style={[
              styles.groupButton,
              group.id === selectedGroupId && styles.selectedGroupButton,
            ]}
            onPress={() => setSelectedGroupId(group.id)}
          >
            <Text
              style={[
                styles.groupButtonText,
                group.id === selectedGroupId && styles.selectedGroupButtonText,
              ]}
            >
              {group.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.groupInputRow}>
        <TextInput
          placeholder="新建单词组"
          value={groupInput}
          onChangeText={setGroupInput}
          style={styles.groupInput}
        />
        <Pressable style={styles.groupAddButton} onPress={handleAddGroup}>
          <Text style={styles.buttonText}>新建</Text>
        </Pressable>
      </View>

      <TextInput
        placeholder="输入一个单词，例如 resilient"
        value={wordInput}
        onChangeText={setWordInput}
        style={styles.input}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="输入英语或中文解释"
        value={meaningInput}
        onChangeText={setMeaningInput}
        style={styles.input}
      />
      <Pressable style={styles.addButton} onPress={handleAddWord}>
        <Text style={styles.buttonText}>添加单词</Text>
      </Pressable>

      <Text style={styles.count}>
        当前组：{groups.find((group) => group.id === selectedGroupId)?.name}
      </Text>
      <Text style={styles.count}>当前组有 {visibleCards.length} 个单词</Text>
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>学习统计</Text>
        <Text style={styles.statsText}>已复习：{reviewedCount}</Text>
        <Text style={styles.statsText}>认识：{knownCount}</Text>
        <Text style={styles.statsText}>不认识：{unknownCount}</Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {visibleCards.map((card) => (
          <View key={card.id} style={styles.card}>
            <Pressable
              style={styles.cardTapArea}
              onPress={() => toggleMeaning(card.id)}
            >
              <Text style={styles.word}>{card.word}</Text>
              {card.isRevealed ? (
                <Text style={styles.meaning}>{card.meaning}</Text>
              ) : (
                <Text style={styles.hint}>点击查看解释</Text>
              )}
            </Pressable>

            <View style={styles.reviewActions}>
              <Pressable
                style={[styles.reviewButton, styles.knownButton]}
                onPress={() => handleReview(card.id, 'known')}
              >
                <Text style={styles.reviewButtonText}>认识</Text>
              </Pressable>
              <Pressable
                style={[styles.reviewButton, styles.unknownButton]}
                onPress={() => handleReview(card.id, 'unknown')}
              >
                <Text style={styles.reviewButtonText}>不认识</Text>
              </Pressable>
            </View>

            {card.reviewResult ? (
              <Text style={styles.reviewStatus}>
                最近复习：{card.reviewResult === 'known' ? '认识' : '不认识'}
              </Text>
            ) : null}

            <Text style={styles.moveLabel}>移动到：</Text>
            <View style={styles.moveActions}>
              {groups
                .filter((group) => group.id !== card.groupId)
                .map((group) => (
                  <Pressable
                    key={group.id}
                    style={styles.moveButton}
                    onPress={() => handleMoveCard(card.id, group.id)}
                  >
                    <Text style={styles.moveButtonText}>{group.name}</Text>
                  </Pressable>
                ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 24,
    paddingTop: 48,
  },
  title: {
    color: '#1F2937',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 18,
  },
  groupList: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
  groupListContent: {
    gap: 8,
  },
  groupButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  selectedGroupButton: {
    backgroundColor: '#2563EB',
  },
  groupButtonText: {
    color: '#374151',
    fontSize: 14,
  },
  selectedGroupButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  groupInputRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  groupInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  groupAddButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  addButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  count: {
    alignSelf: 'flex-start',
    color: '#6B7280',
    fontSize: 14,
    marginTop: 20,
  },
  statsCard: {
    alignSelf: 'stretch',
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
    marginTop: 8,
    padding: 14,
  },
  statsTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statsText: {
    color: '#334155',
    fontSize: 14,
    marginTop: 2,
  },
  list: {
    alignSelf: 'stretch',
    flex: 1,
    marginTop: 4,
    width: '100%',
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 3,
    marginTop: 32,
    minHeight: 220,
    justifyContent: 'center',
    padding: 24,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    width: '100%',
  },
  cardTapArea: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  word: {
    color: '#111827',
    fontSize: 40,
    fontWeight: '700',
  },
  hint: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 24,
  },
  meaning: {
    color: '#2563EB',
    fontSize: 20,
    marginTop: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  reviewButton: {
    borderRadius: 10,
    minWidth: 92,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  knownButton: {
    backgroundColor: '#059669',
  },
  unknownButton: {
    backgroundColor: '#D97706',
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  reviewStatus: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 10,
  },
  moveLabel: {
    alignSelf: 'flex-start',
    color: '#6B7280',
    fontSize: 13,
    marginTop: 14,
  },
  moveActions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  moveButton: {
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  moveButtonText: {
    color: '#6D28D9',
    fontSize: 13,
  },
});
