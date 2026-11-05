import express from 'express';
import type { AccountStore, Account } from './accountStore.js';
import { validDisplayName, validPassword, validUsername } from './accountStore.js';

const isPrivateTransport = (request: express.Request) => request.secure || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '');
const bearer = (request: express.Request) => /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.get('authorization') ?? '')?.[1] ?? null;

export function mountAccountRoutes(app: express.Express, store: AccountStore) {
  const attempts = new Map<string, { count: number; until: number }>();
  const limit = (key: string, maximum = 8) => {
    const now = Date.now();
    const prior = attempts.get(key);
    if (!prior || prior.until <= now) { attempts.set(key, { count: 1, until: now + 15 * 60_000 }); return false; }
    prior.count++;
    return prior.count > maximum;
  };
  const clear = (key: string) => attempts.delete(key);

  app.use((request, response, next) => {
    if (isPrivateTransport(request)) { next(); return; }
    response.status(426).json({ error: 'https_required' });
  });

  app.post('/auth/register', async (request, response) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || !validUsername(body.username) || !validPassword(body.password) || !validDisplayName(body.displayName) || typeof body.invitation !== 'string' || body.invitation.length !== 43) {
      response.status(400).json({ error: 'invalid_registration' }); return;
    }
    const key = `register:${request.ip ?? ''}`;
    if (limit(key)) { response.status(429).json({ error: 'too_many_attempts' }); return; }
    try {
      const account = await store.register({ invitation: body.invitation, username: body.username, displayName: body.displayName, password: body.password });
      if (!account) { response.status(400).json({ error: 'invalid_invitation' }); return; }
      clear(key);
      response.status(201).json({ account, serverId: store.serverId });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') { response.status(409).json({ error: 'username_taken' }); return; }
      throw error;
    }
  });

  app.post('/auth/login', async (request, response) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || !validUsername(body.username) || typeof body.password !== 'string' || body.password.length > 128) { response.status(400).json({ error: 'invalid_login' }); return; }
    const ipKey = `login-ip:${request.ip ?? ''}`;
    const key = `login:${request.ip ?? ''}:${body.username}`;
    if (limit(ipKey, 20) || limit(key)) { response.status(429).json({ error: 'too_many_attempts' }); return; }
    const session = await store.login(body.username, body.password);
    if (!session) { response.status(401).json({ error: 'invalid_credentials' }); return; }
    clear(key); clear(ipKey);
    response.set('Cache-Control', 'no-store').json({ ...session, serverId: store.serverId });
  });

  app.post('/auth/reset-password', async (request, response) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body.resetToken !== 'string' || body.resetToken.length !== 43 || !validPassword(body.password)) { response.status(400).json({ error: 'invalid_reset' }); return; }
    const key = `reset:${request.ip ?? ''}`;
    if (limit(key)) { response.status(429).json({ error: 'too_many_attempts' }); return; }
    if (!await store.resetPassword(body.resetToken, body.password)) { response.status(400).json({ error: 'invalid_reset' }); return; }
    clear(key);
    response.json({ status: 'ok' });
  });

  app.use(['/auth/me', '/auth/logout', '/auth/password', '/auth/profile', '/admin', '/backup', '/ai', '/dictionary'], (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const value = bearer(request);
    const account = value ? store.session(value) : null;
    if (!account) { response.status(401).json({ error: 'unauthorized' }); return; }
    response.locals.account = account;
    response.locals.sessionToken = value;
    next();
  });

  app.get('/auth/me', (_request, response) => response.set('Cache-Control', 'no-store').json({ account: response.locals.account as Account, serverId: store.serverId }));
  app.post('/auth/logout', (_request, response) => { store.revoke(response.locals.sessionToken as string); response.json({ status: 'ok' }); });
  app.post('/auth/password', async (request, response) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body.oldPassword !== 'string' || !validPassword(body.newPassword)) { response.status(400).json({ error: 'invalid_password' }); return; }
    if (!await store.changePassword((response.locals.account as Account).id, body.oldPassword, body.newPassword)) { response.status(401).json({ error: 'invalid_credentials' }); return; }
    response.json({ status: 'ok' });
  });
  app.patch('/auth/profile', (request, response) => {
    const name = (request.body as { displayName?: unknown } | undefined)?.displayName;
    if (!validDisplayName(name)) { response.status(400).json({ error: 'invalid_display_name' }); return; }
    response.json({ account: store.rename((response.locals.account as Account).id, name) });
  });
  app.use('/admin', (_request, response, next) => {
    if ((response.locals.account as Account).role !== 'admin') { response.status(403).json({ error: 'forbidden' }); return; }
    next();
  });
  app.get('/admin/accounts', (_request, response) => response.json({ accounts: store.listAccounts() }));
  app.post('/admin/invitations', (_request, response) => {
    response.set('Cache-Control', 'no-store').status(201).json({ invitation: store.createInvitation('member') });
  });
  app.post('/admin/accounts/:id/reset', (request, response) => {
    const resetToken = store.createReset(request.params.id as string);
    if (!resetToken) { response.status(404).json({ error: 'not_found' }); return; }
    response.set('Cache-Control', 'no-store').json({ resetToken });
  });
}
