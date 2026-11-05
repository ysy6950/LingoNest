import assert from 'node:assert/strict';
import test from 'node:test';
import { loginAccount, registerAccount, requireAccountServer, validSession, createMemberInvitation } from '../localServer/account.ts';
import { requestWordAnalysis } from '../localServer/ai.ts';

const address = '192.168.1.20:3001';
const serverId = '11111111-1111-4111-8111-111111111111';
const account = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', username: 'alice', displayName: 'Alice', role: 'member' };
const token = 'A'.repeat(43);
const reply = (value, status = 200) => Response.json(value, { status });

test('account client uses LAN HTTPS, validates server identity, and never sends password to health', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/health')) return reply({ status: 'ok', service: 'lingonest-local-server', mode: 'lan-accounts' });
    return reply({ serverId, account, token, expiresAt: Date.now() + 30000 });
  };
  const session = await loginAccount(address, 'ALICE', 'secret-password');
  assert.equal(session.account.id, account.id);
  assert.ok(requests.every(({ url }) => url.startsWith('https://192.168.1.20:3001/')));
  assert.equal(requests[0].options.body, undefined);
  assert.equal(JSON.parse(requests[1].options.body).username, 'alice');
  assert.equal(JSON.parse(requests[1].options.body).password, 'secret-password');
  assert.equal(validSession({ ...session, token: 'bad' }), false);
});

test('register needs account mode and consumes invitation before login', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const paths = [];
  globalThis.fetch = async (url) => {
    paths.push(url);
    if (url.endsWith('/health')) return reply({ status: 'ok', service: 'lingonest-local-server', mode: 'lan-accounts' });
    if (url.endsWith('/auth/register')) return reply({ serverId, account }, 201);
    return reply({ serverId, account, token, expiresAt: Date.now() + 30000 });
  };
  await registerAccount(address, 'x'.repeat(43), 'alice', 'Alice', 'secret-password');
  assert.deepEqual(paths.map((path) => path.split('/').at(-1)), ['health', 'register', 'health', 'login']);
  globalThis.fetch = async () => reply({ status: 'ok', service: 'lingonest-local-server', mode: 'lan-backup' });
  await assert.rejects(requireAccountServer(address), { code: 'mode' });
});

test('registration explains separately whether form details or invitation failed', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let reason = 'invalid_registration';
  globalThis.fetch = async (url) => url.endsWith('/health')
    ? reply({ status: 'ok', service: 'lingonest-local-server', mode: 'lan-accounts' })
    : reply({ error: reason }, 400);
  await assert.rejects(registerAccount(address, 'x'.repeat(43), 'alice', 'Alice', 'secret-password'),
    (error) => error.code === 'input' && /用户名/.test(error.message));
  reason = 'invalid_invitation';
  await assert.rejects(registerAccount(address, 'x'.repeat(43), 'alice', 'Alice', 'secret-password'),
    (error) => error.code === 'invitation' && /邀请码不存在/.test(error.message));
});

test('member invitation requires a valid authorized response', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.authorization, `Bearer ${token}`);
    return reply({ invitation: 'B'.repeat(43) }, 201);
  };
  assert.equal(await createMemberInvitation({ address, serverId, account, token, expiresAt: Date.now() + 30000 }), 'B'.repeat(43));
});

test('account session token can call AI while old pairing token validation remains separate', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.authorization, `Bearer ${token}`);
    return reply({ definition: 'to gain knowledge', chineseHint: '学习', examples: ['I learn.', 'We learn.', 'They learn.'] });
  };
  const note = await requestWordAnalysis({ address, token, authMode: 'account' }, 'learn');
  assert.equal(note.examples.length, 3);
  await assert.rejects(requestWordAnalysis({ address, token }, 'learn'), { code: 'auth' });
});
