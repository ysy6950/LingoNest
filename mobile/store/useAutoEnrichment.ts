import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { WordCard } from './useLingoStore';

export type EnrichmentKind = 'dictionary' | 'ai';
export const ENRICHMENT_KINDS: EnrichmentKind[] = ['dictionary', 'ai'];
export type EnrichmentPart = { status: 'pending' | 'running' | 'failed'; automatic: boolean; error?: string };
export type EnrichmentJob = {
  id: string;
  cardId: number;
  createdAt: number;
  word: string;
  meaning: string;
  dictionary?: EnrichmentPart;
  ai?: EnrichmentPart;
};

export function needsEnrichment(card: WordCard, kind: EnrichmentKind): boolean {
  return kind === 'ai' ? !card.aiNote
    : !card.pronunciation?.ipa || !card.pronunciation.partOfSpeech || !card.pronunciation.audioUrl;
}

const STORAGE_KEY = 'lingonest.auto-enrichment.v1';
type EnrichmentState = {
  enabled: Record<EnrichmentKind, boolean>;
  jobs: EnrichmentJob[];
  isHydrated: boolean;
  isSaving: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setEnabled: (kind: EnrichmentKind, enabled: boolean) => void;
  enqueue: (card: WordCard, kinds: EnrichmentKind[], automatic: boolean) => void;
  updatePart: (id: string, kind: EnrichmentKind, part?: EnrichmentPart) => void;
  retry: (cardId?: number) => void;
  remove: (cardId?: number) => void;
  retrySave: () => Promise<boolean>;
  waitForSave: () => Promise<boolean>;
};

// Preferences and unfinished work belong to this device, not to a vocabulary backup.
export function createEnrichmentStore() {
  let hydration: Promise<void> | undefined;
  let writes: Promise<void> = Promise.resolve();
  let revision = 0;
  return create<EnrichmentState>((set, get) => {
    function persist(): Promise<boolean> {
      const currentRevision = ++revision;
      const { enabled, jobs } = get();
      set({ isSaving: true });
      writes = writes.catch(() => undefined).then(() =>
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, enabled, jobs })));
      return writes.then(() => {
        if (revision === currentRevision) set({ isSaving: false, error: null });
        return true;
      }, () => {
        if (revision === currentRevision) set({ isSaving: false, error: '自动补全设置和待办尚未保存，请重试。' });
        return false;
      });
    }
    function changeJobs(jobs: EnrichmentJob[]) {
      set({ jobs: jobs.filter((job) => job.ai || job.dictionary) });
      void persist();
    }
    return {
      enabled: { dictionary: false, ai: false }, jobs: [], isHydrated: false, isSaving: false, error: null,
      hydrate: () => {
        if (get().isHydrated) return Promise.resolve();
        if (!hydration) hydration = (async () => {
          try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            const data = raw === null ? { enabled: { dictionary: false, ai: false }, jobs: [] } : readSettings(raw);
            set({ ...data, isHydrated: true, error: null });
          } catch {
            set({ error: '自动补全设置读取失败，原记录未被覆盖。请重试读取；添加和复习仍可使用。' });
          } finally { hydration = undefined; }
        })();
        return hydration;
      },
      setEnabled: (kind, enabled) => {
        if (!get().isHydrated) return;
        set({ enabled: { ...get().enabled, [kind]: enabled } });
        changeJobs(get().jobs.map((job) => !enabled && job[kind]?.automatic ? { ...job, [kind]: undefined } : job));
      },
      enqueue: (card, kinds, automatic) => {
        if (!get().isHydrated) return;
        const existing = get().jobs.find((job) => job.cardId === card.id);
        const sameSource = existing && matchesEnrichmentSource(existing, card);
        const job: EnrichmentJob = sameSource ? { ...existing } : {
          id: `${card.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          cardId: card.id, createdAt: card.createdAt, word: card.word, meaning: card.meaning,
        };
        for (const kind of kinds) {
          if (needsEnrichment(card, kind) && (!automatic || get().enabled[kind]) && !job[kind]) {
            job[kind] = { status: 'pending', automatic };
          }
        }
        if (!job.ai && !job.dictionary) return;
        changeJobs([...get().jobs.filter((item) => item.cardId !== card.id), job]);
      },
      updatePart: (id, kind, part) => changeJobs(get().jobs.map((job) => job.id === id ? { ...job, [kind]: part } : job)),
      retry: (cardId) => changeJobs(get().jobs.map((job) => {
        if (cardId !== undefined && job.cardId !== cardId) return job;
        const value = { ...job };
        for (const kind of ENRICHMENT_KINDS) {
          const part = value[kind];
          if (part?.status === 'failed') value[kind] = { status: 'pending', automatic: part.automatic };
        }
        return value;
      })),
      remove: (cardId) => changeJobs(cardId === undefined ? [] : get().jobs.filter((job) => job.cardId !== cardId)),
      retrySave: () => get().isHydrated ? persist() : Promise.resolve(false),
      waitForSave: async () => { try { await writes; return !get().error; } catch { return false; } },
    };
  });
}

export function matchesEnrichmentSource(job: EnrichmentJob, card: WordCard): boolean {
  return job.cardId === card.id && job.createdAt === card.createdAt && job.word === card.word && job.meaning === card.meaning;
}

function readSettings(raw: string) {
  const value = JSON.parse(raw);
  if (value?.version !== 1 || typeof value.enabled?.dictionary !== 'boolean' || typeof value.enabled?.ai !== 'boolean' || !Array.isArray(value.jobs)) {
    throw new Error('Invalid enrichment settings');
  }
  const ids = new Set<number>();
  const jobs: EnrichmentJob[] = value.jobs.map((job: EnrichmentJob) => {
    if (!job || typeof job.id !== 'string' || !Number.isSafeInteger(job.cardId) || ids.has(job.cardId) ||
        !Number.isFinite(job.createdAt) || typeof job.word !== 'string' || typeof job.meaning !== 'string') throw new Error('Invalid enrichment job');
    ids.add(job.cardId);
    const clean: EnrichmentJob = { id: job.id, cardId: job.cardId, createdAt: job.createdAt, word: job.word, meaning: job.meaning };
    for (const kind of ENRICHMENT_KINDS) {
      const part = job[kind];
      if (part === undefined) continue;
      if (!part || !['pending', 'running', 'failed'].includes(part.status) || typeof part.automatic !== 'boolean') throw new Error('Invalid enrichment part');
      if (part.automatic && !value.enabled[kind]) continue;
      clean[kind] = { automatic: part.automatic, status: part.status === 'running' ? 'pending' : part.status,
        ...(part.status === 'failed' ? { error: '上次补全失败，请重试。' } : {}) };
    }
    return clean;
  }).filter((job: EnrichmentJob) => job.dictionary || job.ai);
  return { enabled: { dictionary: value.enabled.dictionary as boolean, ai: value.enabled.ai as boolean }, jobs };
}

export const useAutoEnrichment = createEnrichmentStore();
