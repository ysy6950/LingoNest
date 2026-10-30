import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createAiService, getAiConfigState, readAiConfig, chatCompletionsUrl, AiServiceError } from '../src/ai.js';
import { createApp } from '../src/app.js';
import { isValidSnapshot } from '../src/snapshot.js';

const config = { baseUrl: 'http://127.0.0.1:4567/chat/completions', apiKey: 'secret', model: 'test-model', timeoutMs: 20 };

test('AI config is disabled, configured, or misconfigured without exposing the key', () => {
  assert.equal(getAiConfigState({}), 'disabled');
  assert.equal(getAiConfigState({ LINGONEST_AI_BASE_URL: config.baseUrl, LINGONEST_AI_API_KEY: config.apiKey, LINGONEST_AI_MODEL: config.model }), 'configured');
  assert.equal(getAiConfigState({ LINGONEST_AI_API_KEY: config.apiKey }), 'misconfigured');
  assert.equal(readAiConfig({ LINGONEST_AI_BASE_URL: 'http://192.168.1.4', LINGONEST_AI_API_KEY: config.apiKey, LINGONEST_AI_MODEL: config.model }), null);
  assert.equal(readAiConfig({ LINGONEST_AI_BASE_URL: 'https://example.com/v1?api_key=secret', LINGONEST_AI_API_KEY: config.apiKey, LINGONEST_AI_MODEL: config.model }), null);
  assert.equal(chatCompletionsUrl('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions');
  assert.equal(chatCompletionsUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
  assert.equal(chatCompletionsUrl('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1/chat/completions');
});

test('backup accepts a confirmed AI note but rejects an incomplete one', () => {
  const snapshot = {
    version: 2,
    cards: [{ id: 1, word: 'learn', meaning: 'my meaning', groupId: 1, createdAt: 1,
      aiNote: { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn every day.', 'We learn at school.', 'You can learn from mistakes.'] } }],
    groups: [{ id: 1, name: 'Default' }],
    reviews: { 1: { stage: 0, dueAt: 0, lastReviewedAt: null, lastResult: null, reviewCount: 0 } },
    selectedGroupId: 1,
  };
  assert.equal(isValidSnapshot(snapshot), true);
  assert.equal(isValidSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], aiNote: { definition: 'to gain knowledge', chineseHint: '学习', example: 'I learn every day.' } }] }), true, 'old backups remain readable');
  assert.equal(isValidSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], aiNote: { ...snapshot.cards[0].aiNote, chineseHint: '' } }] }), false);
  assert.equal(isValidSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], aiNote: { ...snapshot.cards[0].aiNote, examples: [] } }] }), false);
});

test('default AI deadline allows slow generation, aborts at 90 seconds, and never retries', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const defaults = readAiConfig({ LINGONEST_AI_BASE_URL: config.baseUrl, LINGONEST_AI_API_KEY: config.apiKey, LINGONEST_AI_MODEL: config.model });
  assert.ok(defaults);
  const result = { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn.', 'We learn.', 'They learn.'] };
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  const service = createAiService(defaults, 'configured', async (_url, init) => {
    calls++;
    signal = init?.signal;
    return new Promise<Response>((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      if (calls === 1) setTimeout(() => resolve(Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] })), 60000);
    });
  });
  const slow = service.analyzeWord({ word: 'learn' });
  t.mock.timers.tick(15001);
  assert.equal(signal?.aborted, false, 'must not keep the old 15-second deadline');
  t.mock.timers.tick(44999);
  assert.deepEqual(await slow, result);
  t.mock.timers.tick(30001);
  assert.equal(signal?.aborted, false, 'completion clears the deadline');

  const stalled = service.recommendWords({ word: 'learn' });
  const rejected = assert.rejects(stalled, (error: unknown) => error instanceof AiServiceError && error.code === 'timeout' && error.status === 504 && error.message.includes('可能仍已处理'));
  t.mock.timers.tick(89999);
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(signal?.aborted, true);
  t.mock.timers.tick(120000);
  assert.equal(calls, 2, 'each user request makes exactly one upstream request');
});

test('AI service sends only the word data and validates provider JSON', async () => {
  let request: RequestInit | undefined;
  const service = createAiService(config, 'configured', async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:4567/chat/completions');
    request = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn every day.', 'We learn at school.', 'You can learn from mistakes.'] }) } }] }), { status: 200 });
  });
  assert.deepEqual(await service.analyzeWord({ word: ' learn ', meaning: '学习' }), { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn every day.', 'We learn at school.', 'You can learn from mistakes.'] });
  assert.equal((request?.headers as Record<string, string>).authorization, 'Bearer secret');
  const body = JSON.parse(String(request?.body));
  assert.equal(body.messages[1].content, JSON.stringify({ word: 'learn', meaning: '学习' }));
  assert.match(body.messages[0].content, /three distinct/);
});

test('AI service reports malformed, provider and timeout errors without leaking details', async () => {
  const malformed = createAiService(config, 'configured', async () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));
  await assert.rejects(() => malformed.analyzeWord({ word: 'learn' }), (error: unknown) => error instanceof AiServiceError && error.code === 'invalid_response' && error.status === 502);
  const extraField = createAiService(config, 'configured', async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ definition: 'to learn', chineseHint: '学习', examples: ['I learn.', 'We learn.', 'They learn.'], hidden: 'extra' }) } }] }), { status: 200 }));
  await assert.rejects(() => extraField.analyzeWord({ word: 'learn' }), (error: unknown) => error instanceof AiServiceError && error.code === 'invalid_response');
  for (const examples of [['I learn.', 'We learn.'], ['I learn.', 'I learn.', 'We learn.']]) {
    const invalidExamples = createAiService(config, 'configured', async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ definition: 'to learn', chineseHint: '学习', examples }) } }] }), { status: 200 }));
    await assert.rejects(() => invalidExamples.analyzeWord({ word: 'learn' }), (error: unknown) => error instanceof AiServiceError && error.code === 'invalid_response');
  }
  const provider = createAiService(config, 'configured', async () => new Response('provider secret', { status: 500 }));
  await assert.rejects(() => provider.analyzeWord({ word: 'learn' }), (error: unknown) => error instanceof AiServiceError && error.code === 'provider_error' && !error.message.includes('secret'));
  const oversized = createAiService(config, 'configured', async () => new Response(' '.repeat(32 * 1024 + 1), { status: 200 }));
  await assert.rejects(() => oversized.analyzeWord({ word: 'learn' }), (error: unknown) => error instanceof AiServiceError && error.code === 'invalid_response');
  const timeout = createAiService(config, 'configured', async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
  await assert.rejects(() => timeout.analyzeWord({ word: 'learn' }), (error: unknown) => error instanceof AiServiceError && error.code === 'timeout' && error.status === 504);
});

test('upstream HTTP failures have distinct safe error codes without provider response bodies', async () => {
  for (const [status, code] of [[400, 'provider_rejected'], [401, 'provider_auth'], [403, 'provider_auth'], [404, 'provider_not_found'], [429, 'rate_limited'], [500, 'provider_error']] as const) {
    const service = createAiService(config, 'configured', async () => new Response('sensitive upstream details', { status }));
    await assert.rejects(() => service.analyzeWord({ word: 'learn' }), (error: unknown) =>
      error instanceof AiServiceError && error.code === code && error.providerStatus === status && !error.message.includes('sensitive'));
  }
});

test('AI routes remain disabled without config and require pairing on LAN', async () => {
  const disabled = createApp(undefined, { aiService: createAiService(null) }).listen(0, '127.0.0.1');
  const paired = createApp(undefined, { backupToken: 'a'.repeat(32), aiService: createAiService(config, 'configured', async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ definition: 'x', chineseHint: '学', examples: ['I learn.', 'We learn.', 'They learn.'] }) } }] }), { status: 200 })) }).listen(0, '127.0.0.1');
  try {
    await Promise.all([once(disabled, 'listening'), once(paired, 'listening')]);
    const disabledUrl = `http://127.0.0.1:${(disabled.address() as AddressInfo).port}`;
    const pairedUrl = `http://127.0.0.1:${(paired.address() as AddressInfo).port}`;
    const statusResponse = await fetch(`${disabledUrl}/ai/status`);
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(await statusResponse.json(), { status: 'disabled' });
    assert.equal((await fetch(`${disabledUrl}/ai/word-analysis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ word: 'learn' }) })).status, 503);
    assert.equal((await fetch(`${pairedUrl}/ai/word-analysis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ word: 'learn' }) })).status, 401);
    const pairedResponse = await fetch(`${pairedUrl}/ai/word-analysis`, { method: 'POST', headers: { authorization: `Bearer ${'a'.repeat(32)}`, 'content-type': 'application/json' }, body: JSON.stringify({ word: 'learn' }) });
    assert.equal(pairedResponse.status, 200);
    assert.deepEqual(await pairedResponse.json(), { definition: 'x', chineseHint: '学', examples: ['I learn.', 'We learn.', 'They learn.'] });
  } finally {
    await Promise.all([new Promise<void>((resolve, reject) => disabled.close((error) => error ? reject(error) : resolve())), new Promise<void>((resolve, reject) => paired.close((error) => error ? reject(error) : resolve()))]);
  }
});
