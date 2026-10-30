import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { AI_RUNTIME_POLICY, AiServiceError, createAiService } from '../src/ai.js';
import { createApp } from '../src/app.js';

const config = { baseUrl: 'https://example.com/v1', apiKey: 'fake-secret-for-tests', model: 'test-model', timeoutMs: 1000 };
const analysis = { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn English.', 'We learn at school.', 'They learn by reading.'] };
const answer = (value: unknown = analysis) => Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
const words = ['learn', 'read', 'write', 'speak'].map((word, i) => ({ id: i + 1, word, meaning: '测试词义' }));
function gate() { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; }

test('validated analysis cache distinguishes meaning and case, expires, and never shares mutable results', async () => {
  let calls = 0; let now = 1000;
  const service = createAiService(config, 'configured', async () => { calls++; return answer(); }, () => now);
  const first = await service.analyzeWord({ word: ' learn ', meaning: ' study ' });
  first.examples[0] = 'changed';
  assert.deepEqual(await service.analyzeWord({ word: 'learn', meaning: 'study' }), analysis);
  assert.equal(calls, 1);
  await service.analyzeWord({ word: 'learn', meaning: 'discover' });
  await service.analyzeWord({ word: 'Learn', meaning: 'study' });
  assert.equal(calls, 3, 'case may change meaning and must remain part of the key');
  const usage = service.getUsage(); usage.tasks.analysis.cacheHits = 999;
  assert.equal(service.getUsage().tasks.analysis.cacheHits, 1);
  now += AI_RUNTIME_POLICY.ttlMs;
  assert.equal(service.getUsage().cache.entries, 0);
  await service.analyzeWord({ word: 'learn', meaning: 'study' });
  assert.equal(calls, 4);
});

test('analysis and recommendation are separate cache tasks and configuration instances are isolated', async () => {
  let calls = 0;
  const service = createAiService(config, 'configured', async (_url, init) => {
    calls++;
    const prompt = JSON.parse(String(init?.body)).messages[0].content as string;
    return answer(prompt.startsWith('Recommend') ? { candidates: [] } : analysis);
  });
  await service.analyzeWord({ word: 'learn' });
  assert.deepEqual(await service.recommendWords({ word: 'learn' }), []);
  await service.recommendWords({ word: 'learn' });
  assert.equal(calls, 2);
  assert.equal(service.getUsage().tasks.related.cacheHits, 1);
  const other = createAiService({ ...config, model: 'another-model' }, 'configured', async () => { calls++; return answer(); });
  await other.analyzeWord({ word: 'learn' });
  assert.equal(calls, 3);
});

test('cache bounds use least recently accessed eviction', async () => {
  let calls = 0;
  const service = createAiService(config, 'configured', async () => { calls++; return answer(); });
  for (let i = 0; i < AI_RUNTIME_POLICY.maxEntries; i++) await service.analyzeWord({ word: `word${i}` });
  await service.analyzeWord({ word: 'word0' });
  await service.analyzeWord({ word: 'extra' });
  await service.analyzeWord({ word: 'word0' });
  assert.equal(calls, 201);
  await service.analyzeWord({ word: 'word1' });
  assert.equal(calls, 202);
  assert.equal(service.getUsage().cache.entries, 200);
});

test('in-flight duplicates share one provider call; two distinct tasks cap concurrency without retry', async () => {
  const waiting = gate(); let calls = 0;
  const service = createAiService(config, 'configured', async () => { calls++; await waiting.promise; return answer(); });
  const first = service.analyzeWord({ word: 'learn' });
  const duplicate = service.analyzeWord({ word: 'learn' });
  const second = service.analyzeWord({ word: 'read' });
  await assert.rejects(service.analyzeWord({ word: 'write' }), (error: unknown) => error instanceof AiServiceError && error.code === 'busy' && error.status === 503);
  assert.equal(calls, 2);
  assert.equal(service.getUsage().inFlight, 2);
  waiting.release();
  const [a, b] = await Promise.all([first, duplicate, second]);
  a.examples[0] = 'changed'; assert.deepEqual(b, analysis);
  assert.equal(service.getUsage().inFlight, 0);
  const metrics = service.getUsage().tasks.analysis;
  assert.deepEqual(metrics, { requests: 4, providerRequests: 2, cacheHits: 0, coalesced: 1, succeeded: 2, failed: 0, busyRejected: 1 });
  await service.analyzeWord({ word: 'write' });
  assert.equal(calls, 3, 'capacity is released after completion');
});

test('failed coalesced requests count one failure, do not cache, and release capacity', async () => {
  const waiting = gate(); let calls = 0;
  const service = createAiService(config, 'configured', async () => { calls++; await waiting.promise; return calls === 1 ? answer({}) : answer(); });
  const first = assert.rejects(service.analyzeWord({ word: 'learn' }), { code: 'invalid_response' });
  const second = assert.rejects(service.analyzeWord({ word: 'learn' }), { code: 'invalid_response' });
  waiting.release(); await Promise.all([first, second]);
  assert.equal(service.getUsage().cache.entries, 0);
  assert.equal(service.getUsage().failures.invalid_response, 1);
  assert.equal(calls, 1);
  await service.analyzeWord({ word: 'learn' });
  assert.equal(calls, 2);
});

test('provider errors are aggregated by safe code and never cached or automatically retried', async () => {
  for (const [status, code] of [[401, 'provider_auth'], [404, 'provider_not_found'], [422, 'provider_rejected'], [429, 'rate_limited'], [500, 'provider_error']] as const) {
    let calls = 0;
    const service = createAiService(config, 'configured', async () => { calls++; return new Response('PRIVATE PROVIDER BODY', { status }); });
    for (let i = 0; i < 2; i++) await assert.rejects(service.analyzeWord({ word: 'learn' }), { code });
    assert.equal(calls, 2);
    assert.equal(service.getUsage().failures[code], 2);
    assert.equal(service.getUsage().cache.entries, 0);
    assert.ok(!JSON.stringify(service.getUsage()).includes('PRIVATE'));
  }
});

test('timeouts and transport errors release in-flight state and keep safe failure counts', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const service = createAiService(config, 'configured', async (_url, init) => {
    calls++;
    if (calls > 1) throw new Error('private network details');
    return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const rejected = assert.rejects(service.analyzeWord({ word: 'learn' }), { code: 'timeout' });
  t.mock.timers.tick(1000); await rejected;
  assert.equal(service.getUsage().inFlight, 0);
  await assert.rejects(service.analyzeWord({ word: 'learn' }), { code: 'provider_error' });
  assert.equal(service.getUsage().failures.timeout, 1);
  assert.equal(service.getUsage().failures.provider_error, 1);
  assert.equal(calls, 2);
});

test('clearing cache keeps counters and prevents older in-flight work from repopulating it', async () => {
  let calls = 0; const waiting = gate();
  const service = createAiService(config, 'configured', async () => { calls++; if (calls === 2) await waiting.promise; return answer(); });
  await service.analyzeWord({ word: 'learn' });
  const pending = service.analyzeWord({ word: 'read' });
  service.clearCache();
  assert.equal(service.getUsage().cache.entries, 0);
  assert.equal(service.getUsage().inFlight, 1);
  waiting.release(); await pending;
  assert.equal(service.getUsage().cache.entries, 0);
  await service.analyzeWord({ word: 'read' });
  assert.equal(calls, 3);
  assert.equal(service.getUsage().tasks.analysis.succeeded, 3);
});

test('exercises coalesce only simultaneous identical input and never reuse a finished exercise', async () => {
  let calls = 0; const waiting = gate();
  const service = createAiService(config, 'configured', async () => { calls++; await waiting.promise; return answer({ questions: [] }); });
  const first = service.generateExercises({ words });
  const second = service.generateExercises({ words });
  waiting.release(); await Promise.all([first, second]);
  await service.generateExercises({ words });
  assert.equal(calls, 2);
  assert.equal(service.getUsage().tasks.exercise.coalesced, 1);
  assert.equal(service.getUsage().cache.entries, 0);
  await assert.rejects(service.generateExercises({ words: [] }), { code: 'invalid_request' });
  assert.equal(service.getUsage().tasks.exercise.requests, 3, 'invalid input is excluded from AI request counts');
});

test('usage and clearing require pairing, hide inputs/config, and preserve status contract', async () => {
  const service = createAiService(config, 'configured', async () => answer());
  await service.analyzeWord({ word: 'privateword', meaning: 'private meaning' });
  const token = 'a'.repeat(32);
  const server = createApp(undefined, { backupToken: token, aiService: service }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const [path, method] of [['/ai/usage', 'GET'], ['/ai/cache', 'DELETE']]) {
      assert.equal((await fetch(base + path, { method })).status, 401);
      const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const value = await response.json();
      assert.equal(value.cache.entries, method === 'DELETE' ? 0 : 1);
      assert.equal(value.tasks.analysis.providerRequests, 1);
      for (const sensitive of ['privateword', 'private meaning', config.apiKey, config.baseUrl, config.model, analysis.definition, token]) assert.ok(!JSON.stringify(value).includes(sensitive));
    }
    assert.deepEqual(await (await fetch(base + '/ai/status', { headers: { authorization: `Bearer ${token}` } })).json(), { status: 'configured' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('management endpoints work without AI configuration and stay unavailable in health-only mode', async () => {
  for (const healthOnly of [false, true]) {
    const server = createApp(undefined, { aiService: createAiService(null), lanHealthOnly: healthOnly }).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      for (const [path, method] of [['/ai/usage', 'GET'], ['/ai/cache', 'DELETE']]) {
        const response = await fetch(base + path, { method });
        assert.equal(response.status, healthOnly ? 404 : 200);
        if (!healthOnly) assert.equal((await response.json()).status, 'disabled');
      }
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
});
