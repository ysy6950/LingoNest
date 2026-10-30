import assert from 'node:assert/strict';
import test from 'node:test';
import { aiFailureLabels, aiTaskLabels, clearAiCache, requestAiUsage, requestWordAnalysis } from '../localServer/ai.ts';

const connection = { address: '192.168.1.20:3001', token: 'a'.repeat(32) };
const usage = () => ({ status: 'configured', startedAt: 1000, cache: { ttlMs: 86400000, maxEntries: 200, entries: 1 }, maxConcurrent: 2, inFlight: 0,
  tasks: Object.fromEntries(Object.keys(aiTaskLabels).map((task) => [task, { requests: 0, providerRequests: 0, cacheHits: 0, coalesced: 0, succeeded: 0, failed: 0, busyRejected: 0 }])),
  failures: Object.fromEntries(Object.keys(aiFailureLabels).map((code) => [code, 0])),
});

test('usage and clear use authenticated local management endpoints without sending vocabulary', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(url); assert.equal(init.body, undefined);
    assert.equal(init.headers.authorization, `Bearer ${connection.token}`);
    assert.equal(init.method, url.endsWith('/usage') ? 'GET' : 'DELETE');
    return { ok: true, status: 200, json: async () => usage() };
  });
  assert.deepEqual(await requestAiUsage(connection), usage());
  assert.deepEqual(await clearAiCache(connection), usage());
  assert.deepEqual(calls, ['http://192.168.1.20:3001/ai/usage', 'http://192.168.1.20:3001/ai/cache']);
});

test('usage rejects unsafe or incomplete counters and unexpected fields', async (t) => {
  let value;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => value }));
  const negative = usage(); negative.tasks.analysis.failed = -1;
  const wrong = usage(); wrong.failures.timeout = '1';
  const missing = usage(); delete missing.tasks.exercise;
  const extra = usage(); extra.apiKey = 'unexpected';
  const large = usage(); large.cache.entries = 201;
  const busy = usage(); busy.inFlight = 3;
  for (value of [null, {}, negative, wrong, missing, extra, large, busy]) await assert.rejects(requestAiUsage(connection), { code: 'invalid_response' });
});

test('old backend, expired pairing, busy provider and offline errors stay understandable', async (t) => {
  let status = 404; let code = '';
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status, json: async () => ({ error: code }) }));
  await assert.rejects(requestAiUsage(connection), { code: 'mode' });
  status = 401;
  await assert.rejects(clearAiCache(connection), { code: 'auth' });
  status = 503; code = 'busy';
  await assert.rejects(requestWordAnalysis(connection, 'learn'), (error) => error.code === 'busy' && error.message.includes('两个'));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  await assert.rejects(requestAiUsage(connection), { code: 'network' });
});

test('management deadlines are 10 seconds, explain uncertain clearing and never automatically retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const rejected = assert.rejects(requestAiUsage(connection), { code: 'timeout', message: '等待电脑返回用量超时，请确认电脑服务仍在运行后再试。' });
  t.mock.timers.tick(10000); await rejected;
  assert.equal(calls, 1);
  const clearing = assert.rejects(clearAiCache(connection), { code: 'timeout', message: '等待电脑确认清理结果超时，请先查询用量确认是否已清理。' });
  t.mock.timers.tick(10000); await clearing;
  assert.equal(calls, 2);
});
