import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { buildHealthUrl } from '../localServer/health.ts';

export type ComputerConnection = { address: string; token: string; authMode?: 'account' };
const ADDRESS_KEY = 'lingonest.computer-address';
let hydration: Promise<void> | undefined;
let edits = 0;
let saves = Promise.resolve();

type ConnectionState = Omit<ComputerConnection, 'authMode'> & {
  authMode: 'pairing' | 'account';
  identity: string;
  paired: boolean;
  addressSaved: boolean;
  hydrate: () => Promise<void>;
  setAddress: (address: string) => void;
  setToken: (token: string) => void;
  disconnect: () => void;
  setAccount: (address: string, token: string, identity: string) => void;
  setGuest: () => void;
};

export const useComputerConnection = create<ConnectionState>((set) => ({
  address: '', token: '', paired: false, addressSaved: true, authMode: 'pairing', identity: 'guest',
  hydrate: () => {
    if (!hydration) {
      const revision = edits;
      hydration = AsyncStorage.getItem(ADDRESS_KEY).then((stored) => {
        const address = stored?.replace(/^http:\/\//, 'https://');
        if (edits === revision && address && buildHealthUrl(address)) set({ address });
      }).catch(() => { set({ addressSaved: false }); });
    }
    return hydration;
  },
  setAddress: (address) => { if (useComputerConnection.getState().authMode === 'account') return; edits += 1; set({ address, paired: false }); },
  setToken: (token) => { if (useComputerConnection.getState().authMode === 'account') return; edits += 1; set({ token, paired: false }); },
  disconnect: () => { edits += 1; set({ token: '', paired: false }); },
  setAccount: (address, token, identity) => { edits += 1; set({ address, token, paired: !!token, authMode: 'account', identity }); },
  setGuest: () => { edits += 1; set({ token: '', paired: false, authMode: 'pairing', identity: 'guest' }); },
}));

// Capture one connection per operation; an old response cannot confirm a new pairing.
export async function withComputerConnection<T>(operation: (connection: ComputerConnection) => Promise<T>): Promise<T> {
  const { address, token, authMode, identity } = useComputerConnection.getState();
  const revision = edits;
  const matches = () => {
    const current = useComputerConnection.getState();
    return edits === revision && current.address === address && current.token === token && current.authMode === authMode && current.identity === identity;
  };
  try {
    const result = await operation({ address, token, ...(authMode === 'account' ? { authMode } : {}) });
    if (!matches()) throw new Error('电脑连接已更改，请重新操作。');
    useComputerConnection.setState({ paired: true });
    // Persist only the address. The pairing code never goes into device storage or backups.
    saves = saves.then(() => AsyncStorage.setItem(ADDRESS_KEY, address.trim()))
      .then(() => { if (matches()) useComputerConnection.setState({ addressSaved: true }); })
      .catch(() => { if (matches()) useComputerConnection.setState({ addressSaved: false }); });
    return result;
  } catch (error) {
    if (matches() && authMode === 'pairing' && error instanceof Error && 'code' in error && error.code === 'auth') {
      useComputerConnection.getState().disconnect();
    } else if (matches() && authMode === 'account' && error instanceof Error && 'code' in error && error.code === 'auth') {
      useComputerConnection.setState({ token: '', paired: false });
    }
    throw error;
  }
}
