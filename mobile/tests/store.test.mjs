import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// The store runs in Expo, where AsyncStorage is a native module. These tests
// replace only that boundary with a controllable in-memory device store. The
// Zustand actions, migration code, scheduler, and JSON serialization stay real.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@react-native-async-storage/async-storage') {
      return { url: 'lingonest-test:async-storage', shortCircuit: true };
    }
    if (specifier === '../reviewScheduler' && context.parentURL?.includes('/store/useLingoStore.ts')) {
      return nextResolve('../reviewScheduler.ts', context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'lingonest-test:async-storage') {
      return {
        format: 'module',
        source: `export default {
          getItem: (...args) => globalThis.__lingonestTestStorage.getItem(...args),
          setItem: (...args) => globalThis.__lingonestTestStorage.setItem(...args),
        };`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

let storeSequence = 0;

function device(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    data,
    failNextWrite: false,
    writes: [],
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      if (storage.failNextWrite) {
        storage.failNextWrite = false;
        throw new Error('Simulated device write failure');
      }
      data.set(key, value);
      storage.writes.push({ key, value });
    },
    snapshot() {
      return JSON.parse(data.get('lingonest.v2'));
    },
  };
  return storage;
}

async function openStore(storage) {
  globalThis.__lingonestTestStorage = storage;
  // Each query string models a fresh app process with a new module-level store.
  const { useLingoStore } = await import(`../store/useLingoStore.ts?test=${++storeSequence}`);
  await useLingoStore.getState().hydrate();
  return useLingoStore;
}

async function waitForSave(store) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!store.getState().isSaving) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.fail('Timed out waiting for the device write');
}

const REVIEWED_AT = '2026-10-05T08:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

test('legacy cards, groups, and known/unknown answers migrate into a recoverable v2 snapshot', async () => {
  const oldCards = [
    { id: 101, word: '  curious ', meaning: '想知道的', groupId: 7, reviewResult: 'known', lastReviewedAt: REVIEWED_AT },
    { id: 102, word: 'brave', meaning: '勇敢的', groupId: 7, reviewResult: 'unknown', lastReviewedAt: REVIEWED_AT },
    { id: 103, word: 'plain', meaning: '简单的' },
  ];
  const oldGroups = [{ id: 7, name: '阅读' }];
  const storage = device({
    'lingonest.cards': JSON.stringify(oldCards),
    'lingonest.groups': JSON.stringify(oldGroups),
    'lingonest.demo-seeded': 'true',
  });
  const store = await openStore(storage);
  const state = store.getState();
  const saved = storage.snapshot();

  assert.equal(state.isHydrated, true);
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.cards.map((card) => card.id), [101, 102, 103]);
  assert.equal(saved.cards[0].groupId, 7);
  assert.equal(saved.cards[2].groupId, 1);
  assert.ok(saved.groups.some((group) => group.id === 7 && group.name === '阅读'));
  assert.ok(saved.groups.some((group) => group.id === 1 && group.name === '默认组'));
  assert.ok(saved.groups.some((group) => group.id === 0 && group.name === '未分组'));
  assert.deepEqual(saved.reviews[101], {
    stage: 1,
    dueAt: Date.parse(REVIEWED_AT) + DAY_MS,
    lastReviewedAt: Date.parse(REVIEWED_AT),
    lastResult: 'remembered',
    reviewCount: 1,
  });
  assert.equal(saved.reviews[102].dueAt, 0);
  assert.equal(saved.reviews[102].lastResult, 'again');
  assert.equal(saved.reviews[103].reviewCount, 0);
  assert.equal(storage.data.get('lingonest.cards'), JSON.stringify(oldCards), 'old data remains as a recovery copy');
});

test('fresh install seeds demo words once, including after a fresh store reopens', async () => {
  const storage = device();
  const first = await openStore(storage);
  const initialIds = first.getState().cards.map((card) => card.id);

  assert.deepEqual(first.getState().cards.map((card) => card.word), [
    'persist', 'resilient', 'consistent', 'immerse',
  ]);
  await first.getState().hydrate();
  assert.deepEqual(first.getState().cards.map((card) => card.id), initialIds);

  const reopened = await openStore(storage);
  assert.deepEqual(reopened.getState().cards.map((card) => card.id), initialIds);
  assert.equal(storage.writes.filter((write) => write.key === 'lingonest.v2').length, 1);
});

test('add, edit, move, answer, and delete persist the current cards and separate review state', async () => {
  const storage = device({ 'lingonest.demo-seeded': 'true' });
  const store = await openStore(storage);
  const groupId = store.getState().addGroup('  考试  ');
  assert.equal(typeof groupId, 'number');

  const cardId = store.getState().addCard('  achieve  ', '  达成  ', groupId);
  assert.equal(typeof cardId, 'number');
  assert.equal(store.getState().cards.find((card) => card.id === cardId).word, 'achieve');
  assert.equal(store.getState().editCard(cardId, ' accomplished ', ' 已完成的 '), true);
  store.getState().moveCard(cardId, 0);
  store.getState().answerReview(cardId, 'remembered', Date.parse(REVIEWED_AT));
  await waitForSave(store);

  let saved = storage.snapshot();
  assert.equal(saved.cards.find((card) => card.id === cardId).meaning, '已完成的');
  assert.equal(saved.cards.find((card) => card.id === cardId).groupId, 0);
  assert.equal(saved.groups.find((group) => group.id === groupId).name, '考试');
  assert.equal(saved.reviews[cardId].dueAt, Date.parse(REVIEWED_AT) + DAY_MS);
  assert.equal(saved.reviews[cardId].reviewCount, 1);

  store.getState().deleteCard(cardId);
  await waitForSave(store);
  saved = storage.snapshot();
  assert.equal(saved.cards.some((card) => card.id === cardId), false);
  assert.equal(saved.reviews[cardId], undefined);
});

test('a failed save reports an error and retrySave writes the latest in-memory state', async () => {
  const storage = device({ 'lingonest.demo-seeded': 'true' });
  const store = await openStore(storage);
  storage.failNextWrite = true;

  const cardId = store.getState().addCard('rescue', '救援', 1);
  await waitForSave(store);
  assert.match(store.getState().error, /保存失败/);
  assert.equal(store.getState().cards.some((card) => card.id === cardId), true);
  assert.equal(storage.snapshot().cards.some((card) => card.id === cardId), false);

  assert.equal(await store.getState().retrySave(), true);
  assert.equal(store.getState().error, null);
  assert.equal(store.getState().isSaving, false);
  assert.equal(storage.snapshot().cards.some((card) => card.id === cardId), true);
});

test('invalid v2 data never gets overwritten by sample words', async () => {
  const raw = '{broken json';
  const storage = device({ 'lingonest.v2': raw });
  const store = await openStore(storage);

  assert.equal(store.getState().isHydrated, false);
  assert.match(store.getState().error, /读取本地数据失败/);
  assert.equal(storage.data.get('lingonest.v2'), raw);
  assert.equal(await store.getState().retrySave(), false);
  assert.equal(storage.writes.length, 0);
});

test('backup restore preserves the previous local snapshot before replacing it', async () => {
  const storage = device({ 'lingonest.demo-seeded': 'true' });
  const store = await openStore(storage);
  const oldId = store.getState().addCard('local', '本地', 1);
  await waitForSave(store);
  const oldSnapshot = store.getState().exportSnapshot();
  const backupSnapshot = {
    version: 2,
    cards: [{ id: 901, word: 'backup', meaning: '备份', groupId: 1, createdAt: 123 }],
    groups: [{ id: 1, name: '默认组' }, { id: 0, name: '未分组' }],
    reviews: { 901: { stage: 2, dueAt: 3210000000000, lastReviewedAt: 1230000000000, lastResult: 'remembered', reviewCount: 2 } },
    selectedGroupId: 1,
  };

  assert.equal(await store.getState().restoreFromBackup(backupSnapshot, JSON.stringify(oldSnapshot)), 'restored');
  assert.equal(store.getState().cards[0].word, 'backup');
  assert.equal(store.getState().reviews[901].dueAt, 3210000000000);
  assert.equal(storage.snapshot().cards[0].word, 'backup');
  const recoveryKey = [...storage.data.keys()].find((key) => key.startsWith('lingonest.pre-restore.'));
  assert.ok(recoveryKey);
  assert.equal(JSON.parse(storage.data.get(recoveryKey)).cards[0].id, oldId);
  assert.equal((await store.getState().latestRecoverySnapshot()).cards[0].id, oldId);

  assert.equal(await store.getState().restoreFromBackup(
    await store.getState().latestRecoverySnapshot(),
    JSON.stringify(store.getState().exportSnapshot()),
  ), 'restored');
  assert.equal(store.getState().cards[0].word, 'local', 'the user can undo the restore');

  const reopened = await openStore(storage);
  assert.equal(reopened.getState().cards[0].word, 'local');
  assert.equal((await reopened.getState().latestRecoverySnapshot()).cards[0].word, 'backup');
});

test('invalid or stale backup data cannot overwrite local words', async () => {
  const storage = device({ 'lingonest.demo-seeded': 'true' });
  const store = await openStore(storage);
  const before = JSON.stringify(store.getState().exportSnapshot());
  const writesBefore = storage.writes.length;

  assert.equal(await store.getState().restoreFromBackup({ version: 2, cards: 'broken' }, before), 'invalid');
  store.getState().addCard('newer', '较新的', 1);
  await waitForSave(store);
  assert.equal(await store.getState().restoreFromBackup(JSON.parse(before), before), 'changed');
  assert.equal(storage.writes.length, writesBefore + 1);
  assert.equal(storage.snapshot().cards[0].word, 'newer');
});

test('failed restore write leaves the current local snapshot intact', async () => {
  const storage = device({ 'lingonest.demo-seeded': 'true' });
  const store = await openStore(storage);
  store.getState().addCard('safe', '安全的', 1);
  await waitForSave(store);
  const before = JSON.stringify(store.getState().exportSnapshot());
  storage.failNextWrite = true;

  assert.equal(await store.getState().restoreFromBackup(JSON.parse(before), before), 'save-failed');
  assert.equal(JSON.stringify(storage.snapshot()), before);
  assert.equal(store.getState().cards[0].word, 'safe');
});

test('restore failure at every device write preserves current words and survives reopening', async () => {
  for (const failAt of [1, 2, 3]) {
    const storage = device({ 'lingonest.demo-seeded': 'true' });
    const store = await openStore(storage);
    store.getState().addCard('keep', '原手机单词', 1);
    await waitForSave(store);
    const before = store.getState().exportSnapshot();
    const incoming = { ...before, cards: [{ ...before.cards[0], word: 'replacement' }] };
    const originalWrite = storage.setItem;
    let writes = 0;
    storage.setItem = async (...args) => {
      if (++writes === failAt) throw new Error('disk full');
      return originalWrite(...args);
    };
    assert.equal(await store.getState().restoreFromBackup(incoming, JSON.stringify(before)), 'save-failed');
    assert.deepEqual(storage.snapshot(), before);
    assert.deepEqual(store.getState().exportSnapshot(), before);
    const reopened = await openStore(storage);
    assert.deepEqual(reopened.getState().exportSnapshot(), before);
  }
});
