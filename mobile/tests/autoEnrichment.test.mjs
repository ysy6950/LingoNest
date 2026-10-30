import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'enrichment-test:storage', shortCircuit: true };
    if (specifier === '../reviewScheduler') return nextResolve('../reviewScheduler.ts', context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'enrichment-test:storage') return {
      format: 'module', shortCircuit: true,
      source: `export default {
        getItem: (...args) => globalThis.__enrichmentStorage.getItem(...args),
        setItem: (...args) => globalThis.__enrichmentStorage.setItem(...args),
      };`,
    };
    return nextLoad(url, context);
  },
});

const { createEnrichmentStore } = await import('../store/useAutoEnrichment.ts');
const { startAutoEnrichment } = await import('../autoEnrichment.ts');
const empty = { version: 3, cards: [], groups: [{ id: 1, name: '默认组' }, { id: 0, name: '未分组' }], reviews: {}, selectedGroupId: 1 };
const note = { definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn English.', 'We learn by doing.', 'She wants to learn.'] };
const pronunciation = { ipa: 'lɜːrn', partOfSpeech: 'verb', source: 'merriam-webster-learners', fetchedAt: 100,
  audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/l/learn001.mp3', audioAccent: 'us' };
let sequence = 0;
function storageDevice() {
  const data = new Map([['lingonest.v3', JSON.stringify(empty)]]);
  return { data, failKey: null,
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { if (this.failKey === key) throw new Error('disk full'); data.set(key, value); },
  };
}
async function until(predicate) {
  for (let i = 0; i < 500; i++) { if (predicate()) return; await new Promise(setImmediate); }
  assert.fail('Timed out waiting for enrichment');
}
async function fixture(options = {}) {
  const storage = options.storage ?? storageDevice();
  globalThis.__enrichmentStorage = storage;
  const { useLingoStore: lingo } = await import(`../store/useLingoStore.ts?enrichment=${++sequence}`);
  const { useComputerConnection: connection } = await import(`../store/useComputerConnection.ts?enrichment=${sequence}`);
  const queue = createEnrichmentStore();
  await lingo.getState().hydrate(); await queue.getState().hydrate();
  if (options.paired !== false) connection.setState({ address: '192.168.1.20:3001', token: 'a'.repeat(32), paired: true });
  const calls = [];
  const runner = startAutoEnrichment({ lingo, queue, connection,
    dictionary: async (...args) => { calls.push(['dictionary', args[1]]); return options.dictionary ? options.dictionary(...args) : pronunciation; },
    analyze: async (...args) => { calls.push(['ai', args[1], args[2]]); return options.analyze ? options.analyze(...args) : note; },
  });
  const add = (word = 'learn', meaning = '学习') => lingo.getState().addCard(word, meaning, 1);
  const card = (id) => lingo.getState().cards.find((item) => item.id === id);
  const enable = (...kinds) => { for (const kind of kinds) queue.getState().setEnabled(kind, true); };
  const idle = async () => { await until(() => !queue.getState().jobs.length); await queue.getState().waitForSave(); await lingo.getState().waitForSave(); };
  return { storage, lingo, queue, connection, calls, runner, add, card, enable, idle };
}

test('defaults off, saves first, enriches only future words and serializes dictionary then AI', async (t) => {
  const f = await fixture(); t.after(() => f.runner.stop());
  const old = f.add('old', '旧的'); await f.lingo.getState().waitForSave();
  assert.deepEqual(f.calls, []);
  f.enable('dictionary', 'ai');
  const id = f.add();
  assert.equal(f.card(id).meaning, '学习'); assert.equal(f.card(id).aiNote, undefined);
  await f.idle();
  assert.deepEqual(f.calls, [['dictionary', 'learn'], ['ai', 'learn', '学习']]);
  assert.equal(f.card(old).aiNote, undefined);
  assert.deepEqual(f.card(id).aiNote, note); assert.equal(f.card(id).pronunciation.ipa, pronunciation.ipa);
  assert.equal(f.lingo.getState().reviews[id].reviewCount, 0);
  assert.equal(JSON.parse(f.storage.data.get('lingonest.v3')).cards.find((item) => item.id === id).aiNote.examples.length, 3);
});

test('confirmed related words reuse the queue without any recursive recommendation calls', async (t) => {
  const f = await fixture(); t.after(() => f.runner.stop());
  const source = f.add('serene', '宁静'); await f.lingo.getState().waitForSave(); f.enable('ai');
  const id = f.lingo.getState().addRecommendedCard(source, 'serene', '宁静', 'peaceful', '平静', 0);
  assert.notEqual(id, null); await f.idle();
  assert.deepEqual(f.calls, [['ai', 'peaceful', '平静']]);
  assert.equal(f.card(id).groupId, 0); assert.equal(f.lingo.getState().cards.length, 2);
});

test('unpaired jobs and preferences survive restart without storing credentials or auto-enriching restored words', async (t) => {
  const f = await fixture({ paired: false }); f.enable('dictionary', 'ai');
  const id = f.add(); await f.lingo.getState().waitForSave(); await f.queue.getState().waitForSave();
  assert.deepEqual(f.calls, []); assert.equal(f.queue.getState().jobs.length, 1); f.runner.stop();
  const reopened = await fixture({ storage: f.storage, paired: false }); t.after(() => reopened.runner.stop());
  assert.equal(reopened.queue.getState().enabled.ai, true); assert.deepEqual(reopened.calls, []);
  reopened.connection.setState({ address: '192.168.1.20:3001', token: 'b'.repeat(32), paired: true });
  await reopened.idle(); assert.deepEqual(reopened.card(id).aiNote, note);
  assert.equal([...f.storage.data.values()].join('').includes('b'.repeat(32)), false);
  assert.equal(reopened.lingo.getState().exportSnapshot().version, 3);
  assert.equal('jobs' in reopened.lingo.getState().exportSnapshot(), false);
});

test('a failed dictionary request preserves successful AI; explicit retry requests only the failed part', async (t) => {
  let fail = true;
  const f = await fixture({ dictionary: async () => { if (fail) throw Object.assign(new Error('secret provider body'), { code: 'not_found' }); return pronunciation; } });
  t.after(() => f.runner.stop()); f.enable('dictionary', 'ai'); const id = f.add();
  await until(() => !!f.card(id).aiNote && f.queue.getState().jobs[0]?.dictionary?.status === 'failed');
  assert.equal(f.card(id).pronunciation, undefined);
  assert.equal(JSON.stringify(f.queue.getState().jobs).includes('secret provider body'), false);
  assert.deepEqual(f.calls.map((call) => call[0]), ['dictionary', 'ai']);
  fail = false; f.queue.getState().retry(id); await f.idle();
  assert.deepEqual(f.calls.map((call) => call[0]), ['dictionary', 'ai', 'dictionary']);
});

for (const action of ['edit', 'delete', 'restore', 'disable', 'cancel']) test(`late results cannot write after ${action}`, async (t) => {
  let finish;
  const f = await fixture({ analyze: () => new Promise((resolve) => { finish = resolve; }) });
  t.after(() => f.runner.stop()); f.enable('ai'); const id = f.add();
  await until(() => !!finish);
  if (action === 'edit') f.lingo.getState().editCard(id, 'learn', '了解');
  if (action === 'delete') f.lingo.getState().deleteCard(id);
  if (action === 'restore') {
    const snapshot = f.lingo.getState().exportSnapshot();
    assert.equal(await f.lingo.getState().restoreFromBackup(snapshot, JSON.stringify(snapshot)), 'restored');
  }
  if (action === 'disable') f.queue.getState().setEnabled('ai', false);
  if (action === 'cancel') f.queue.getState().remove(id);
  finish(note); await new Promise(setImmediate); await f.idle();
  assert.equal(f.card(id)?.aiNote, undefined); assert.equal(f.calls.length, 1);
});

test('manual AI edits win over an in-flight generated note, and deletion stays deleted after reopening', async (t) => {
  let finish;
  const f = await fixture({ analyze: () => new Promise((resolve) => { finish = resolve; }) });
  t.after(() => f.runner.stop()); f.enable('ai'); const id = f.add(); await until(() => !!finish);
  const manual = { ...note, definition: 'my own explanation' };
  assert.equal(f.lingo.getState().saveAiNote(id, 'learn', '学习', manual), true);
  finish(note); await f.idle(); assert.equal(f.card(id).aiNote.definition, manual.definition);
  f.lingo.getState().removeAiNote(id); await f.lingo.getState().waitForSave();
  assert.equal(f.card(id).aiNote, undefined);
  assert.equal(JSON.parse(f.storage.data.get('lingonest.v3')).cards[0].aiNote, undefined);
});

test('explicit old-word enrichment merges missing dictionary fields and preserves existing IPA and AI notes', async (t) => {
  const f = await fixture(); t.after(() => f.runner.stop()); const id = f.add();
  f.lingo.getState().savePronunciation(id, 'learn', { ipa: 'my-ipa', partOfSpeech: 'my-pos' });
  f.lingo.getState().saveAiNote(id, 'learn', '学习', { ...note, definition: 'manual' });
  await f.lingo.getState().waitForSave();
  f.queue.getState().enqueue(f.card(id), ['dictionary', 'ai'], false); await f.idle();
  assert.deepEqual(f.calls, [['dictionary', 'learn']]);
  assert.equal(f.card(id).pronunciation.ipa, 'my-ipa'); assert.equal(f.card(id).pronunciation.partOfSpeech, 'my-pos');
  assert.equal(f.card(id).pronunciation.audioUrl, pronunciation.audioUrl); assert.equal(f.card(id).aiNote.definition, 'manual');
});

test('pausing the app discards a late response and resumes the persisted task when active', async (t) => {
  let finish; let count = 0;
  const f = await fixture({ analyze: () => ++count === 1 ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(note) });
  t.after(() => f.runner.stop()); f.enable('ai'); const id = f.add(); await until(() => !!finish);
  f.runner.setActive(false); finish(note); await new Promise(setImmediate);
  assert.equal(f.card(id).aiNote, undefined); assert.equal(f.queue.getState().jobs[0].ai.status, 'pending');
  f.runner.setActive(true); await f.idle(); assert.equal(f.card(id).aiNote.definition, note.definition); assert.equal(count, 2);
});

test('local word write failure prevents API calls until the actual vocabulary save succeeds', async (t) => {
  const f = await fixture(); t.after(() => f.runner.stop()); f.enable('ai'); await f.queue.getState().waitForSave();
  f.storage.failKey = 'lingonest.v3'; const id = f.add();
  await until(() => !!f.lingo.getState().error); assert.deepEqual(f.calls, []);
  f.storage.failKey = null; assert.equal(await f.lingo.getState().retrySave(), true); await f.idle();
  assert.deepEqual(f.card(id).aiNote, note);
});

test('queue write failure pauses API calls, allows adding words, and resumes after settings save retry', async (t) => {
  const f = await fixture(); t.after(() => f.runner.stop()); f.enable('ai'); await f.queue.getState().waitForSave();
  f.storage.failKey = 'lingonest.auto-enrichment.v1'; const id = f.add();
  await until(() => !!f.queue.getState().error); await f.lingo.getState().waitForSave();
  assert.deepEqual(f.calls, []); assert.equal(JSON.parse(f.storage.data.get('lingonest.v3')).cards[0].id, id);
  f.storage.failKey = null; await f.queue.getState().retrySave(); await f.idle(); assert.deepEqual(f.card(id).aiNote, note);
});

test('corrupt preferences are not overwritten, and a persisted running task is recovered as pending', async (t) => {
  const storage = storageDevice(); globalThis.__enrichmentStorage = storage;
  storage.data.set('lingonest.auto-enrichment.v1', '{bad-json');
  const broken = createEnrichmentStore(); await broken.getState().hydrate(); broken.getState().setEnabled('ai', true);
  assert.equal(broken.getState().isHydrated, false); assert.equal(storage.data.get('lingonest.auto-enrichment.v1'), '{bad-json');
  storage.data.delete('lingonest.auto-enrichment.v1'); const f = await fixture({ storage, paired: false }); t.after(() => f.runner.stop());
  f.enable('ai'); const id = f.add(); await f.queue.getState().waitForSave();
  const saved = JSON.parse(storage.data.get('lingonest.auto-enrichment.v1')); saved.jobs[0].ai.status = 'running';
  storage.data.set('lingonest.auto-enrichment.v1', JSON.stringify(saved));
  const recovered = createEnrichmentStore(); await recovered.getState().hydrate();
  assert.equal(recovered.getState().jobs[0].cardId, id); assert.equal(recovered.getState().jobs[0].ai.status, 'pending');
});
