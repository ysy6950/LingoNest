import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_REVIEW_STATE,
  INTERVALS,
  isReviewDue,
  migrateLegacyReview,
  scheduleNextReview,
} from '../reviewScheduler.ts';

const NOW = Date.parse('2026-10-06T08:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

test('a new word is immediately due and a future word is not', () => {
  assert.equal(isReviewDue(INITIAL_REVIEW_STATE, NOW), true);
  assert.equal(isReviewDue(undefined, NOW), true);
  assert.equal(isReviewDue({ ...INITIAL_REVIEW_STATE, dueAt: NOW + 1 }, NOW), false);
});

test('a card becomes due at the exact scheduled time', () => {
  const state = { ...INITIAL_REVIEW_STATE, dueAt: NOW };
  assert.equal(isReviewDue(state, NOW - 1), false);
  assert.equal(isReviewDue(state, NOW), true);
});

test('remembered answers advance through 1, 3, 7, 14 and 30 days, then stay at 30 days', () => {
  const expectedDays = [1, 3, 7, 14, 30, 30];
  let state = { ...INITIAL_REVIEW_STATE };

  expectedDays.forEach((days, index) => {
    state = scheduleNextReview(state, 'remembered', NOW + index * DAY);
    assert.equal(state.stage, Math.min(index + 1, 5));
    assert.equal(state.dueAt, NOW + index * DAY + days * DAY);
    assert.equal(state.lastResult, 'remembered');
    assert.equal(state.reviewCount, index + 1);
  });
});

test('again resets progress and schedules a ten-minute retry', () => {
  const current = {
    ...INITIAL_REVIEW_STATE,
    stage: 4,
    dueAt: NOW,
    reviewCount: 7,
  };
  const next = scheduleNextReview(current, 'again', NOW);

  assert.equal(next.stage, 0);
  assert.equal(next.dueAt, NOW + 10 * 60 * 1000);
  assert.equal(next.dueAt - NOW, INTERVALS.again);
  assert.equal(next.lastReviewedAt, NOW);
  assert.equal(next.reviewCount, 8);
});

test('hard lowers a stage by one without going below zero and returns tomorrow', () => {
  const stageThree = scheduleNextReview(
    { ...INITIAL_REVIEW_STATE, stage: 3 },
    'hard',
    NOW,
  );
  const stageZero = scheduleNextReview(INITIAL_REVIEW_STATE, 'hard', NOW);

  assert.equal(stageThree.stage, 2);
  assert.equal(stageThree.dueAt, NOW + DAY);
  assert.equal(stageZero.stage, 0);
  assert.equal(stageZero.dueAt, NOW + DAY);
});

test('migration maps a known answer to the first interval', () => {
  const reviewedAt = '2026-10-05T08:00:00.000Z';
  const state = migrateLegacyReview({ reviewResult: 'known', lastReviewedAt: reviewedAt });

  assert.deepEqual(state, {
    stage: 1,
    dueAt: Date.parse(reviewedAt) + DAY,
    lastReviewedAt: Date.parse(reviewedAt),
    lastResult: 'remembered',
    reviewCount: 1,
  });
  assert.equal(isReviewDue(state, NOW), true);
});

test('migration makes an unknown answer and an unreviewed word immediately due', () => {
  const unknown = migrateLegacyReview({
    reviewResult: 'unknown',
    lastReviewedAt: '2026-10-05T08:00:00.000Z',
  });
  const unreviewed = migrateLegacyReview({ word: 'persist', meaning: 'continue' });

  assert.equal(unknown.stage, 0);
  assert.equal(unknown.dueAt, 0);
  assert.equal(unknown.lastResult, 'again');
  assert.equal(unknown.reviewCount, 1);
  assert.deepEqual(unreviewed, INITIAL_REVIEW_STATE);
});

test('migration handles an invalid old review date without hiding the card', () => {
  const known = migrateLegacyReview({ reviewResult: 'known', lastReviewedAt: 'not-a-date' });
  const unknown = migrateLegacyReview({ reviewResult: 'unknown', lastReviewedAt: 'not-a-date' });

  assert.equal(known.stage, 1);
  assert.equal(known.lastReviewedAt, null);
  assert.equal(known.dueAt, 0);
  assert.equal(unknown.lastReviewedAt, null);
  assert.equal(unknown.dueAt, 0);
});

test('scheduling and migration leave their input objects unchanged', () => {
  const current = Object.freeze({
    ...INITIAL_REVIEW_STATE,
    stage: 2,
    reviewCount: 3,
  });
  const legacy = Object.freeze({
    reviewResult: 'known',
    lastReviewedAt: '2026-10-05T08:00:00.000Z',
  });

  const next = scheduleNextReview(current, 'remembered', NOW);
  const migrated = migrateLegacyReview(legacy);

  assert.notStrictEqual(next, current);
  assert.equal(current.stage, 2);
  assert.equal(current.reviewCount, 3);
  assert.equal(next.stage, 3);
  assert.equal(legacy.reviewResult, 'known');
  assert.equal(legacy.lastReviewedAt, '2026-10-05T08:00:00.000Z');
  assert.equal(migrated.lastResult, 'remembered');
});
