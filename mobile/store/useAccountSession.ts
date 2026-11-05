import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { accountNamespace, useLingoStore } from './useLingoStore.ts';
import { useAutoEnrichment } from './useAutoEnrichment.ts';
import { useComputerConnection } from './useComputerConnection.ts';
import { validSession, logoutAccount, type AccountSession } from '../localServer/account.ts';
import { readComputerBackup } from '../localServer/backup.ts';
import { withComputerConnection } from './useComputerConnection.ts';

const SESSION_KEY = 'lingonest.active-account.v1';
let hydration: Promise<void> | null = null;
let transitioning = false;
let volatileSession: string | null = null;
async function requireSecureStore() {
  if (!await SecureStore.isAvailableAsync()) throw new Error('本机安全存储不可用，账号登录已暂停。游客词库仍保留。');
}
const readSession = async () => {
  if (Platform.OS === 'web') return volatileSession;
  if (!await SecureStore.isAvailableAsync()) return null;
  return SecureStore.getItemAsync(SESSION_KEY);
};
const writeSession = async (value: string) => {
  if (Platform.OS === 'web') { volatileSession = value; return; }
  await requireSecureStore();
  await SecureStore.setItemAsync(SESSION_KEY, value);
};
const removeSession = async () => {
  if (Platform.OS === 'web') { volatileSession = null; return; }
  await requireSecureStore();
  await SecureStore.deleteItemAsync(SESSION_KEY);
};

type AccountState = {
  ready: boolean;
  active: AccountSession | null;
  error: string | null;
  hydrate: () => Promise<void>;
  activate: (session: AccountSession) => Promise<void>;
  logout: () => Promise<void>;
  clearRevoked: () => Promise<void>;
  copyGuest: () => Promise<void>;
};

async function localReady() {
  await useLingoStore.getState().hydrate();
  await useAutoEnrichment.getState().hydrate();
  if (!useLingoStore.getState().isHydrated || !useAutoEnrichment.getState().isHydrated) throw new Error('无法读取本地词库或补全待办，账号未切换。');
}
async function localSaved() {
  if (!await useLingoStore.getState().waitForSave() || !await useAutoEnrichment.getState().waitForSave()) {
    throw new Error('本地资料尚未保存成功，请先重试保存。');
  }
}
async function changeNamespace(namespace: string, previous: string) {
  if (!await useLingoStore.getState().activateNamespace(namespace)) throw new Error('无法读取目标词库，账号未切换。');
  if (!await useAutoEnrichment.getState().activateNamespace(namespace)) {
    await useLingoStore.getState().activateNamespace(previous);
    throw new Error('无法读取目标补全待办，账号未切换。');
  }
}
const scopeOf = (session: AccountSession | null) => session ? accountNamespace(session.serverId, session.account.id) : 'guest';

export const useAccountSession = create<AccountState>((set, get) => ({
  ready: false, active: null, error: null,
  hydrate: () => {
    if (get().ready) return Promise.resolve();
    if (hydration) return hydration;
    hydration = (async () => {
      try {
        await localReady();
        const raw = await readSession();
        if (raw !== null) {
          const session: unknown = JSON.parse(raw);
          if (!validSession(session)) throw new Error('本机登录信息损坏，尚未切换词库。');
          const namespace = scopeOf(session);
          await changeNamespace(namespace, 'guest');
          const usable = session.expiresAt > Date.now() ? session.token : '';
          useComputerConnection.getState().setAccount(session.address, usable, namespace);
          set({ active: session, ready: true, error: null });
        } else set({ active: null, ready: true, error: null });
      } catch (cause) {
        set({ ready: false, error: cause instanceof Error ? cause.message : '无法读取本机登录信息。' });
      } finally { hydration = null; }
    })();
    return hydration;
  },
  activate: async (session) => {
    if (!validSession(session)) throw new Error('登录信息无效。');
    if (transitioning) throw new Error('正在切换账号，请稍后。');
    transitioning = true;
    set({ ready: false });
    const previous = get().active;
    const previousScope = scopeOf(previous);
    const nextScope = scopeOf(session);
    const connection = useComputerConnection.getState();
    const oldConnection = { address: connection.address, token: connection.token, identity: connection.identity, authMode: connection.authMode, paired: connection.paired };
    let savedSession: string | null = null;
    let wroteSession = false;
    try {
      await localReady(); await localSaved();
      savedSession = await readSession();
      await writeSession(JSON.stringify(session));
      wroteSession = true;
      useComputerConnection.getState().disconnect();
      await changeNamespace(nextScope, previousScope);
      useComputerConnection.getState().setAccount(session.address, session.token, nextScope);
      set({ active: session, ready: true, error: null });
    } catch (error) {
      try {
        if (wroteSession) {
          if (savedSession === null) await removeSession();
          else await writeSession(savedSession);
        }
        useComputerConnection.setState(oldConnection);
        set({ ready: true });
      } catch {
        set({ error: '账号切换回退失败，请重启应用并重试读取。' });
      }
      throw error;
    } finally { transitioning = false; }
  },
  logout: async () => {
    const session = get().active;
    if (!session) return;
    if (transitioning) throw new Error('正在切换账号，请稍后。');
    transitioning = true;
    set({ ready: false });
    const connection = useComputerConnection.getState();
    const oldConnection = { address: connection.address, token: connection.token, identity: connection.identity, authMode: connection.authMode, paired: connection.paired };
    let revoked = false;
    try {
      await localSaved();
      // A failed network logout leaves the session active, so the server token is not silently left usable.
      await logoutAccount(session);
      revoked = true;
      useComputerConnection.getState().disconnect();
      await changeNamespace('guest', scopeOf(session));
      try {
        await removeSession();
      } catch (error) {
        await changeNamespace(scopeOf(session), 'guest');
        throw error;
      }
      useComputerConnection.getState().setGuest();
      set({ active: null, ready: true, error: null });
    } catch (error) {
      useComputerConnection.setState(revoked ? { ...oldConnection, token: '', paired: false } : oldConnection);
      set({ ready: true });
      throw error;
    } finally { transitioning = false; }
  },
  // The server revokes all sessions after a password change, so only local
  // session cleanup is possible with the old token.
  clearRevoked: async () => {
    const session = get().active;
    if (!session) return;
    if (transitioning) throw new Error('正在切换账号，请稍后。');
    transitioning = true;
    set({ ready: false });
    try {
      await localSaved();
      useComputerConnection.getState().disconnect();
      await changeNamespace('guest', scopeOf(session));
      await removeSession();
      useComputerConnection.getState().setGuest();
      set({ active: null, ready: true, error: null });
    } catch (error) {
      set({ error: '密码已修改，但本机账号切换未完成。请重启应用后重新登录。' });
      throw error;
    } finally { transitioning = false; }
  },
  copyGuest: async () => {
    const session = get().active;
    if (!session || !useComputerConnection.getState().paired) throw new Error('请先登录并连接电脑。');
    const scope = scopeOf(session);
    if (useComputerConnection.getState().identity !== scope) throw new Error('账号已切换，请重试。');
    await localSaved();
    const remote = await withComputerConnection(readComputerBackup);
    if (remote.serverId !== session.serverId || remote.backup) throw new Error('目标账号在电脑上已有备份，暂不能复制游客资料。');
    if (get().active !== session || !await useLingoStore.getState().copyGuestToCurrent()) {
      throw new Error('目标词库已有资料、游客词库为空，或本机保存失败。原游客资料未删除。');
    }
  },
}));
