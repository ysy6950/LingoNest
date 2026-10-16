import type { Snapshot } from '../store/useLingoStore';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Network input must be rejected, rather than silently repaired by legacy migration.
// Keep this wire format aligned with server/src/snapshot.ts.
export function isBackupSnapshot(value: unknown): value is Snapshot {
  if (!record(value) || value.version !== 2 || !Array.isArray(value.cards) ||
      !Array.isArray(value.groups) || !record(value.reviews) || !integer(value.selectedGroupId)) return false;
  const cardIds = new Set<number>();
  for (const card of value.cards) {
    if (!record(card) || !integer(card.id) || typeof card.word !== 'string' || typeof card.meaning !== 'string' ||
        !integer(card.groupId) || !timestamp(card.createdAt) || cardIds.has(card.id)) return false;
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
