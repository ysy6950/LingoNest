import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const data = new Map();
let secret = null;
let failKey = null;
let failReadKey = null;
const storage = {
  async getItem(key) { if (key === failReadKey) throw new Error('storage unavailable'); return data.get(key) ?? null; },
  async setItem(key, value) { if (key === failKey) throw new Error('storage unavailable'); data.set(key, value); },
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'account-session-test:storage', shortCircuit: true };
    if (specifier === 'expo-secure-store') return { url: 'account-session-test:secure', shortCircuit: true };
    if (specifier === 'react-native') return { url: 'account-session-test:platform', shortCircuit: true };
    if (specifier === '../reviewScheduler') return nextResolve('../reviewScheduler.ts', context);
    if (context.parentURL?.endsWith('/localServer/backup.ts')) {
      if (specifier === './health') return nextResolve('./health.ts', context);
      if (specifier === './snapshot') return nextResolve('./snapshot.ts', context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'account-session-test:storage') return { format: 'module', shortCircuit: true, source: 'export default globalThis.__accountStorage;' };
    if (url === 'account-session-test:secure') return { format: 'module', shortCircuit: true, source: `
      export const isAvailableAsync = async () => true;
      export const getItemAsync = async () => globalThis.__accountSecure.read();
      export const setItemAsync = async (_key, value) => globalThis.__accountSecure.write(value);
      export const deleteItemAsync = async () => globalThis.__accountSecure.remove();
    ` };
    if (url === 'account-session-test:platform') return { format: 'module', shortCircuit: true, source: "export const Platform = { OS: 'android' };" };
    return nextLoad(url, context);
  },
});
globalThis.__accountStorage = storage;
globalThis.__accountSecure = { read: () => secret, write: (value) => { secret = value; }, remove: () => { secret = null; } };
const { useLingoStore } = await import('../store/useLingoStore.ts');
const { useAutoEnrichment } = await import('../store/useAutoEnrichment.ts');
const { useAccountSession } = await import('../store/useAccountSession.ts');
const { useComputerConnection } = await import('../store/useComputerConnection.ts');
const serverId = '11111111-1111-4111-8111-111111111111';
const account = (id, username) => ({ address: '192.168.1.20:3001', serverId,
  account: { id, username, displayName: username, role: 'member' }, token: (username === 'alice' ? 'A' : 'B').repeat(43), expiresAt: Date.now() + 100000 });

test('account coordinator preserves guest/A/B data, stores token only in SecureStore, and refuses unsaved switching', async (t) => {
  let obscuredDuringSwitch = false;
  const unsubscribe = useAccountSession.subscribe((state) => { if (!state.ready) obscuredDuringSwitch = true; });
  t.after(unsubscribe);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ status: 'ok' });
  await useAccountSession.getState().hydrate();
  assert.equal(useAccountSession.getState().ready, true);
  useLingoStore.getState().addCard('guestword', '游客', 1);
  await useLingoStore.getState().waitForSave();
  const a = account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice');
  const b = account('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob');
  await useAccountSession.getState().activate(a);
  assert.equal(obscuredDuringSwitch, true);
  assert.equal(useLingoStore.getState().cards.length, 0);
  assert.equal(useComputerConnection.getState().authMode, 'account');
  useLingoStore.getState().addCard('aliceword', '甲', 1);
  await useLingoStore.getState().waitForSave();
  failKey = `lingonest.account.${serverId}.${a.account.id}.v3`;
  useLingoStore.getState().addCard('pending', '未保存', 1);
  assert.equal(await useLingoStore.getState().waitForSave(), false);
  await assert.rejects(useAccountSession.getState().activate(b), /尚未保存/);
  assert.equal(useAccountSession.getState().active.account.username, 'alice');
  failKey = null;
  assert.equal(await useLingoStore.getState().retrySave(), true);
  await useAccountSession.getState().activate(b);
  assert.equal(useLingoStore.getState().cards.length, 0);
  useLingoStore.getState().addCard('bobword', '乙', 1);
  await useLingoStore.getState().waitForSave();
  await useAccountSession.getState().activate(a);
  assert.deepEqual(useLingoStore.getState().cards.map((card) => card.word), ['aliceword', 'pending']);
  assert.equal(JSON.parse(secret).account.username, 'alice');
  assert.ok([...data.values()].every((value) => !String(value).includes(a.token) && !String(value).includes(b.token)));
  await useAccountSession.getState().logout();
  assert.equal(useAccountSession.getState().active, null);
  assert.equal(secret, null);
  assert.equal(useLingoStore.getState().cards[0].word, 'guestword');
  assert.equal(useAutoEnrichment.getState().isHydrated, true);
});

test('logout keeps the active account when guest storage cannot be read', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; failReadKey = null; });
  globalThis.fetch = async () => Response.json({ status: 'ok' });
  const a = account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice');
  await useAccountSession.getState().activate(a);
  failReadKey = 'lingonest.v3';
  await assert.rejects(useAccountSession.getState().logout(), /无法读取目标词库/);
  assert.equal(useAccountSession.getState().active.account.username, 'alice');
  assert.equal(useLingoStore.getState().cards[0].word, 'aliceword');
  assert.equal(useAccountSession.getState().ready, true);
  assert.equal(useComputerConnection.getState().paired, false);
  failReadKey = null;
  await useAccountSession.getState().clearRevoked();
  assert.equal(useAccountSession.getState().active, null);
  assert.equal(secret, null);
  assert.equal(useLingoStore.getState().cards[0].word, 'guestword');
});
