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

export function isValidSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) || value.version !== 2 ||
    !Array.isArray(value.cards) || !Array.isArray(value.groups) ||
    !isRecord(value.reviews) || !isSafeInteger(value.selectedGroupId)
  ) return false;

  const cardIds = new Set<number>();
  for (const card of value.cards) {
    if (
      !isRecord(card) || !isSafeInteger(card.id) ||
      typeof card.word !== 'string' || typeof card.meaning !== 'string' ||
      !isSafeInteger(card.groupId) || !isTimestamp(card.createdAt) ||
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
