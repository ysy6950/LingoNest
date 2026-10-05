/**
 * Pure scheduling rules for the local MVP review queue.
 *
 * The card itself stores the word and its explanation. This module stores the
 * review progress separately so a UI card can be opened without changing the
 * user's learning schedule.
 */

export type ReviewResult = 'again' | 'hard' | 'remembered';

export type ReviewState = {
  /** The index of the successful interval currently reached (0 to 5). */
  stage: number;
  /** Epoch milliseconds at which this card should next appear. */
  dueAt: number;
  /** Epoch milliseconds of the latest review, or null before the first review. */
  lastReviewedAt: number | null;
  /** The latest answer selected by the learner, or null before the first review. */
  lastResult: ReviewResult | null;
  /** Number of times the card has been answered. */
  reviewCount: number;
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Delays used by the first review algorithm.
 *
 * `remembered` advances through one, three, seven, fourteen and thirty days.
 * `again` puts a card back into the short retry queue. `hard` lowers progress
 * and schedules the card for tomorrow.
 */
export const INTERVALS = {
  again: 10 * MINUTE_MS,
  hard: DAY_MS,
  remembered: [DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS],
} as const;

/** A new card is immediately due for its first review. */
export const INITIAL_REVIEW_STATE: ReviewState = {
  stage: 0,
  dueAt: 0,
  lastReviewedAt: null,
  lastResult: null,
  reviewCount: 0,
};

const MAX_STAGE = INTERVALS.remembered.length;

/**
 * Schedule the next appearance of a card without changing the input state.
 *
 * `nowMs` is an argument instead of an internal Date.now() call so the rule is
 * deterministic in tests and when a caller restores a saved session.
 */
export function scheduleNextReview(
  state: ReviewState,
  result: ReviewResult,
  nowMs: number,
): ReviewState {
  const now = normalizeTimestamp(nowMs, 0);
  const stage = clampStage(state.stage);
  let nextStage = stage;
  let delayMs: number;

  switch (result) {
    case 'again':
      nextStage = 0;
      delayMs = INTERVALS.again;
      break;
    case 'hard':
      nextStage = Math.max(0, stage - 1);
      delayMs = INTERVALS.hard;
      break;
    case 'remembered':
      nextStage = Math.min(MAX_STAGE, stage + 1);
      // A remembered card at stage 0 uses the first one-day interval. Once a
      // card reaches the last stage, it stays on the thirty-day interval.
      delayMs = INTERVALS.remembered[nextStage - 1] ?? INTERVALS.remembered[MAX_STAGE - 1];
      break;
  }

  return {
    stage: nextStage,
    dueAt: now + delayMs,
    lastReviewedAt: now,
    lastResult: result,
    reviewCount: normalizeReviewCount(state.reviewCount) + 1,
  };
}

/** Return true when a card should be included in the current review queue. */
export function isReviewDue(state: ReviewState | undefined, nowMs: number = Date.now()): boolean {
  const now = normalizeTimestamp(nowMs, 0);
  return !state || !Number.isFinite(state.dueAt) || state.dueAt <= now;
}

/** Alias with a shorter name for callers that already use `isDue` terminology. */
export const isDue = isReviewDue;

type LegacyReviewInput = {
  reviewState?: unknown;
  reviewResult?: unknown;
  lastResult?: unknown;
  lastReviewedAt?: unknown;
  dueAt?: unknown;
  stage?: unknown;
  reviewCount?: unknown;
};

/**
 * Convert the fields used by the first local MVP (`known` / `unknown` and an
 * ISO `lastReviewedAt`) into the scheduler's state shape.
 *
 * The function accepts `unknown` so data read from AsyncStorage can be passed
 * here after JSON parsing without pretending that persisted data is trusted.
 */
export function migrateLegacyReview(card: unknown): ReviewState {
  const input = isRecord(card) ? (card as LegacyReviewInput) : {};
  const nested = isRecord(input.reviewState) ? input.reviewState : undefined;

  if (nested) {
    return normalizeReviewState(nested);
  }

  // A future caller may already have the new fields at card level. Supporting
  // them here keeps migration idempotent if it runs more than once.
  if (
    input.stage !== undefined ||
    input.dueAt !== undefined ||
    input.lastResult !== undefined ||
    input.reviewCount !== undefined
  ) {
    return normalizeReviewState(input as Record<string, unknown>);
  }

  const reviewResult = normalizeLegacyResult(input.reviewResult);
  const reviewedAt = parseTimestamp(input.lastReviewedAt);

  if (reviewResult === null) {
    return { ...INITIAL_REVIEW_STATE };
  }

  if (reviewResult === 'remembered') {
    const dueAt = reviewedAt === null ? 0 : reviewedAt + INTERVALS.remembered[0];
    return {
      ...INITIAL_REVIEW_STATE,
      stage: 1,
      dueAt,
      lastReviewedAt: reviewedAt,
      lastResult: reviewResult,
      reviewCount: 1,
    };
  }

  if (reviewResult === 'again') {
    return {
      ...INITIAL_REVIEW_STATE,
      // Old "unknown" answers have no scheduled retry. Let the learner see
      // those cards immediately when the new review flow is first opened.
      dueAt: 0,
      lastReviewedAt: reviewedAt,
      lastResult: reviewResult,
      reviewCount: 1,
    };
  }

  // There was no `hard` button in the old MVP. This branch is useful for data
  // written by an intermediate build that already used the new answer name.
  const dueAt = reviewedAt === null ? 0 : reviewedAt + INTERVALS.hard;
  return {
    ...INITIAL_REVIEW_STATE,
    dueAt,
    lastReviewedAt: reviewedAt,
    lastResult: 'hard',
    reviewCount: 1,
  };
}

function normalizeReviewState(value: Record<string, unknown>): ReviewState {
  const stage = clampStage(toFiniteNumber(value.stage, 0));
  const dueAtValue = parseTimestamp(value.dueAt);
  const lastReviewedAt = parseTimestamp(value.lastReviewedAt);
  const lastResult = normalizeLegacyResult(value.lastResult);

  return {
    stage,
    dueAt: dueAtValue ?? 0,
    lastReviewedAt,
    lastResult,
    reviewCount: normalizeReviewCount(value.reviewCount),
  };
}

function normalizeLegacyResult(value: unknown): ReviewResult | null {
  switch (value) {
    case 'again':
    case 'unknown':
      return 'again';
    case 'hard':
      return 'hard';
    case 'remembered':
    case 'known':
      return 'remembered';
    default:
      return null;
  }
}

function clampStage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(MAX_STAGE, Math.max(0, Math.floor(value)));
}

function normalizeReviewCount(value: unknown): number {
  const count = toFiniteNumber(value, 0);
  return Math.max(0, Math.floor(count));
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Accept Unix seconds as well as JavaScript epoch milliseconds.
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeTimestamp(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
