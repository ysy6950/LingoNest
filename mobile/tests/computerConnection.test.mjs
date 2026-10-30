import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'connection-test:storage', shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'connection-test:storage') return {
      format: 'module', shortCircuit: true,
      source: `export default {
        getItem: (...args) => globalThis.__connectionStorage.getItem(...args),
        setItem: (...args) => globalThis.__connectionStorage.setItem(...args),
      };`,
    };
    return nextLoad(url, context);
  },
});

let sequence = 0;
async function open(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); },
  };
  globalThis.__connectionStorage = storage;
  const module = await import(`../store/useComputerConnection.ts?session=${++sequence}`);
  await module.useComputerConnection.getState().hydrate();
  return { ...module, data, storage };
}

test('one pairing serves several operations and persists only the computer address', async () => {
  const { useComputerConnection: store, withComputerConnection: request, data } = await open();
  store.getState().setAddress('192.168.1.20:3001');
  store.getState().setToken('a'.repeat(32));
  const seen = [];
  for (const operation of ['dictionary', 'ai', 'backup']) {
    assert.equal(await request(async (connection) => { seen.push(connection); return operation; }), operation);
  }
  await new Promise(setImmediate);
  assert.equal(store.getState().paired, true);
  assert.deepEqual(seen[0], seen[2]);
  assert.deepEqual([...data], [['lingonest.computer-address', '192.168.1.20:3001']]);
  const reopened = await open(Object.fromEntries(data));
  assert.equal(reopened.useComputerConnection.getState().address, '192.168.1.20:3001');
  assert.equal(reopened.useComputerConnection.getState().token, '');
  assert.equal(reopened.useComputerConnection.getState().paired, false);
});

test('expired pairing clears the code while a network failure keeps the reusable connection', async () => {
  const { useComputerConnection: store, withComputerConnection: request } = await open();
  store.setState({ address: '192.168.1.20:3001', token: 'a'.repeat(32), paired: true });
  await assert.rejects(request(async () => { throw Object.assign(new Error('offline'), { code: 'network' }); }));
  assert.equal(store.getState().paired, true);
  await assert.rejects(request(async () => { throw Object.assign(new Error('expired'), { code: 'auth' }); }));
  assert.equal(store.getState().paired, false);
  assert.equal(store.getState().token, '');
  assert.equal(store.getState().address, '192.168.1.20:3001');
});

test('an old successful or unauthorized response cannot replace a newer connection', async () => {
  const { useComputerConnection: store, withComputerConnection: request, data } = await open();
  store.setState({ address: '192.168.1.20:3001', token: 'a'.repeat(32) });
  let finish;
  const pending = request(() => new Promise((resolve) => { finish = resolve; }));
  store.getState().setAddress('192.168.1.21:3001');
  store.getState().setToken('b'.repeat(32));
  finish('old result');
  await assert.rejects(pending, /连接已更改/);
  assert.equal(store.getState().paired, false);
  assert.equal(data.size, 0);
  let fail;
  const rejected = request(() => new Promise((_, reject) => { fail = reject; }));
  store.getState().setToken('c'.repeat(32));
  fail(Object.assign(new Error('expired'), { code: 'auth' }));
  await assert.rejects(rejected);
  assert.equal(store.getState().token, 'c'.repeat(32));
});

test('storage failure leaves the current operation and paired connection usable', async () => {
  const { useComputerConnection: store, withComputerConnection: request, storage } = await open();
  store.setState({ address: '192.168.1.20:3001', token: 'a'.repeat(32) });
  storage.setItem = async () => { throw new Error('disk unavailable'); };
  assert.equal(await request(async () => 'done'), 'done');
  await new Promise(setImmediate);
  assert.equal(store.getState().paired, true);
  assert.equal(store.getState().addressSaved, false);
});

test('delayed saved address cannot overwrite an address the user is already editing', async () => {
  let resolveRead;
  globalThis.__connectionStorage = {
    getItem: () => new Promise((resolve) => { resolveRead = resolve; }),
    setItem: async () => {},
  };
  const { useComputerConnection: store } = await import(`../store/useComputerConnection.ts?session=${++sequence}`);
  const hydration = store.getState().hydrate();
  store.getState().setAddress('192.168.1.21:3001');
  resolveRead('192.168.1.20:3001');
  await hydration;
  assert.equal(store.getState().address, '192.168.1.21:3001');
});
