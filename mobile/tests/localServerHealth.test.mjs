import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHealthUrl, checkLocalServer } from '../localServer/health.ts';

test('health URL accepts private LAN addresses only', () => {
  assert.equal(buildHealthUrl('192.168.1.20'), 'http://192.168.1.20:3000/health');
  assert.equal(buildHealthUrl('10.0.0.2:3001'), 'http://10.0.0.2:3001/health');
  assert.equal(buildHealthUrl('http://172.16.0.5'), 'http://172.16.0.5:3000/health');
  for (const invalid of ['localhost', '127.0.0.1', '8.8.8.8', '0.0.0.0', '192.168.1.300', '192.168.01.2', '192.168.1.2:70000', 'https://192.168.1.2', '192.168.1.2/path']) {
    assert.equal(buildHealthUrl(invalid), null, invalid);
  }
});

test('health check accepts the expected service response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, 'http://192.168.1.20:3000/health');
    return { ok: true, json: async () => ({ status: 'ok', service: 'lingonest-local-server', mode: 'lan-health-only' }) };
  };
  try {
    assert.deepEqual(await checkLocalServer('192.168.1.20'), { kind: 'ok' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('health check distinguishes malformed response and connection failure', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ status: 'ok', service: 'other' }) });
    assert.deepEqual(await checkLocalServer('192.168.1.20'), { kind: 'unexpected-response' });
    globalThis.fetch = async () => { throw new Error('network'); };
    assert.deepEqual(await checkLocalServer('192.168.1.20'), { kind: 'unreachable' });
    assert.deepEqual(await checkLocalServer('localhost'), { kind: 'invalid-address' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('health check times out instead of leaving the screen waiting', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  try {
    assert.deepEqual(await checkLocalServer('192.168.1.20', 10), { kind: 'timeout' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
