import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExerciseQuestions, eligibleExerciseWords, exerciseSourcesMatch, gradeExercise, parseExerciseDrafts, randomExerciseWords, summarizeExercises } from '../exercises.ts';
import { AiRequestError, requestExercises } from '../localServer/ai.ts';

const words = [
  { id: 1, word: 'learn', meaning: '学习', createdAt: 10 },
  { id: 2, word: 'apple', meaning: '苹果', createdAt: 20 },
  { id: 3, word: 'quiet', meaning: '安静的', createdAt: 30 },
  { id: 4, word: 'quickly', meaning: '迅速地', createdAt: 40 },
  { id: 5, word: 'chair', meaning: '椅子', createdAt: 50 },
];
const draft = { cardId: 1, sentence: 'I want to _____ a language at school.', explanation: 'learn 表示学习，符合学习语言的语境。' };
const connection = { address: '192.168.1.20:3001', token: 'a'.repeat(32) };

test('exercise eligibility filters duplicate spellings and unsupported input without modifying cards', () => {
  const source = [...words, { ...words[0], id: 99, word: ' LEARN ' }, { ...words[0], id: 100, word: '你好' }, { ...words[0], id: 101, meaning: 'x'.repeat(501) }];
  const before = JSON.stringify(source);
  assert.deepEqual(eligibleExerciseWords(source), words);
  assert.equal(JSON.stringify(source), before);
});

test('random selection picks four or five eligible distinct words without changing the source', () => {
  const source = [...words, { ...words[0], id: 99, word: ' LEARN ' }, { ...words[0], id: 100, meaning: '' }];
  const before = JSON.stringify(source);
  const picked = randomExerciseWords(source, () => 0);
  assert.equal(picked.length, 5);
  assert.equal(new Set(picked.map((card) => card.id)).size, 5);
  assert.deepEqual([...picked].sort((a, b) => a.id - b.id), words);
  assert.deepEqual(randomExerciseWords(words.slice(0, 4), () => 0).map((card) => card.id).sort(), [1, 2, 3, 4]);
  assert.deepEqual(randomExerciseWords(words.slice(0, 3)), []);
  assert.deepEqual(randomExerciseWords([]), []);
  assert.equal(JSON.stringify(source), before);
});

test('random selection draws from the entire supplied group, including beyond the first fifty words', () => {
  const group = Array.from({ length: 60 }, (_, index) => ({
    id: index + 1, word: `word${String.fromCharCode(97 + Math.floor(index / 26), 97 + index % 26)}`, meaning: '测试词',
  }));
  const sequence = [4 / group.length];
  const picked = randomExerciseWords(group, () => sequence.shift() ?? 0.999);
  assert.equal(picked.length, 5);
  assert.equal(new Set(picked.map((card) => card.id)).size, 5);
  assert.ok(picked.every((card) => group.includes(card)));
  assert.ok(picked.some((card) => card.id > 50));
  assert.notDeepEqual(picked, randomExerciseWords(group, () => 0.999));
});

test('mobile exercise parser refuses foreign ids, malformed blanks, duplicate questions and provider answers', () => {
  assert.deepEqual(parseExerciseDrafts({ questions: [draft] }, words), [draft]);
  for (const value of [
    { questions: [{ ...draft, cardId: 1000 }] }, { questions: [{ ...draft, sentence: 'No blank.' }] },
    { questions: [{ ...draft, sentence: 'I _____ _____.' }] }, { questions: [{ ...draft, explanation: '' }] },
    { questions: [{ ...draft, answerIndex: 3 }] }, { questions: [draft, draft] },
    { questions: [draft, { ...draft, cardId: 2 }] }, { questions: null },
  ]) assert.throws(() => parseExerciseDrafts(value, words));
});

test('each question uses four unique local words and keeps the correct answer through option shuffling', () => {
  const before = JSON.stringify(words);
  for (const random of [() => 0, () => 0.999]) {
    const question = buildExerciseQuestions([draft], words, random)[0];
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map((word) => word.id)).size, 4);
    assert.equal(question.options.filter((word) => word.id === draft.cardId).length, 1);
    for (const option of question.options) assert.equal(gradeExercise(question, option.id), option.id === draft.cardId);
    assert.throws(() => gradeExercise(question, 1000));
  }
  assert.equal(JSON.stringify(words), before);
});

test('local scoring excludes disputed questions, handles all-excluded rounds and has no review effects', () => {
  const drafts = [draft, { ...draft, cardId: 2, sentence: 'This fruit is an _____.' }, { ...draft, cardId: 3, sentence: 'Please keep _____ in the library.' }];
  const questions = buildExerciseQuestions(drafts, words.slice(0, 4));
  assert.deepEqual(summarizeExercises(questions, { 1: { selectedId: 1, excluded: false }, 2: { selectedId: 1, excluded: false }, 3: { selectedId: 3, excluded: true } }), { correct: 1, wrong: 1, excluded: 1, total: 2 });
  assert.deepEqual(summarizeExercises(questions, Object.fromEntries(questions.map((question) => [question.cardId, { selectedId: question.cardId, excluded: true }]))), { correct: 0, wrong: 0, excluded: 3, total: 0 });
});

test('edited, deleted or restored source words invalidate a round, but unrelated edits do not', () => {
  assert.equal(exerciseSourcesMatch(words, [...words, { ...words[0], id: 100 }]), true);
  for (const current of [words.slice(1), [{ ...words[0], word: 'learned' }, ...words.slice(1)], [{ ...words[0], meaning: 'changed' }, ...words.slice(1)], [{ ...words[0], createdAt: 99 }, ...words.slice(1)]]) assert.equal(exerciseSourcesMatch(words, current), false);
});

test('exercise request sends only selected word fields to the paired computer and validates its response', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    assert.equal(url, 'http://192.168.1.20:3001/ai/exercises');
    assert.equal(init.headers.authorization, `Bearer ${connection.token}`);
    assert.deepEqual(JSON.parse(init.body), { words: words.map(({ id, word, meaning }) => ({ id, word, meaning })) });
    return { ok: true, status: 200, json: async () => ({ questions: calls === 1 ? [draft] : [{ ...draft, score: 100 }] }) };
  });
  assert.deepEqual(await requestExercises(connection, words), [draft]);
  await assert.rejects(() => requestExercises(connection, words), (error) => error instanceof AiRequestError && error.code === 'invalid_response');
  await assert.rejects(() => requestExercises(connection, words.slice(0, 3)));
  assert.equal(calls, 2, 'invalid selection must not send a request');
});

test('exercise timeout waits 120 seconds, never retries, and reports old servers and authentication errors', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  const pending = requestExercises(connection, words);
  const rejected = assert.rejects(pending, (error) => error instanceof AiRequestError && error.code === 'timeout');
  t.mock.timers.tick(120000);
  await rejected;
  t.mock.timers.tick(120000);
  assert.equal(calls, 1);
  for (const [status, code] of [[401, 'auth'], [404, 'mode'], [400, 'invalid_request']]) {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status }));
    await assert.rejects(() => requestExercises(connection, words), (error) => error instanceof AiRequestError && error.code === code);
  }
});
