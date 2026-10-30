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
      return JSON.parse(data.get('lingonest.v3') ?? data.get('lingonest.v2'));
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

test('confirmed related words reuse v3 storage and review; duplicate and stale confirmations do not write', async () => {
  const storage = device();
  const store = await openStore(storage);
  const source = store.getState().cards[0];
  const group = store.getState().addGroup('拓展词汇');
  const add = (word = 'keep calm', meaning = '保持镇静') => store.getState().addRecommendedCard(source.id, source.word, source.meaning, word, meaning, group);
  const count = store.getState().cards.length;
  const id = add();
  assert.equal(typeof id, 'number');
  assert.equal(add(' KEEP   CALM '), null);
  assert.equal(add(source.word), null);
  assert.equal(add('quiet', ''), null);
  assert.equal(store.getState().cards.length, count + 1);
  assert.equal(store.getState().reviews[id].reviewCount, 0);
  await waitForSave(store);
  const reopened = await openStore(storage);
  assert.equal(reopened.getState().cards.find((card) => card.id === id).groupId, group);
  assert.equal(reopened.getState().exportSnapshot().version, 3);
  assert.equal(reopened.getState().exportSnapshot().cards.some((card) => card.id === id), true);
  reopened.getState().editCard(source.id, source.word, 'changed sense');
  assert.equal(reopened.getState().addRecommendedCard(source.id, source.word, source.meaning, 'quiet', '安静', group), null);
  reopened.getState().deleteCard(source.id);
  assert.equal(reopened.getState().addRecommendedCard(source.id, source.word, source.meaning, 'quiet', '安静', group), null);
  await waitForSave(reopened);
});

test('legacy cards, groups, and known/unknown answers migrate into a recoverable v3 snapshot', async () => {
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
  assert.equal(saved.version, 3);
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
  assert.equal(storage.writes.filter((write) => write.key === 'lingonest.v3').length, 1);
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
    cards: [{ id: 901, word: 'backup', meaning: '备份', groupId: 1, createdAt: 123,
      aiNote: { definition: 'a saved copy', chineseHint: '备份', example: 'I made a backup.' } }],
    groups: [{ id: 1, name: '默认组' }, { id: 0, name: '未分组' }],
    reviews: { 901: { stage: 2, dueAt: 3210000000000, lastReviewedAt: 1230000000000, lastResult: 'remembered', reviewCount: 2 } },
    selectedGroupId: 1,
  };

  assert.equal(await store.getState().restoreFromBackup(backupSnapshot, JSON.stringify(oldSnapshot)), 'restored');
  assert.equal(store.getState().cards[0].word, 'backup');
  assert.deepEqual(store.getState().cards[0].aiNote.examples, ['I made a backup.']);
  assert.equal(store.getState().reviews[901].dueAt, 3210000000000);
  assert.equal(storage.snapshot().cards[0].word, 'backup');
  assert.equal(storage.snapshot().cards[0].aiNote.chineseHint, '备份');
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

test('AI note only saves after confirmation and never replaces the original meaning', async () => {
  const storage = device({ 'lingonest.demo-seeded': 'true' });
  const store = await openStore(storage);
  const cardId = store.getState().addCard('learn', '我自己写的解释', 1);
  await waitForSave(store);
  const writesBefore = storage.writes.length;
  const note = { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn every day.', 'We learn at school.', 'You can learn from mistakes.'] };

  assert.equal(store.getState().cards[0].aiNote, undefined, 'receiving a preview has no store side effect');
  assert.equal(storage.writes.length, writesBefore);
  assert.equal(store.getState().saveAiNote(cardId, 'wrong word', '我自己写的解释', note), false);
  assert.equal(storage.writes.length, writesBefore);
  assert.equal(store.getState().saveAiNote(cardId, 'learn', '我自己写的解释', note), true);
  await waitForSave(store);
  assert.equal(store.getState().cards[0].meaning, '我自己写的解释');
  assert.deepEqual(storage.snapshot().cards[0].aiNote, note);
  assert.deepEqual(store.getState().exportSnapshot().cards[0].aiNote, note);

  const reopened = await openStore(storage);
  assert.equal(reopened.getState().cards[0].meaning, '我自己写的解释');
  assert.deepEqual(reopened.getState().cards[0].aiNote, note);
  assert.equal(reopened.getState().saveAiNote(cardId, 'learn', '我自己写的解释', { ...note, examples: [''] }), false);
  assert.equal(reopened.getState().saveAiNote(cardId, 'learn', '我自己写的解释', { ...note, examples: ['I learn.', 'I learn.'] }), false);
  assert.equal(reopened.getState().saveAiNote(cardId, 'learn', '我自己写的解释', { ...note, examples: ['I learn.'] }), true, 'user can keep one example');
  assert.deepEqual(reopened.getState().cards[0].aiNote.examples, ['I learn.']);
  reopened.getState().editCard(cardId, 'learn', '新的词义');
  assert.equal(reopened.getState().cards[0].aiNote, undefined, 'changing meaning invalidates the old AI note');
  assert.equal(reopened.getState().saveAiNote(cardId, 'learn', '我自己写的解释', note), false);
  reopened.getState().editCard(cardId, 'learned', '我自己写的解释');
  assert.equal(reopened.getState().cards[0].aiNote, undefined, 'changing the word invalidates its old AI note');
  await waitForSave(reopened);
});

test('saved AI notes can be edited locally without changing the word or review progress', async () => {
  const storage = device({ 'lingonest.demo-seeded': 'true' });
  const store = await openStore(storage);
  const cardId = store.getState().addCard('learn', '自己的解释', 1);
  const original = { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn every day.'] };
  assert.equal(store.getState().saveAiNote(cardId, 'learn', '自己的解释', original), true);
  await waitForSave(store);
  const before = store.getState().exportSnapshot();
  const writesBefore = storage.writes.length;
  const savedNote = store.getState().cards[0].aiNote;
  const draft = { ...savedNote, examples: [...savedNote.examples] };
  draft.definition = 'to gain knowledge or a skill';
  draft.chineseHint = '学习、学会';
  draft.examples[0] = 'We learn to cook together.';
  draft.examples.push('She learns a new word every morning.');

  assert.deepEqual(store.getState().exportSnapshot(), before, 'editing a draft or discarding it does not mutate saved data');
  assert.equal(storage.writes.length, writesBefore);
  assert.equal(store.getState().saveAiNote(cardId, 'learn', '自己的解释', { ...draft, definition: '' }), false);
  assert.equal(store.getState().saveAiNote(cardId, 'learn', '自己的解释', { ...draft, examples: ['', ''] }), false);
  assert.equal(store.getState().saveAiNote(cardId, 'learn', '自己的解释', { ...draft, examples: ['Same.', 'same.'] }), false);
  assert.deepEqual(store.getState().exportSnapshot(), before, 'invalid edits preserve the previous note');
  assert.equal(storage.writes.length, writesBefore);

  assert.equal(store.getState().saveAiNote(cardId, 'learn', '自己的解释', draft), true);
  await waitForSave(store);
  const reopened = await openStore(storage);
  const after = reopened.getState().exportSnapshot();
  assert.deepEqual(after.cards[0], { ...before.cards[0], aiNote: draft });
  assert.deepEqual(after.reviews, before.reviews);
  assert.deepEqual(after.groups, before.groups);
  assert.deepEqual(after.cards[0].aiNote.examples, draft.examples);
});

test('a saved single-example AI note remains readable after upgrading', async () => {
  const legacyNote = { definition: 'calm and peaceful', chineseHint: '宁静的', example: 'The lake was serene.' };
  const snapshot = {
    version: 2,
    cards: [{ id: 42, word: 'serene', meaning: '宁静', groupId: 1, createdAt: 100, aiNote: legacyNote }],
    groups: [{ id: 1, name: '默认组' }, { id: 0, name: '未分组' }],
    reviews: { 42: { stage: 0, dueAt: 0, lastReviewedAt: null, lastResult: null, reviewCount: 0 } },
    selectedGroupId: 1,
  };
  const storage = device({ 'lingonest.v2': JSON.stringify(snapshot) });
  const store = await openStore(storage);
  assert.equal(store.getState().isHydrated, true);
  assert.deepEqual(store.getState().cards[0].aiNote, { definition: legacyNote.definition, chineseHint: legacyNote.chineseHint, examples: [legacyNote.example] });
  assert.deepEqual(store.getState().exportSnapshot().cards[0].aiNote.examples, [legacyNote.example]);
  assert.equal(JSON.parse(storage.data.get('lingonest.v2')).cards[0].aiNote.example, legacyNote.example, 'reading alone does not overwrite old data');
  assert.equal(storage.snapshot().version, 3);
  assert.deepEqual(storage.snapshot().reviews[42], snapshot.reviews[42]);
  assert.deepEqual(storage.snapshot().groups, snapshot.groups);
});

test('v2 migration leaves the old copy intact if writing v3 fails', async () => {
  const old = { version: 2, cards: [{ id: 42, word: 'learn', meaning: '学习', groupId: 1, createdAt: 100 }],
    groups: [{ id: 1, name: '默认组' }, { id: 0, name: '未分组' }],
    reviews: { 42: { stage: 2, dueAt: 1792800000000, lastReviewedAt: 1792700000000, lastResult: 'remembered', reviewCount: 2 } }, selectedGroupId: 1 };
  const storage = device({ 'lingonest.v2': JSON.stringify(old) });
  storage.failNextWrite = true;
  const failed = await openStore(storage);
  assert.equal(failed.getState().isHydrated, false);
  assert.equal(storage.data.has('lingonest.v3'), false);
  assert.deepEqual(JSON.parse(storage.data.get('lingonest.v2')), old);
  const retried = await openStore(storage);
  assert.equal(retried.getState().isHydrated, true);
  assert.deepEqual(storage.snapshot().reviews[42], old.reviews[42]);
});

test('pronunciation saves locally, survives reopening, and clears only when the word changes', async () => {
  const storage = device({ 'lingonest.demo-seeded': 'true' });
  const store = await openStore(storage);
  const cardId = store.getState().addCard('learn', '学习', 1);
  const result = { ipa: 'ˈlɜːrn', partOfSpeech: 'verb', audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/l/learn0001.mp3', audioAccent: 'us', source: 'merriam-webster-learners', fetchedAt: 100 };
  await waitForSave(store);
  const writesBefore = storage.writes.length;
  assert.equal(store.getState().savePronunciation(cardId, 'other', result), false);
  assert.equal(store.getState().savePronunciation(cardId, 'learn', { ...result, ipa: undefined }), false);
  assert.equal(storage.writes.length, writesBefore);
  assert.equal(store.getState().savePronunciation(cardId, 'learn', result), true);
  await waitForSave(store);
  const reopened = await openStore(storage);
  assert.deepEqual(reopened.getState().cards[0].pronunciation, result);
  assert.equal(reopened.getState().editCard(cardId, 'learn', '获取知识'), true);
  assert.deepEqual(reopened.getState().cards[0].pronunciation, result);
  assert.equal(reopened.getState().editCard(cardId, 'learned', '学会了'), true);
  assert.equal(reopened.getState().cards[0].pronunciation, undefined);
  await waitForSave(reopened);
  assert.equal(storage.snapshot().cards[0].pronunciation, undefined);
});

test('saved flat audio URLs repair on reopen and backup restore without losing learning data', async () => {
  const legacy = { version: 3, cards: [{ id: 42, word: 'learn', meaning: '学习', groupId: 1, createdAt: 100,
    pronunciation: { ipa: 'x', audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/learn0001.mp3', audioAccent: 'us' } }],
    groups: [{ id: 1, name: '默认组' }, { id: 0, name: '未分组' }],
    reviews: { 42: { stage: 2, dueAt: 1_792_800_000_000, lastReviewedAt: 1_792_700_000_000, lastResult: 'remembered', reviewCount: 2 } }, selectedGroupId: 1 };
  const storage = device({ 'lingonest.v3': JSON.stringify(legacy) });
  const store = await openStore(storage);
  assert.equal(store.getState().isHydrated, true);
  const repaired = store.getState().exportSnapshot();
  assert.equal(repaired.cards[0].pronunciation.audioUrl, 'https://media.merriam-webster.com/audio/prons/en/us/mp3/l/learn0001.mp3');
  assert.deepEqual(repaired.reviews, legacy.reviews);
  assert.deepEqual(repaired.groups, legacy.groups);
  const outcome = await store.getState().restoreFromBackup(legacy, JSON.stringify(repaired));
  assert.equal(outcome, 'restored');
  assert.equal(storage.snapshot().cards[0].pronunciation.audioUrl, repaired.cards[0].pronunciation.audioUrl);
});
