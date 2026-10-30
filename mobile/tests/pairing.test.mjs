import assert from 'node:assert/strict';
import test from 'node:test';
import { checkComputerPairing } from '../localServer/pairing.ts';

const connection = { address: '192.168.1.20:3001', token: 'a'.repeat(32) };
const health = { status: 'ok', service: 'lingonest-local-server', mode: 'lan-backup' };

test('pairing checks server mode then authenticates without calling a paid provider', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json(calls.length === 1 ? health : { status: 'disabled' });
  });
  await checkComputerPairing(connection);
  assert.equal(calls.length, 2); assert.equal(calls[1].url, 'http://192.168.1.20:3001/ai/status');
  assert.equal(calls[1].options.headers.authorization, `Bearer ${connection.token}`);
});
test('public addresses and invalid codes are rejected before any request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
  await assert.rejects(checkComputerPairing({ ...connection, address: '8.8.8.8:3001' }), /局域网/);
  await assert.rejects(checkComputerPairing({ ...connection, token: 'bad' }), /完整配对码/);
  assert.equal(fetch.mock.callCount(), 0);
});
test('health-only servers cannot pair, and wrong tokens return a safe auth error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...health, mode: 'lan-health-only' }));
  await assert.rejects(checkComputerPairing(connection), /配对模式/);
  globalThis.fetch = async (url) => url.endsWith('/health') ? Response.json(health) : Response.json({ error: 'unauthorized' }, { status: 401 });
  await assert.rejects(checkComputerPairing(connection), (error) => error.code === 'auth' && !error.message.includes(connection.token));
});
