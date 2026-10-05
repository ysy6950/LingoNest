import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  INITIAL_REVIEW_STATE,
  migrateLegacyReview,
  scheduleNextReview,
  type ReviewResult,
  type ReviewState,
} from '../reviewScheduler';

export type WordCard = {
  id: number;
  word: string;
  meaning: string;
  groupId: number;
  createdAt: number;
};

export type WordGroup = {
  id: number;
  name: string;
};

export const DEFAULT_GROUP_ID = 1;
export const UNGROUPED_GROUP_ID = 0;

const STORAGE_KEY = 'lingonest.v2';
const LEGACY_CARDS_KEY = 'lingonest.cards';
const LEGACY_GROUPS_KEY = 'lingonest.groups';
const LEGACY_DEMO_SEEDED_KEY = 'lingonest.demo-seeded';
const SAVE_ERROR = '保存失败，请检查设备存储后重试。';

const SYSTEM_GROUPS: WordGroup[] = [
  { id: DEFAULT_GROUP_ID, name: '默认组' },
  { id: UNGROUPED_GROUP_ID, name: '未分组' },
];

const DEMO_WORDS = [
  { id: -1, word: 'persist', meaning: 'to continue doing something' },
  { id: -2, word: 'resilient', meaning: 'able to recover quickly after difficulties' },
  { id: -3, word: 'consistent', meaning: 'reliable and steady over time' },
  { id: -4, word: 'immerse', meaning: 'to become deeply involved in something' },
] as const;

type Snapshot = {
  version: 2;
  cards: WordCard[];
  groups: WordGroup[];
  reviews: Record<number, ReviewState>;
  selectedGroupId: number;
};

type LingoState = {
  cards: WordCard[];
  groups: WordGroup[];
  reviews: Record<number, ReviewState>;
  selectedGroupId: number;
  isHydrated: boolean;
  isHydrating: boolean;
  isSaving: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  retrySave: () => Promise<boolean>;
  addCard: (word: string, meaning: string, groupId: number) => number | null;
  editCard: (cardId: number, word: string, meaning: string) => boolean;
  deleteCard: (cardId: number) => void;
  moveCard: (cardId: number, groupId: number) => void;
  addGroup: (name: string) => number | null;
  selectGroup: (groupId: number) => void;
  answerReview: (cardId: number, result: ReviewResult, nowMs?: number) => void;
};

let hydrationPromise: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let latestSaveRevision = 0;

/** The v2 snapshot is saved before hydration is exposed to the UI. */
export const useLingoStore = create<LingoState>((set, get) => {
  function saveCurrentState(): Promise<boolean> {
    const { cards, groups, reviews, selectedGroupId } = get();
    const snapshot: Snapshot = {
      version: 2,
      cards,
      groups,
      reviews,
      selectedGroupId,
    };
    const revision = ++latestSaveRevision;
    set({ isSaving: true });

    // Serializing writes prevents an older screen action from landing after a
    // newer one. A failed write does not prevent the next action from retrying.
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)));
    return writeQueue.then(
      () => {
        if (revision === latestSaveRevision) set({ isSaving: false, error: null });
        return true;
      },
      () => {
        if (revision === latestSaveRevision) set({ isSaving: false, error: SAVE_ERROR });
        return false;
      },
    );
  }

  return {
    cards: [],
    groups: SYSTEM_GROUPS,
    reviews: {},
    selectedGroupId: DEFAULT_GROUP_ID,
    isHydrated: false,
    isHydrating: false,
    isSaving: false,
    error: null,

    hydrate: async () => {
      if (get().isHydrated) return;
      if (hydrationPromise) return hydrationPromise;

      set({ isHydrating: true, error: null });
      hydrationPromise = (async () => {
        try {
          const storedV2 = await AsyncStorage.getItem(STORAGE_KEY);
          let snapshot: Snapshot;

          if (storedV2 !== null) {
            snapshot = readV2(storedV2);
          } else {
            snapshot = await migrateLegacyData();
            // Keep the old keys as a recovery copy. Migration is safe to retry:
            // v2 becomes authoritative as soon as this write succeeds.
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
          }

          set({
            cards: snapshot.cards,
            groups: snapshot.groups,
            reviews: snapshot.reviews,
            selectedGroupId: snapshot.selectedGroupId,
            isHydrated: true,
            isHydrating: false,
            isSaving: false,
            error: null,
          });
        } catch {
          // A corrupt or unavailable store must not be replaced with demo cards.
          // Keep the UI unhydrated so the old data can be recovered or retried.
          set({
            isHydrated: false,
            isHydrating: false,
            isSaving: false,
            error: '读取本地数据失败。请重试；原有数据尚未被覆盖。',
          });
        } finally {
          hydrationPromise = null;
        }
      })();
      return hydrationPromise;
    },

    retrySave: () => {
      if (!get().isHydrated) return Promise.resolve(false);
      // Read the current state, not the snapshot from the failed attempt.
      return saveCurrentState();
    },

    addCard: (word, meaning, groupId) => {
      const current = get();
      const nextWord = word.trim();
      const nextMeaning = meaning.trim();
      if (
        !current.isHydrated ||
        !nextWord ||
        !nextMeaning ||
        !current.groups.some((group) => group.id === groupId)
      ) return null;

      const id = uniqueId(current.cards.map((card) => card.id));
      const card: WordCard = {
        id,
        word: nextWord,
        meaning: nextMeaning,
        groupId,
        createdAt: Date.now(),
      };
      set({
        cards: [...current.cards, card],
        reviews: { ...current.reviews, [id]: { ...INITIAL_REVIEW_STATE } },
        selectedGroupId: groupId,
      });
      saveCurrentState();
      return id;
    },

    editCard: (cardId, word, meaning) => {
      const current = get();
      const nextWord = word.trim();
      const nextMeaning = meaning.trim();
      if (
        !current.isHydrated ||
        !nextWord ||
        !nextMeaning ||
        !current.cards.some((card) => card.id === cardId)
      ) return false;

      set({
        cards: current.cards.map((card) =>
          card.id === cardId ? { ...card, word: nextWord, meaning: nextMeaning } : card,
        ),
      });
      saveCurrentState();
      return true;
    },

    deleteCard: (cardId) => {
      const current = get();
      if (!current.isHydrated || !current.cards.some((card) => card.id === cardId)) return;
      const reviews = { ...current.reviews };
      delete reviews[cardId];
      set({
        cards: current.cards.filter((card) => card.id !== cardId),
        reviews,
      });
      saveCurrentState();
    },

    moveCard: (cardId, groupId) => {
      const current = get();
      if (
        !current.isHydrated ||
        !current.cards.some((card) => card.id === cardId) ||
        !current.groups.some((group) => group.id === groupId)
      ) return;
      set({
        cards: current.cards.map((card) =>
          card.id === cardId ? { ...card, groupId } : card,
        ),
      });
      saveCurrentState();
    },

    addGroup: (name) => {
      const current = get();
      const nextName = name.trim();
      if (
        !current.isHydrated ||
        !nextName ||
        current.groups.some((group) => group.name.toLocaleLowerCase() === nextName.toLocaleLowerCase())
      ) return null;

      const id = uniqueId(current.groups.map((group) => group.id));
      set({
        groups: [...current.groups, { id, name: nextName }],
        selectedGroupId: id,
      });
      saveCurrentState();
      return id;
    },

    selectGroup: (groupId) => {
      const current = get();
      if (
        !current.isHydrated ||
        current.selectedGroupId === groupId ||
        !current.groups.some((group) => group.id === groupId)
      ) return;
      set({ selectedGroupId: groupId });
      saveCurrentState();
    },

    answerReview: (cardId, result, nowMs = Date.now()) => {
      const current = get();
      if (
        !current.isHydrated ||
        !current.cards.some((card) => card.id === cardId) ||
        !['again', 'hard', 'remembered'].includes(result)
      ) return;
      const previous = current.reviews[cardId] ?? INITIAL_REVIEW_STATE;
      set({
        reviews: {
          ...current.reviews,
          [cardId]: scheduleNextReview(previous, result, nowMs),
        },
      });
      saveCurrentState();
    },
  };
});

function readV2(raw: string): Snapshot {
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    parsed.version !== 2 ||
    !Array.isArray(parsed.cards) ||
    !Array.isArray(parsed.groups) ||
    !isRecord(parsed.reviews)
  ) throw new Error('Invalid v2 snapshot');

  const cards = parsed.cards.map(readCard);
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new Error('Duplicate card IDs in v2 snapshot');
  }
  const groups = normalizeGroups(parsed.groups.map(readGroup), cards);
  const reviews: Record<number, ReviewState> = {};
  for (const card of cards) {
    reviews[card.id] = migrateLegacyReview({ reviewState: parsed.reviews[card.id] });
  }
  const selectedGroupId = groups.some((group) => group.id === parsed.selectedGroupId)
    ? (parsed.selectedGroupId as number)
    : DEFAULT_GROUP_ID;
  return { version: 2, cards, groups, reviews, selectedGroupId };
}

async function migrateLegacyData(): Promise<Snapshot> {
  const [rawCards, rawGroups, demoSeeded] = await Promise.all([
    AsyncStorage.getItem(LEGACY_CARDS_KEY),
    AsyncStorage.getItem(LEGACY_GROUPS_KEY),
    AsyncStorage.getItem(LEGACY_DEMO_SEEDED_KEY),
  ]);

  const parsedCards: unknown = rawCards === null ? [] : JSON.parse(rawCards);
  const parsedGroups: unknown = rawGroups === null ? [] : JSON.parse(rawGroups);
  if (!Array.isArray(parsedCards) || !Array.isArray(parsedGroups)) {
    throw new Error('Invalid legacy data');
  }

  const originalCards = parsedCards.map(readCard);
  const reservedIds = new Set(originalCards.map((card) => card.id));
  const seenIds = new Set<number>();
  const cards = originalCards.map((card) => {
    // Older builds used Date.now() directly. Two quick additions could have
    // shared an ID, making edit/delete affect both cards. Repair that here.
    if (seenIds.has(card.id)) {
      let id = Date.now();
      while (reservedIds.has(id)) id += 1;
      reservedIds.add(id);
      seenIds.add(id);
      return { ...card, id };
    }
    seenIds.add(card.id);
    return card;
  });
  const reviews: Record<number, ReviewState> = {};
  parsedCards.forEach((oldCard, index) => {
    reviews[cards[index].id] = migrateLegacyReview(oldCard);
  });

  // The previous build used this marker to add sample words once. Honour it
  // so a user who deleted the samples does not see them reappear.
  if (demoSeeded !== 'true') {
    const existingWords = new Set(cards.map((card) => card.word.trim().toLocaleLowerCase()));
    const usedIds = new Set(cards.map((card) => card.id));
    for (const demo of DEMO_WORDS) {
      if (existingWords.has(demo.word)) continue;
      let id: number = demo.id;
      while (usedIds.has(id)) id -= 1;
      usedIds.add(id);
      cards.push({
        id,
        word: demo.word,
        meaning: demo.meaning,
        groupId: DEFAULT_GROUP_ID,
        createdAt: Date.now(),
      });
      reviews[id] = { ...INITIAL_REVIEW_STATE };
    }
  }

  const groups = normalizeGroups(parsedGroups.map(readGroup), cards);
  return {
    version: 2,
    cards,
    groups,
    reviews,
    selectedGroupId: DEFAULT_GROUP_ID,
  };
}

function readCard(value: unknown): WordCard {
  if (
    !isRecord(value) ||
    !isInteger(value.id) ||
    typeof value.word !== 'string' ||
    typeof value.meaning !== 'string'
  ) throw new Error('Invalid card');

  return {
    id: value.id,
    word: value.word,
    meaning: value.meaning,
    groupId: isInteger(value.groupId) ? value.groupId : DEFAULT_GROUP_ID,
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
      ? value.createdAt
      : value.id > 1_000_000_000_000 ? value.id : 0,
  };
}

function readGroup(value: unknown): WordGroup {
  if (!isRecord(value) || !isInteger(value.id) || typeof value.name !== 'string') {
    throw new Error('Invalid group');
  }
  return { id: value.id, name: value.name };
}

function normalizeGroups(groups: WordGroup[], cards: WordCard[]): WordGroup[] {
  const result: WordGroup[] = [];
  for (const group of groups) {
    if (!result.some((existing) => existing.id === group.id)) result.push(group);
  }
  for (const systemGroup of SYSTEM_GROUPS) {
    if (!result.some((group) => group.id === systemGroup.id)) result.push(systemGroup);
  }
  for (const card of cards) {
    if (!result.some((group) => group.id === card.groupId)) {
      result.push({ id: card.groupId, name: `恢复的单词组 ${card.groupId}` });
    }
  }
  return result;
}

function uniqueId(existingIds: number[]): number {
  const used = new Set(existingIds);
  let id = Date.now();
  while (used.has(id)) id += 1;
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
