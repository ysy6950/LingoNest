import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { once } from 'node:events';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes('/localServer/') && /^\.\/\w+$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    if (context.parentURL?.includes('/server/src/') && specifier.endsWith('.js')) {
      return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
    }
    return nextResolve(specifier, context);
  },
});

const { readComputerBackup, saveComputerBackup } = await import('../localServer/backup.ts');
const { transferBackup } = await import('../localServer/transfer.ts');
const { isBackupSnapshot } = await import('../localServer/snapshot.ts');
const connection = { address: '192.168.1.20:3001', token: 'a'.repeat(32) };
const snapshot = {
  version: 3, cards: [{ id: 12, word: 'safe', meaning: 'protected', groupId: 1, createdAt: 100 }],
  groups: [{ id: 1, name: '默认组' }, { id: 0, name: '未分组' }], selectedGroupId: 1,
  reviews: { 12: { stage: 2, dueAt: 10000, lastReviewedAt: 100, lastResult: 'remembered', reviewCount: 2 } },
};
const state = (revision = 1) => ({ serverId: 'computer-one', backup: { revision, updatedAt: '2026-10-17T00:00:00Z', snapshot } });
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
async function withFetch(mock, action) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { await action(); } finally { globalThis.fetch = previous; }
}

test('client rejects unauthorized, unavailable, malformed and incomplete backups', async () => {
  for (const [status, code] of [[401, 'auth'], [409, 'conflict'], [404, 'mode'], [413, 'size'], [500, 'server']]) {
    await withFetch(async () => reply({}, status), async () => {
      await assert.rejects(readComputerBackup(connection), (error) => error.code === code);
    });
  }
  for (const invalid of [{}, { serverId: 'x', backup: { revision: 1, snapshot: {} } },
    { ...state(), backup: { ...state().backup, snapshot: { ...snapshot, reviews: {} } } }]) {
    await withFetch(async () => reply(invalid), async () => {
      await assert.rejects(readComputerBackup(connection), (error) => error.code === 'invalid');
    });
  }
  assert.equal(isBackupSnapshot(snapshot), true);
  const note = { definition: 'protected from danger', chineseHint: '安全的', examples: ['The door is safe.', 'We found a safe place.', 'Keep your files safe.'] };
  assert.equal(isBackupSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], aiNote: note }] }), true);
  assert.equal(isBackupSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], aiNote: { definition: note.definition, chineseHint: note.chineseHint, example: note.examples[0] } }] }), true);
  assert.equal(isBackupSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], aiNote: { ...note, examples: [''] } }] }), false);
  assert.equal(isBackupSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], pronunciation: { ipa: 'ˈseɪf', audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/safe0001.mp3', audioAccent: 'us', source: 'merriam-webster-learners', fetchedAt: 100 } }] }), true);
  assert.equal(isBackupSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], pronunciation: { source: 'merriam-webster-learners' } }] }), false);
  assert.equal(isBackupSnapshot({ ...snapshot, cards: [...snapshot.cards, snapshot.cards[0]] }), false);
});

test('reading an existing v2 computer backup offers a v3 snapshot without changing its content', async () => {
  const legacy = { ...snapshot, version: 2 };
  await withFetch(async () => reply({ ...state(), backup: { ...state().backup, snapshot: legacy } }), async () => {
    const remote = await readComputerBackup(connection);
    assert.equal(remote.backup.snapshot.version, 3);
    assert.deepEqual(remote.backup.snapshot.cards, legacy.cards);
    assert.deepEqual(remote.backup.snapshot.reviews, legacy.reviews);
  });
  assert.equal(legacy.version, 2);
});

test('failed upload acknowledgement tells user to read state before retrying', async () => {
  await withFetch(async () => { throw new Error('disconnected after PUT'); }, async () => {
    await assert.rejects(saveComputerBackup(connection, snapshot, state()), /可能已保存/);
  });
  await withFetch(async () => reply({ ...state(2), serverId: 'other' }), async () => {
    await assert.rejects(saveComputerBackup(connection, snapshot, state()), /重新读取/);
  });
});

test('an unresponsive computer read is cancelled and reported as timeout', async () => {
  await withFetch(async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), async () => {
    await assert.rejects(readComputerBackup(connection, 10), (error) => error.code === 'timeout' && /超时/.test(error.message));
  });
});

test('changed computer or phone state never reaches PUT or local restore', async () => {
  for (const changed of [state(2), { ...state(), serverId: 'replacement-db' }]) {
    let calls = 0;
    await withFetch(async () => { calls += 1; return reply(changed); }, async () => {
      const local = { exportSnapshot: () => snapshot, restoreFromBackup: () => assert.fail('must not restore') };
      for (const action of ['backup', 'restore']) {
        await assert.rejects(transferBackup(action, connection, state(), snapshot, local), (error) => error.code === 'conflict');
      }
      assert.equal(calls, 2, 'only preflight GETs, no PUT');
    });
  }
  let localSnapshot = snapshot;
  await withFetch(async () => {
    localSnapshot = { ...snapshot, cards: [] };
    return reply(state());
  }, async () => {
    await assert.rejects(transferBackup('restore', connection, state(), snapshot, {
      exportSnapshot: () => localSnapshot, restoreFromBackup: () => assert.fail('must not restore'),
    }), (error) => error.code === 'changed');
  });
});

test('restore passes the confirmed local fingerprint and propagates device save failure', async () => {
  await withFetch(async () => reply(state()), async () => {
    await assert.rejects(transferBackup('restore', connection, state(), snapshot, {
      exportSnapshot: () => snapshot,
      restoreFromBackup: async (incoming, expected) => {
        assert.deepEqual(incoming, snapshot);
        assert.equal(expected, JSON.stringify(snapshot));
        return 'save-failed';
      },
    }), (error) => error.code === 'save-failed');
  });
});

test('mobile HTTP client interoperates with real paired Express and SQLite', async () => {
  const { createApp } = await import('../../server/src/app.ts');
  const { openBackupStore } = await import('../../server/src/backupStore.ts');
  const store = openBackupStore(':memory:');
  const server = createApp(store, { backupToken: connection.token }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const actualFetch = globalThis.fetch;
  // The HTTP exchange is real; only substitute the LAN URL with the test listener.
  try {
    await withFetch((url, options) => actualFetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options), async () => {
      const empty = await readComputerBackup(connection);
      assert.equal(empty.backup, null);
      const saved = await transferBackup('backup', connection, empty, snapshot, {
        exportSnapshot: () => snapshot, restoreFromBackup: () => assert.fail('upload cannot restore'),
      });
      assert.equal(saved.remote.backup.revision, 1);
      assert.deepEqual(store.read().snapshot, snapshot);
      const reread = await readComputerBackup(connection);
      let restored;
      await transferBackup('restore', connection, reread, snapshot, {
        exportSnapshot: () => snapshot,
        restoreFromBackup: async (incoming) => { restored = incoming; return 'restored'; },
      });
      assert.deepEqual(restored, snapshot);
      await assert.rejects(saveComputerBackup(connection, snapshot, empty), (error) => error.code === 'conflict');
      await assert.rejects(readComputerBackup({ ...connection, token: 'b'.repeat(32) }), (error) => error.code === 'auth');
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  }
});
