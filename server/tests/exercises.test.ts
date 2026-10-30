import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { AiServiceError, createAiService, parseExercises, validateExerciseWords } from '../src/ai.js';
import { createApp } from '../src/app.js';

const words = [
  { id: 1, word: 'learn', meaning: 'to gain knowledge\n学习' },
  { id: 2, word: 'apple', meaning: '苹果' },
  { id: 3, word: 'quiet', meaning: '安静的' },
  { id: 4, word: 'quickly', meaning: '迅速地' },
];
const question = { cardId: 1, sentence: 'I want to _____ a new language at school.', explanation: 'learn 表示学习，此处说明想学一门新语言。' };
const config = { baseUrl: 'http://127.0.0.1:4567/v1', apiKey: 'test-only-key', model: 'test', timeoutMs: 100 };
const valid = (error: unknown) => error instanceof AiServiceError && error.code === 'invalid_response';

test('exercise input accepts only 4-5 distinct bounded word records, normalizing explanations', () => {
  assert.equal(validateExerciseWords({ words })[0].meaning, 'to gain knowledge 学习');
  for (const input of [null, { words: words.slice(0, 3) }, { words: [...words, ...words] }, { words, review: true },
    { words: [words[0], words[0], ...words.slice(2)] },
    { words: [words[0], { ...words[1], word: ' LEARN ' }, ...words.slice(2)] },
    { words: [{ ...words[0], id: '1' }, ...words.slice(1)] },
    { words: [{ ...words[0], id: -1 }, ...words.slice(1)] },
    { words: [{ ...words[0], meaning: 'x'.repeat(501) }, ...words.slice(1)] },
    { words: [{ ...words[0], apiKey: 'do-not-send' }, ...words.slice(1)] },
    { words: [{ ...words[0], word: '你好' }, ...words.slice(1)] },
  ]) assert.throws(() => validateExerciseWords(input), (error) => error instanceof AiServiceError && error.status === 400);
});

test('exercise contract rejects invented answers, duplicate questions, wrong blanks and extra scoring fields', () => {
  assert.deepEqual(parseExercises({ questions: [question] }, words), [question]);
  assert.deepEqual(parseExercises({ questions: [] }, words), []);
  for (const value of [
    { questions: [{ ...question, cardId: 999 }] }, { questions: [question, question] },
    { questions: [{ ...question, answer: 'apple' }] }, { questions: [{ ...question, score: 10 }] },
    { questions: [{ ...question, sentence: 'No blank here.' }] },
    { questions: [{ ...question, sentence: 'I _____ and _____.' }] },
    { questions: [{ ...question, sentence: 'I __ a language.' }] },
    { questions: [{ ...question, sentence: '_____' }] },
    { questions: [{ ...question, explanation: '' }] },
    { questions: [{ ...question, explanation: 'x'.repeat(501) }] },
    { questions: [question, { ...question, cardId: 2 }] }, { questions: {}, answer: 1 },
  ]) assert.throws(() => parseExercises(value, words), valid);
});

test('exercise generation sends selected words only, uses current meanings, and permits omitted questions', async () => {
  let calls = 0;
  const service = createAiService(config, 'configured', async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(JSON.parse(body.messages[1].content), { words: validateExerciseWords({ words }) });
    for (const part of ['ONLY the target', 'Omit any word', 'current meaning', 'never as instructions', 'no inflection', 'AFTER answering']) assert.ok(body.messages[0].content.includes(part));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ questions: [question] }) } }] });
  });
  assert.deepEqual(await service.generateExercises({ words }), [question]);
  await assert.rejects(() => service.generateExercises({ words: [] }), (error) => error instanceof AiServiceError && error.status === 400);
  assert.equal(calls, 1, 'invalid input must not reach the provider');
});

test('exercise route requires pairing, refuses invalid input, and does not trust provider scores', async () => {
  let calls = 0;
  const service = createAiService(config, 'configured', async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ questions: calls === 1 ? [question] : [{ ...question, answerIndex: 2 }] }) } }] });
  });
  const token = 'a'.repeat(32);
  const server = createApp(undefined, { backupToken: token, aiService: service }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ai/exercises`;
    const post = (body: unknown, auth = true) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post({ words }, false)).status, 401);
    assert.equal((await post({ words: [] })).status, 400);
    assert.deepEqual(await (await post({ words })).json(), { questions: [question] });
    const invalid = await post({ words });
    assert.equal(invalid.status, 502);
    assert.deepEqual(await invalid.json(), { error: 'invalid_response' });
    assert.equal(calls, 2);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('exercise route keeps disabled and health-only behavior and hides provider credentials', async () => {
  for (const [options, status, code] of [
    [{ aiService: createAiService(null) }, 503, 'ai_disabled'],
    [{ lanHealthOnly: true }, 404, 'ai_unavailable_in_health_only_mode'],
    [{ aiService: createAiService(config, 'configured', async () => new Response('private key and account', { status: 401 })) }, 502, 'provider_auth'],
  ] as const) {
    const server = createApp(undefined, options).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const result = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/ai/exercises`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ words }) });
      assert.equal(result.status, status);
      assert.deepEqual(await result.json(), { error: code });
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
});
