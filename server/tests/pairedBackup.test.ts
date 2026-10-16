import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { openBackupStore } from '../src/backupStore.js';

test('paired backup blocks unauthorized access, stale identities and incomplete data', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingonest-paired-'));
  const path = join(directory, 'backup.sqlite');
  let store = openBackupStore(path);
  const id = store.serverId;
  store.close();
  store = openBackupStore(path);
  assert.equal(store.serverId, id, 'database identity survives restart');
  const token = 'a'.repeat(32); // Test-only credential; production generates a random code.
  const server = createApp(store, { backupToken: token }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const snapshot = {
    version: 2, cards: [{ id: 2, word: 'safe', meaning: 'protected', groupId: 1, createdAt: 1 }],
    groups: [{ id: 1, name: 'Default' }], selectedGroupId: 1,
    reviews: { 2: { stage: 1, dueAt: 100, lastReviewedAt: 1, lastResult: 'remembered', reviewCount: 1 } },
  };
  try {
    assert.equal((await (await fetch(`${base}/health`)).json()).mode, 'lan-backup');
    for (const method of ['GET', 'PUT']) {
      assert.equal((await fetch(`${base}/backup`, { method })).status, 401);
      assert.equal((await fetch(`${base}/backup`, { method, headers: { authorization: 'Bearer wrong' } })).status, 401);
    }
    assert.deepEqual(await (await fetch(`${base}/backup`, { headers })).json(), { serverId: id, backup: null });
    for (const expectedServerId of [undefined, 'old-database']) {
      assert.equal((await fetch(`${base}/backup`, { method: 'PUT', headers,
        body: JSON.stringify({ snapshot, expectedRevision: 0, expectedServerId }) })).status, 409);
    }
    assert.equal(store.read(), null);
    assert.equal((await fetch(`${base}/backup`, { method: 'PUT', headers,
      body: JSON.stringify({ snapshot: { ...snapshot, reviews: {} }, expectedRevision: 0, expectedServerId: id }) })).status, 400);
    const save = () => fetch(`${base}/backup`, { method: 'PUT', headers,
      body: JSON.stringify({ snapshot, expectedRevision: 0, expectedServerId: id }) });
    assert.equal((await save()).status, 200);
    assert.equal((await save()).status, 409);
    assert.deepEqual(store.read()?.snapshot, snapshot);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    unlinkSync(path);
    rmdirSync(directory);
  }
});
