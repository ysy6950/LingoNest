import { buildHealthUrl } from './health.ts';

export type AccountIdentity = { id: string; username: string; displayName: string; role: 'admin' | 'member' };
export type AccountSession = { address: string; serverId: string; account: AccountIdentity; token: string; expiresAt: number };
export class AccountError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'AccountError'; this.code = code; }
}

const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validSession(value: unknown): value is AccountSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as Partial<AccountSession>;
  const account = session.account;
  return typeof session.address === 'string' && !!buildHealthUrl(session.address) && uuid(session.serverId) &&
    !!account && uuid(account.id) && typeof account.username === 'string' &&
    typeof account.displayName === 'string' && ['admin', 'member'].includes(account.role ?? '') &&
    typeof session.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(session.token) &&
    typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt);
}

async function request(address: string, path: string, body?: unknown, token?: string): Promise<unknown> {
  const health = buildHealthUrl(address);
  if (!health) throw new AccountError('address', '请输入电脑的局域网 IP 和端口。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(health.replace(/\/health$/, path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (response.status === 401) throw new AccountError('auth', '用户名或密码错误，或登录已过期。');
    if (response.status === 429) throw new AccountError('rate', '尝试次数过多，请过一会儿再试。');
    if (response.status === 409) throw new AccountError('name', '用户名已被使用。');
    if (response.status === 400) {
      const details: unknown = await response.json().catch(() => null);
      const reason = details && typeof details === 'object' && 'error' in details ? details.error : null;
      if (reason === 'invalid_registration') {
        throw new AccountError('input', '注册信息不符合要求：用户名以英文字母开头，共 3～24 位，仅含字母、数字或下划线；昵称不能为空；密码至少 10 位。');
      }
      if (reason === 'invalid_invitation') {
        throw new AccountError('invitation', '邀请码不存在、已使用或已过期。请确认完整复制，并连接到生成邀请码的同一台电脑。');
      }
      if (reason === 'invalid_reset') throw new AccountError('reset', '重置凭据无效或已过期，请重新获取。');
      throw new AccountError('input', '填写的信息不符合要求，请检查后重试。');
    }
    if (!response.ok) throw new AccountError('server', '电脑暂时无法处理账号请求。');
    return await response.json();
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError(controller.signal.aborted ? 'timeout' : 'network', controller.signal.aborted ? '电脑响应超时。' : '无法连接电脑，请检查 Wi-Fi、地址和后端。');
  } finally { clearTimeout(timer); }
}

export async function requireAccountServer(address: string): Promise<void> {
  const value = await request(address, '/health') as { status?: unknown; service?: unknown; mode?: unknown };
  if (value?.status !== 'ok' || value.service !== 'lingonest-local-server' || value.mode !== 'lan-accounts') {
    throw new AccountError('mode', '电脑尚未启用 HTTPS 账号模式，请检查后端启动设置。');
  }
}

export async function loginAccount(address: string, username: string, password: string): Promise<AccountSession> {
  await requireAccountServer(address);
  const raw = await request(address, '/auth/login', { username: username.trim().toLowerCase(), password });
  const session = { ...(raw as object), address: address.trim() };
  if (!validSession(session)) throw new AccountError('invalid', '电脑返回的登录信息不完整。');
  return session;
}

export async function registerAccount(address: string, invitation: string, username: string, displayName: string, password: string): Promise<AccountSession> {
  await requireAccountServer(address);
  await request(address, '/auth/register', { invitation: invitation.trim(), username: username.trim().toLowerCase(), displayName: displayName.trim(), password });
  return loginAccount(address, username, password);
}

export async function logoutAccount(session: AccountSession): Promise<void> {
  try { await request(session.address, '/auth/logout', {}, session.token); }
  catch (error) { if (!(error instanceof AccountError && error.code === 'auth')) throw error; }
}

export async function renameAccount(session: AccountSession, displayName: string): Promise<AccountIdentity> {
  const health = buildHealthUrl(session.address);
  if (!health) throw new AccountError('address', '电脑地址无效。');
  const response = await fetch(health.replace(/\/health$/, '/auth/profile'), {
    method: 'PATCH', headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: displayName.trim() }),
  });
  if (response.status === 401) throw new AccountError('auth', '登录已过期，请重新登录。');
  if (!response.ok) throw new AccountError('server', '修改昵称失败。');
  const value = await response.json() as { account?: AccountIdentity };
  if (!value.account || value.account.id !== session.account.id) throw new AccountError('invalid', '电脑返回的账号信息不完整。');
  return value.account;
}

export async function changeAccountPassword(session: AccountSession, oldPassword: string, newPassword: string): Promise<void> {
  await request(session.address, '/auth/password', { oldPassword, newPassword }, session.token);
}

export async function resetAccountPassword(address: string, resetToken: string, password: string): Promise<void> {
  await requireAccountServer(address);
  await request(address, '/auth/reset-password', { resetToken: resetToken.trim(), password });
}

export async function createMemberInvitation(session: AccountSession): Promise<string> {
  const value = await request(session.address, '/admin/invitations', {}, session.token) as { invitation?: unknown };
  if (typeof value?.invitation !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.invitation)) {
    throw new AccountError('invalid', '电脑返回的邀请码格式无效。');
  }
  return value.invitation;
}
