import type { Snapshot } from '../store/useLingoStore';
import { normalizeWebsterAudioUrl } from './websterAudio.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const pronunciation = (value: unknown) => value === undefined || (record(value) &&
  typeof value.ipa === 'string' && !!value.ipa.trim() && value.ipa.length <= 100 &&
  (value.partOfSpeech === undefined || (typeof value.partOfSpeech === 'string' && !!value.partOfSpeech.trim() && value.partOfSpeech.length <= 50)) &&
  (value.audioUrl === undefined || normalizeWebsterAudioUrl(value.audioUrl) !== null) &&
  (value.audioAccent === undefined || value.audioAccent === 'us') &&
  (value.audioUrl === undefined || value.audioAccent === 'us') &&
  (value.source === undefined || (typeof value.source === 'string' && !!value.source.trim() && value.source.length <= 80)) &&
  (value.fetchedAt === undefined || timestamp(value.fetchedAt)));
const aiNote = (value: unknown) => value === undefined || (record(value) &&
  typeof value.definition === 'string' && !!value.definition.trim() && value.definition.length <= 500 &&
  typeof value.chineseHint === 'string' && !!value.chineseHint.trim() && value.chineseHint.length <= 200 &&
  ((Array.isArray(value.examples) && value.examples.length >= 1 && value.examples.length <= 3 &&
    value.examples.every((example) => typeof example === 'string' && !!example.trim() && example.length <= 500) &&
    new Set(value.examples.map((example: string) => example.trim().toLocaleLowerCase())).size === value.examples.length) ||
   (value.examples === undefined && typeof value.example === 'string' && !!value.example.trim() && value.example.length <= 500)));

// Network input must be rejected, rather than silently repaired by legacy migration.
// Keep this wire format aligned with server/src/snapshot.ts.
export function isBackupSnapshot(value: unknown): value is Snapshot {
  if (!record(value) || (value.version !== 2 && value.version !== 3) || !Array.isArray(value.cards) ||
      !Array.isArray(value.groups) || !record(value.reviews) || !integer(value.selectedGroupId)) return false;
  const cardIds = new Set<number>();
  for (const card of value.cards) {
    if (!record(card) || !integer(card.id) || typeof card.word !== 'string' || typeof card.meaning !== 'string' ||
        !integer(card.groupId) || !timestamp(card.createdAt) || !aiNote(card.aiNote) || !pronunciation(card.pronunciation) || cardIds.has(card.id)) return false;
    cardIds.add(card.id);
  }
  const groupIds = new Set<number>();
  for (const group of value.groups) {
    if (!record(group) || !integer(group.id) || typeof group.name !== 'string' || groupIds.has(group.id)) return false;
    groupIds.add(group.id);
  }
  if (!groupIds.has(value.selectedGroupId) || value.cards.some((card) => !groupIds.has(card.groupId))) return false;
  if (value.cards.some((card) => !Object.hasOwn(value.reviews as object, String(card.id)))) return false;
  for (const [id, review] of Object.entries(value.reviews)) {
    if (!cardIds.has(Number(id)) || String(Number(id)) !== id || !record(review) ||
        !integer(review.stage) || review.stage < 0 || review.stage > 5 || !timestamp(review.dueAt) ||
        (review.lastReviewedAt !== null && !timestamp(review.lastReviewedAt)) ||
        (review.lastResult !== null && !['again', 'hard', 'remembered'].includes(review.lastResult as string)) ||
        !integer(review.reviewCount) || review.reviewCount < 0) return false;
  }
  return true;
}

export function normalizeBackupSnapshot(value: unknown): Snapshot | null {
  if (!isBackupSnapshot(value)) return null;
  if (value.version === 3) return value;
  return { ...value, version: 3, cards: value.cards.map((card) => ({ ...card })) };
}
