import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { openBackupStore, type BackupStore } from '../src/backupStore.js';

const snapshot = {
  version: 2,
  cards: [{ id: 12, word: 'learn', meaning: 'to gain knowledge', groupId: 1, createdAt: 1000 }],
  groups: [{ id: 1, name: 'Default' }],
  reviews: {
    12: { stage: 0, dueAt: 0, lastReviewedAt: null, lastResult: null, reviewCount: 0 },
  },
  selectedGroupId: 1,
};

async function start(store: BackupStore): Promise<{ server: Server; url: string }> {
  const server = createApp(store).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function stop(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function put(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/backup`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('backup survives restart and stale writes do not replace it', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingonest-backup-test-'));
  const databasePath = join(directory, 'backup.sqlite');
  let store = openBackupStore(databasePath);
  let running: { server: Server; url: string } | undefined;

  try {
    running = await start(store);
    const empty = await fetch(`${running.url}/backup`);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { backup: null });

    const first = await put(running.url, { snapshot, expectedRevision: 0 });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.backup.revision, 1);
    assert.deepEqual(firstBody.backup.snapshot, snapshot);
    assert.ok(!Number.isNaN(Date.parse(firstBody.backup.updatedAt)));

    const conflict = await put(running.url, {
      snapshot: { ...snapshot, cards: [{ ...snapshot.cards[0], meaning: 'changed' }] },
      expectedRevision: 0,
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { error: 'revision_conflict' });

    await stop(running.server);
    running = undefined;
    store.close();

    store = openBackupStore(databasePath);
    running = await start(store);
    const restored = await fetch(`${running.url}/backup`);
    assert.equal(restored.status, 200);
    assert.deepEqual((await restored.json()).backup.snapshot, snapshot);

    const updated = await put(running.url, { snapshot, expectedRevision: 1 });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).backup.revision, 2);

    const stale = await put(running.url, { snapshot, expectedRevision: 1 });
    assert.equal(stale.status, 409);
    assert.equal(store.read()?.revision, 2);
  } finally {
    if (running) await stop(running.server);
    store.close();
    unlinkSync(databasePath);
    rmdirSync(directory);
  }
});

test('invalid snapshots and malformed JSON never change the backup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingonest-invalid-test-'));
  const databasePath = join(directory, 'backup.sqlite');
  const store = openBackupStore(databasePath);
  const running = await start(store);

  try {
    const invalid = await put(running.url, { snapshot: { ...snapshot, cards: 'not-an-array' }, expectedRevision: 0 });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'invalid_backup' });

    const duplicate = await put(running.url, { snapshot: { ...snapshot, cards: [snapshot.cards[0], snapshot.cards[0]] }, expectedRevision: 0 });
    assert.equal(duplicate.status, 400);

    const malformed = await fetch(`${running.url}/backup`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'invalid_json' });

    const oversized = await put(running.url, {
      snapshot: { ...snapshot, cards: [{ ...snapshot.cards[0], meaning: 'x'.repeat(5 * 1024 * 1024) }] },
      expectedRevision: 0,
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: 'backup_too_large' });
    assert.equal(store.read(), null);
  } finally {
    await stop(running.server);
    store.close();
    unlinkSync(databasePath);
    rmdirSync(directory);
  }
});
