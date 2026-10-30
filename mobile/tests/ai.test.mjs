import assert from 'node:assert/strict';
import test from 'node:test';
import { requestWordAnalysis, requestRelatedWords, AiRequestError } from '../localServer/ai.ts';

test('both mobile AI requests wait for slow results and stop at 120 seconds without retrying', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = { address: '192.168.1.20:3001', token: 'a'.repeat(32) };
  const analysis = { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn.', 'We learn.', 'They learn.'] };
  let calls = 0;
  let signal;
  let stalled = false;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    signal = init.signal;
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      if (!stalled) setTimeout(() => resolve({ ok: true, json: async () => url.endsWith('/ai/related-words') ? { candidates: [] } : analysis }), 100000);
    });
  });
  for (const request of [requestWordAnalysis, requestRelatedWords]) {
    const pending = request(connection, 'learn');
    t.mock.timers.tick(35001);
    assert.equal(signal.aborted, false, 'must not stop at the previous mobile deadline');
    t.mock.timers.tick(64999);
    assert.deepEqual(await pending, request === requestWordAnalysis ? analysis : []);
    t.mock.timers.tick(20001);
    assert.equal(signal.aborted, false, 'completion clears the deadline');
  }
  stalled = true;
  const pending = requestRelatedWords(connection, 'learn');
  const rejected = assert.rejects(pending, (error) => error instanceof AiRequestError && error.code === 'timeout' && error.message.includes('可能仍已处理'));
  t.mock.timers.tick(119999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(signal.aborted, true);
  t.mock.timers.tick(120000);
  assert.equal(calls, 3);
});

test('mobile AI client only calls the paired local server and parses the contract', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://192.168.1.20:3001/ai/word-analysis');
    assert.equal(init.headers.authorization, `Bearer ${'a'.repeat(32)}`);
    return { ok: true, status: 200, json: async () => ({ definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn.', 'We learn.', 'They learn.'] }) };
  };
  try {
    assert.deepEqual(await requestWordAnalysis({ address: '192.168.1.20:3001', token: 'a'.repeat(32) }, 'learn'), { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn.', 'We learn.', 'They learn.'] });
  } finally { globalThis.fetch = originalFetch; }
});

test('mobile rejects incomplete AI content and never accepts a public address', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ definition: 'to learn', examples: ['I learn.'] }) });
  try {
    await assert.rejects(() => requestWordAnalysis({ address: '192.168.1.20:3001', token: 'a'.repeat(32) }, 'learn'), (error) => error instanceof AiRequestError && error.code === 'invalid');
    for (const examples of [['I learn.'], ['I learn.', 'I learn.', 'We learn.']]) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ definition: 'to learn', chineseHint: '学习', examples }) });
      await assert.rejects(() => requestWordAnalysis({ address: '192.168.1.20:3001', token: 'a'.repeat(32) }, 'learn'), (error) => error instanceof AiRequestError && error.code === 'invalid');
    }
    await assert.rejects(() => requestWordAnalysis({ address: '8.8.8.8', token: 'a'.repeat(32) }, 'learn'), (error) => error instanceof AiRequestError && error.code === 'address');
  } finally { globalThis.fetch = originalFetch; }
});

test('mobile AI client gives safe errors for disabled AI and invalid addresses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'ai_disabled' }) });
  try {
    await assert.rejects(() => requestWordAnalysis({ address: '192.168.1.20', token: 'a'.repeat(32) }, 'learn'), (error) => error instanceof AiRequestError && error.code === 'disabled');
    await assert.rejects(() => requestWordAnalysis({ address: 'localhost', token: 'a'.repeat(32) }, 'learn'), (error) => error instanceof AiRequestError && error.code === 'address');
  } finally { globalThis.fetch = originalFetch; }
});

test('mobile explains upstream failure categories without exposing raw provider content', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, serverCode, clientCode] of [
      [502, 'provider_auth', 'provider_auth'],
      [502, 'provider_not_found', 'provider_not_found'],
      [502, 'provider_rejected', 'provider_rejected'],
      [503, 'rate_limited', 'rate_limited'],
      [502, 'invalid_response', 'invalid_response'],
      [504, 'timeout', 'timeout'],
    ]) {
      globalThis.fetch = async () => ({ ok: false, status, json: async () => ({ error: serverCode, secret: 'must-not-display' }) });
      await assert.rejects(() => requestWordAnalysis({ address: '192.168.1.20:3001', token: 'a'.repeat(32) }, 'learn'),
        (error) => error instanceof AiRequestError && error.code === clientCode && !error.message.includes('must-not-display'));
    }
  } finally { globalThis.fetch = originalFetch; }
});
