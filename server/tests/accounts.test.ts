import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { openAccountStore } from '../src/accountStore.js';
import { openBackupStore } from '../src/backupStore.js';
import { createAiService } from '../src/ai.js';

const snapshot = { version: 2, cards: [], groups: [{ id: 1, name: 'Default' }], reviews: {}, selectedGroupId: 1 };
const password = 'test-account-password-2026';

test('invitations, sessions, roles and per-user backups survive restart without exposing legacy data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lingonest-accounts-'));
  const path = join(dir, 'test.sqlite');
  let legacy = openBackupStore(path);
  legacy.save(snapshot, 0);
  let accounts = openAccountStore(path);
  let server = createApp(legacy, { accountStore: accounts }).listen(0, '127.0.0.1');
  const stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    await once(server, 'listening');
    let base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (url: string, body: unknown, bearer?: string) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
    const adminInvite = accounts.createInvitation('admin');
    const register = (invitation: string, username: string, role?: string) => post('/auth/register', { invitation, username, displayName: username, password, role });
    assert.equal((await register(adminInvite, 'owner')).status, 201);
    assert.equal((await register(adminInvite, 'again')).status, 400);
    const memberInvite = accounts.createInvitation('member');
    assert.equal((await register(memberInvite, 'alice', 'admin')).status, 201);
    assert.equal((await register(memberInvite, 'another')).status, 400);
    assert.equal((await post('/auth/login', { username: 'owner', password: 'wrong-password' })).status, 401);
    const admin = await (await post('/auth/login', { username: 'owner', password })).json();
    const alice = await (await post('/auth/login', { username: 'alice', password })).json();
    assert.equal(admin.account.role, 'admin');
    assert.equal(alice.account.role, 'member');
    assert.notEqual(admin.account.id, alice.account.id);
    const header = (value: string) => ({ authorization: `Bearer ${value}` });
    assert.equal((await fetch(base + '/backup', { headers: header('a'.repeat(32)) })).status, 401);
    assert.deepEqual((await (await fetch(base + '/backup', { headers: header(admin.token) })).json()).backup, null);
    assert.deepEqual((await (await fetch(base + '/backup', { headers: header(alice.token) })).json()).backup, null);
    const put = (token: string, data: unknown, expectedRevision: number, serverId = accounts.serverId) => fetch(base + '/backup', { method: 'PUT', headers: { 'content-type': 'application/json', ...header(token) }, body: JSON.stringify({ snapshot: data, expectedRevision, expectedServerId: serverId, userId: admin.account.id }) });
    assert.equal((await put(admin.token, snapshot, 0)).status, 200);
    assert.equal((await put(alice.token, { ...snapshot, groups: [{ id: 1, name: 'Alice' }] }, 0)).status, 200);
    assert.equal((await put(alice.token, snapshot, 0)).status, 409);
    assert.equal((await put(alice.token, snapshot, 1, 'other-server')).status, 409);
    assert.equal((await (await fetch(base + '/backup', { headers: header(alice.token) })).json()).backup.snapshot.groups[0].name, 'Alice');
    assert.equal((await (await fetch(base + '/backup', { headers: header(admin.token) })).json()).backup.snapshot.groups[0].name, 'Default');
    assert.deepEqual(legacy.read()?.snapshot, snapshot);
    assert.equal((await fetch(base + '/admin/accounts', { headers: header(alice.token) })).status, 403);
    assert.equal((await fetch(base + '/admin/accounts', { headers: header(admin.token) })).status, 200);
    assert.equal((await post('/auth/logout', {}, alice.token)).status, 200);
    assert.equal((await fetch(base + '/backup', { headers: header(alice.token) })).status, 401);

    await stop(); accounts.close(); legacy.close();
    legacy = openBackupStore(path); accounts = openAccountStore(path);
    server = createApp(legacy, { accountStore: accounts }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    assert.equal((await fetch(base + '/auth/me', { headers: header(admin.token) })).status, 200);
    assert.equal((await fetch(base + '/auth/me', { headers: header(alice.token) })).status, 401);
    const reset = accounts.createReset(alice.account.id)!;
    assert.equal((await post('/auth/reset-password', { resetToken: reset, password: 'new-password-2026' })).status, 200);
    assert.equal((await post('/auth/reset-password', { resetToken: reset, password: 'another-password' })).status, 400);
    assert.equal((await post('/auth/login', { username: 'alice', password })).status, 401);
    assert.equal((await post('/auth/login', { username: 'alice', password: 'new-password-2026' })).status, 200);
    assert.equal((await post('/auth/password', { oldPassword: password, newPassword: 'owner-new-password-2026' }, admin.token)).status, 200);
    assert.equal((await fetch(base + '/auth/me', { headers: header(admin.token) })).status, 401);
    assert.equal((await post('/auth/login', { username: 'owner', password })).status, 401);
    assert.equal((await post('/auth/login', { username: 'owner', password: 'owner-new-password-2026' })).status, 200);
    assert.throws(() => accounts.createInvitation('admin'), /admin_already_exists/);
    assert.equal(accounts.claimLegacyBackup(alice.account.id, 1), false, 'existing backup cannot be overwritten');
  } finally {
    await stop(); accounts.close(); legacy.close(); rmSync(dir, { recursive: true, force: true });
  }
});

test('AI cache and usage are scoped while concurrency remains global', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lingonest-account-ai-'));
  const accounts = openAccountStore(join(dir, 'test.sqlite'));
  let calls = 0;
  const ai = createAiService({ baseUrl: 'https://example.com/v1', apiKey: 'test-key', model: 'test', timeoutMs: 1000 }, 'configured', async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ definition: 'learn', chineseHint: '学习', examples: ['I learn.', 'We learn.', 'They learn.'] }) } }] });
  });
  const server = createApp(undefined, { accountStore: accounts, aiService: ai }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const register = async (name: string, role: 'admin' | 'member') => {
      const invitation = accounts.createInvitation(role);
      await fetch(base + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invitation, username: name, displayName: name, password }) });
      const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password }) });
      return (await response.json()).token as string;
    };
    const owner = await register('owner', 'admin');
    const alice = await register('alice', 'member');
    const analyze = (token: string) => fetch(base + '/ai/word-analysis', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ word: 'learn' }) });
    assert.equal((await analyze(owner)).status, 200);
    assert.equal((await analyze(owner)).status, 200);
    assert.equal((await analyze(alice)).status, 200);
    assert.equal(calls, 2);
    const usage = await (await fetch(base + '/ai/usage', { headers: { authorization: `Bearer ${alice}` } })).json();
    assert.equal(usage.tasks.analysis.requests, 1);
    assert.equal(usage.tasks.analysis.cacheHits, 0);
    assert.equal((await fetch(base + '/ai/cache', { method: 'DELETE', headers: { authorization: `Bearer ${alice}` } })).status, 403);
    assert.equal((await analyze('a'.repeat(43))).status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve())); accounts.close(); rmSync(dir, { recursive: true, force: true });
  }
});

test('local owner explicitly copies one legacy revision to a new admin without modifying the source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lingonest-legacy-claim-'));
  const path = join(dir, 'test.sqlite');
  const legacy = openBackupStore(path);
  const accounts = openAccountStore(path);
  try {
    assert.equal(legacy.save(snapshot, 0)?.revision, 1);
    const invitation = accounts.createInvitation('admin');
    const owner = await accounts.register({ invitation, username: 'owner', displayName: 'Owner', password });
    assert.ok(owner);
    assert.equal(accounts.claimLegacyBackup(owner.id, 0), false);
    assert.equal(accounts.claimLegacyBackup(owner.id, 1), true);
    assert.equal(accounts.claimLegacyBackup(owner.id, 1), false);
    assert.deepEqual(accounts.readBackup(owner.id)?.snapshot, snapshot);
    assert.deepEqual(legacy.read()?.snapshot, snapshot);
    assert.equal(accounts.createReset('other'), null);
  } finally {
    accounts.close(); legacy.close(); rmSync(dir, { recursive: true, force: true });
  }
});
