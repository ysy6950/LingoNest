import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { normalizeWebsterAudioUrl } from '../localServer/websterAudio.ts';
import { normalizeWord } from '../wordIdentity.ts';

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
  aiNote?: AiNote;
  pronunciation?: Pronunciation;
};

export type AiNote = { definition: string; chineseHint: string; examples: string[] };
export type Pronunciation = {
  ipa?: string;
  partOfSpeech?: string;
  audioUrl?: string;
  audioAccent?: 'us';
  source?: string;
  fetchedAt?: number;
};

export function isAiNote(value: unknown): value is AiNote {
  if (!isRecord(value)) return false;
  return typeof value.definition === 'string' && !!value.definition.trim() && value.definition.length <= 500 &&
    typeof value.chineseHint === 'string' && !!value.chineseHint.trim() && value.chineseHint.length <= 200 &&
    Array.isArray(value.examples) && value.examples.length >= 1 && value.examples.length <= 3 &&
    value.examples.every((example) => typeof example === 'string' && !!example.trim() && example.length <= 500) &&
    new Set(value.examples.map((example: string) => example.trim().toLocaleLowerCase())).size === value.examples.length;
}

function readAiNote(value: unknown): AiNote | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error('Invalid AI note');
  const note = value.examples === undefined && typeof value.example === 'string'
    ? { ...value, examples: [value.example] }
    : value;
  if (!isAiNote(note)) throw new Error('Invalid AI note');
  return {
    definition: note.definition.trim(),
    chineseHint: note.chineseHint.trim(),
    examples: note.examples.map((example) => example.trim()),
  };
}

export type WordGroup = {
  id: number;
  name: string;
};

export const DEFAULT_GROUP_ID = 1;
export const UNGROUPED_GROUP_ID = 0;

const STORAGE_KEY = 'lingonest.v3';
const PREVIOUS_STORAGE_KEY = 'lingonest.v2';
const LATEST_RECOVERY_KEY = 'lingonest.pre-restore.latest';
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

export type Snapshot = {
  version: 3;
  cards: WordCard[];
  groups: WordGroup[];
  reviews: Record<number, ReviewState>;
  selectedGroupId: number;
};

export type RestoreResult = 'restored' | 'changed' | 'invalid' | 'save-failed';

type LingoState = {
  cards: WordCard[];
  groups: WordGroup[];
  reviews: Record<number, ReviewState>;
  selectedGroupId: number;
  isHydrated: boolean;
  isHydrating: boolean;
  isSaving: boolean;
  isRestoring: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  retrySave: () => Promise<boolean>;
  waitForSave: () => Promise<boolean>;
  exportSnapshot: () => Snapshot | null;
  latestRecoverySnapshot: () => Promise<Snapshot | null>;
  restoreFromBackup: (raw: unknown, expectedLocal: string) => Promise<RestoreResult>;
  addCard: (word: string, meaning: string, groupId: number) => number | null;
  addRecommendedCard: (sourceId: number, expectedWord: string, expectedMeaning: string, word: string, meaning: string, groupId: number) => number | null;
  editCard: (cardId: number, word: string, meaning: string) => boolean;
  saveAiNote: (cardId: number, expectedWord: string, expectedMeaning: string, note: AiNote) => boolean;
  removeAiNote: (cardId: number) => void;
  savePronunciation: (cardId: number, expectedWord: string, pronunciation: Pronunciation) => boolean;
  deleteCard: (cardId: number) => void;
  moveCard: (cardId: number, groupId: number) => void;
  addGroup: (name: string) => number | null;
  selectGroup: (groupId: number) => void;
  answerReview: (cardId: number, result: ReviewResult, nowMs?: number) => void;
};

let hydrationPromise: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let latestSaveRevision = 0;

/** The v3 snapshot is saved before hydration is exposed to the UI. */
export const useLingoStore = create<LingoState>((set, get) => {
  function currentSnapshot(): Snapshot {
    const { cards, groups, reviews, selectedGroupId } = get();
    return { version: 3, cards, groups, reviews, selectedGroupId };
  }

  function saveCurrentState(): Promise<boolean> {
    const snapshot = currentSnapshot();
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
    isRestoring: false,
    error: null,

    hydrate: async () => {
      if (get().isHydrated) return;
      if (hydrationPromise) return hydrationPromise;

      set({ isHydrating: true, error: null });
      hydrationPromise = (async () => {
        try {
          const storedV3 = await AsyncStorage.getItem(STORAGE_KEY);
          const storedV2 = storedV3 === null ? await AsyncStorage.getItem(PREVIOUS_STORAGE_KEY) : null;
          let snapshot: Snapshot;

          if (storedV3 !== null) {
            snapshot = readSnapshot(storedV3);
          } else if (storedV2 !== null) {
            snapshot = readSnapshot(storedV2);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
          } else {
            snapshot = await migrateLegacyData();
            // Keep the old keys as recovery copies. Migration is safe to retry.
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
      if (!get().isHydrated || get().isRestoring) return Promise.resolve(false);
      // Read the current state, not the snapshot from the failed attempt.
      return saveCurrentState();
    },

    waitForSave: async () => {
      try { await writeQueue; return !get().error; } catch { return false; }
    },

    exportSnapshot: () => get().isHydrated ? readSnapshot(JSON.stringify(currentSnapshot())) : null,

    latestRecoverySnapshot: async () => {
      const key = await AsyncStorage.getItem(LATEST_RECOVERY_KEY);
      if (!key) return null;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      try {
        return readSnapshot(raw);
      } catch {
        return null;
      }
    },

    restoreFromBackup: async (raw, expectedLocal) => {
      if (!get().isHydrated || get().isRestoring) return 'changed';
      let snapshot: Snapshot;
      try {
        snapshot = readSnapshot(JSON.stringify(raw));
      } catch {
        return 'invalid';
      }
      if (JSON.stringify(currentSnapshot()) !== expectedLocal) return 'changed';

      set({ isRestoring: true });
      try {
        // All pending local writes finish before replacing the current copy.
        await writeQueue.catch(() => undefined);
        if (JSON.stringify(currentSnapshot()) !== expectedLocal) return 'changed';

        // Keep a recovery copy even when the backup data is valid. A failed
        // write leaves the current v2 snapshot untouched.
        const recoveryKey = `lingonest.pre-restore.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        await AsyncStorage.setItem(recoveryKey, expectedLocal);
        await AsyncStorage.setItem(LATEST_RECOVERY_KEY, recoveryKey);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        set({
          cards: snapshot.cards,
          groups: snapshot.groups,
          reviews: snapshot.reviews,
          selectedGroupId: snapshot.selectedGroupId,
          error: null,
        });
        return 'restored';
      } catch {
        set({ error: '恢复失败，本机原有数据未被清除。请重试。' });
        return 'save-failed';
      } finally {
        set({ isRestoring: false });
      }
    },

    addCard: (word, meaning, groupId) => {
      const current = get();
      const nextWord = word.trim();
      const nextMeaning = meaning.trim();
      if (
        !current.isHydrated || current.isRestoring ||
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

    addRecommendedCard: (sourceId, expectedWord, expectedMeaning, word, meaning, groupId) => {
      const current = get();
      const source = current.cards.find((card) => card.id === sourceId);
      // Recheck at the write boundary: UI checks alone cannot prevent a stale or double add.
      if (!source || source.word !== expectedWord || source.meaning !== expectedMeaning ||
          current.cards.some((card) => normalizeWord(card.word) === normalizeWord(word))) return null;
      return current.addCard(word, meaning, groupId);
    },

    editCard: (cardId, word, meaning) => {
      const current = get();
      const nextWord = word.trim();
      const nextMeaning = meaning.trim();
      if (
        !current.isHydrated || current.isRestoring ||
        !nextWord ||
        !nextMeaning ||
        !current.cards.some((card) => card.id === cardId)
      ) return false;

      set({
        cards: current.cards.map((card) =>
          card.id === cardId ? { ...card, word: nextWord, meaning: nextMeaning, aiNote: card.word === nextWord && card.meaning === nextMeaning ? card.aiNote : undefined, pronunciation: card.word === nextWord ? card.pronunciation : undefined } : card,
        ),
      });
      saveCurrentState();
      return true;
    },

    saveAiNote: (cardId, expectedWord, expectedMeaning, note) => {
      const current = get();
      const card = current.cards.find((item) => item.id === cardId);
      if (!current.isHydrated || current.isRestoring || !card ||
          card.word !== expectedWord || card.meaning !== expectedMeaning || !isAiNote(note)) return false;
      const aiNote = { definition: note.definition.trim(), chineseHint: note.chineseHint.trim(), examples: note.examples.map((example) => example.trim()) };
      set({ cards: current.cards.map((item) => item.id === cardId ? { ...item, aiNote } : item) });
      saveCurrentState();
      return true;
    },

    removeAiNote: (cardId) => {
      if (!get().isHydrated || get().isRestoring) return;
      set({ cards: get().cards.map((card) => card.id === cardId ? { ...card, aiNote: undefined } : card) });
      void saveCurrentState();
    },

    savePronunciation: (cardId, expectedWord, pronunciation) => {
      const current = get();
      const card = current.cards.find((item) => item.id === cardId);
      if (!current.isHydrated || current.isRestoring || !card || card.word !== expectedWord || !isPronunciation(pronunciation)) return false;
      const value = normalizePronunciation(pronunciation);
      if (!value.ipa) return false;
      set({ cards: current.cards.map((item) => item.id === cardId ? { ...item, pronunciation: value } : item) });
      saveCurrentState();
      return true;
    },

    deleteCard: (cardId) => {
      const current = get();
      if (!current.isHydrated || current.isRestoring || !current.cards.some((card) => card.id === cardId)) return;
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
        !current.isHydrated || current.isRestoring ||
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
        !current.isHydrated || current.isRestoring ||
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
        !current.isHydrated || current.isRestoring ||
        current.selectedGroupId === groupId ||
        !current.groups.some((group) => group.id === groupId)
      ) return;
      set({ selectedGroupId: groupId });
      saveCurrentState();
    },

    answerReview: (cardId, result, nowMs = Date.now()) => {
      const current = get();
      if (
        !current.isHydrated || current.isRestoring ||
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

function readSnapshot(raw: string): Snapshot {
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    parsed.version !== 2 && parsed.version !== 3 ||
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
  return { version: 3, cards, groups, reviews, selectedGroupId };
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
    version: 3,
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
  const aiNote = readAiNote(value.aiNote);
  const pronunciation = readPronunciation(value.pronunciation);

  return {
    id: value.id,
    word: value.word,
    meaning: value.meaning,
    groupId: isInteger(value.groupId) ? value.groupId : DEFAULT_GROUP_ID,
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
      ? value.createdAt
      : value.id > 1_000_000_000_000 ? value.id : 0,
    ...(aiNote === undefined ? {} : { aiNote }),
    ...(pronunciation === undefined ? {} : { pronunciation }),
  };
}

function readPronunciation(value: unknown): Pronunciation | undefined {
  if (value === undefined) return undefined;
  if (!isPronunciation(value)) throw new Error('Invalid pronunciation');
  return normalizePronunciation(value);
}

function normalizePronunciation(value: Pronunciation): Pronunciation {
  return {
    ...(value.ipa?.trim() ? { ipa: value.ipa.trim() } : {}),
    ...(value.partOfSpeech?.trim() ? { partOfSpeech: value.partOfSpeech.trim() } : {}),
    ...(value.audioUrl ? { audioUrl: normalizeWebsterAudioUrl(value.audioUrl)! } : {}),
    ...(value.audioAccent === 'us' ? { audioAccent: 'us' as const } : {}),
    ...(value.source?.trim() ? { source: value.source.trim() } : {}),
    ...(value.fetchedAt === undefined ? {} : { fetchedAt: value.fetchedAt }),
  };
}

function isPronunciation(value: unknown): value is Pronunciation {
  return isRecord(value) &&
    typeof value.ipa === 'string' && !!value.ipa.trim() && value.ipa.length <= 100 &&
    (value.partOfSpeech === undefined || (typeof value.partOfSpeech === 'string' && !!value.partOfSpeech.trim() && value.partOfSpeech.length <= 50)) &&
    (value.audioUrl === undefined || normalizeWebsterAudioUrl(value.audioUrl) !== null) &&
    (value.audioAccent === undefined || value.audioAccent === 'us') &&
    (value.source === undefined || (typeof value.source === 'string' && !!value.source.trim() && value.source.length <= 80)) &&
    (value.fetchedAt === undefined || (typeof value.fetchedAt === 'number' && Number.isFinite(value.fetchedAt) && value.fetchedAt >= 0));
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
