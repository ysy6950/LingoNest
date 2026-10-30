import { normalizeWebsterAudioUrl } from './websterAudio.js';

export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPronunciation(value: unknown): boolean {
  return value === undefined || (isRecord(value) &&
    typeof value.ipa === 'string' && !!value.ipa.trim() && value.ipa.length <= 100 &&
    (value.partOfSpeech === undefined || (typeof value.partOfSpeech === 'string' && !!value.partOfSpeech.trim() && value.partOfSpeech.length <= 50)) &&
    (value.audioUrl === undefined || normalizeWebsterAudioUrl(value.audioUrl) !== null) &&
    (value.audioAccent === undefined || value.audioAccent === 'us') &&
    (value.audioUrl === undefined || value.audioAccent === 'us') &&
    (value.source === undefined || (typeof value.source === 'string' && !!value.source.trim() && value.source.length <= 80)) &&
    (value.fetchedAt === undefined || isTimestamp(value.fetchedAt)));
}

function isAiNote(value: unknown): boolean {
  return value === undefined || (isRecord(value) &&
    typeof value.definition === 'string' && !!value.definition.trim() && value.definition.length <= 500 &&
    typeof value.chineseHint === 'string' && !!value.chineseHint.trim() && value.chineseHint.length <= 200 &&
    ((Array.isArray(value.examples) && value.examples.length >= 1 && value.examples.length <= 3 &&
      value.examples.every((example) => typeof example === 'string' && !!example.trim() && example.length <= 500) &&
      new Set(value.examples.map((example: string) => example.trim().toLocaleLowerCase())).size === value.examples.length) ||
     (value.examples === undefined && typeof value.example === 'string' && !!value.example.trim() && value.example.length <= 500)));
}

export function isValidSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) || (value.version !== 2 && value.version !== 3) ||
    !Array.isArray(value.cards) || !Array.isArray(value.groups) ||
    !isRecord(value.reviews) || !isSafeInteger(value.selectedGroupId)
  ) return false;

  const cardIds = new Set<number>();
  for (const card of value.cards) {
    if (
      !isRecord(card) || !isSafeInteger(card.id) ||
      typeof card.word !== 'string' || typeof card.meaning !== 'string' ||
      !isSafeInteger(card.groupId) || !isTimestamp(card.createdAt) || !isAiNote(card.aiNote) || !isPronunciation(card.pronunciation) ||
      cardIds.has(card.id)
    ) return false;
    cardIds.add(card.id);
  }

  const groupIds = new Set<number>();
  for (const group of value.groups) {
    if (
      !isRecord(group) || !isSafeInteger(group.id) ||
      typeof group.name !== 'string' || groupIds.has(group.id)
    ) return false;
    groupIds.add(group.id);
  }
  if (!groupIds.has(value.selectedGroupId)) return false;
  if (value.cards.some((card) => !groupIds.has(card.groupId))) return false;
  if (value.cards.some((card) => !Object.hasOwn(value.reviews as object, String(card.id)))) return false;

  for (const [id, review] of Object.entries(value.reviews)) {
    if (
      !cardIds.has(Number(id)) || String(Number(id)) !== id || !isRecord(review) ||
      !isSafeInteger(review.stage) || review.stage < 0 || review.stage > 5 ||
      !isTimestamp(review.dueAt) ||
      (review.lastReviewedAt !== null && !isTimestamp(review.lastReviewedAt)) ||
      (review.lastResult !== null && !['again', 'hard', 'remembered'].includes(review.lastResult as string)) ||
      !isSafeInteger(review.reviewCount) || review.reviewCount < 0
    ) return false;
  }
  return true;
}
