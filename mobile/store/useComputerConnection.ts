import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { buildHealthUrl } from '../localServer/health.ts';

export type ComputerConnection = { address: string; token: string };
const ADDRESS_KEY = 'lingonest.computer-address';
let hydration: Promise<void> | undefined;
let edits = 0;
let saves = Promise.resolve();

type ConnectionState = ComputerConnection & {
  paired: boolean;
  addressSaved: boolean;
  hydrate: () => Promise<void>;
  setAddress: (address: string) => void;
  setToken: (token: string) => void;
  disconnect: () => void;
};

export const useComputerConnection = create<ConnectionState>((set) => ({
  address: '', token: '', paired: false, addressSaved: true,
  hydrate: () => {
    if (!hydration) {
      const revision = edits;
      hydration = AsyncStorage.getItem(ADDRESS_KEY).then((address) => {
        if (edits === revision && address && buildHealthUrl(address)) set({ address });
      }).catch(() => { set({ addressSaved: false }); });
    }
    return hydration;
  },
  setAddress: (address) => { edits += 1; set({ address, paired: false }); },
  setToken: (token) => { edits += 1; set({ token, paired: false }); },
  disconnect: () => { edits += 1; set({ token: '', paired: false }); },
}));

// Capture one connection per operation; an old response cannot confirm a new pairing.
export async function withComputerConnection<T>(operation: (connection: ComputerConnection) => Promise<T>): Promise<T> {
  const { address, token } = useComputerConnection.getState();
  const matches = () => {
    const current = useComputerConnection.getState();
    return current.address === address && current.token === token;
  };
  try {
    const result = await operation({ address, token });
    if (!matches()) throw new Error('电脑连接已更改，请重新操作。');
    useComputerConnection.setState({ paired: true });
    // Persist only the address. The pairing code never goes into device storage or backups.
    saves = saves.then(() => AsyncStorage.setItem(ADDRESS_KEY, address.trim()))
      .then(() => { if (matches()) useComputerConnection.setState({ addressSaved: true }); })
      .catch(() => { if (matches()) useComputerConnection.setState({ addressSaved: false }); });
    return result;
  } catch (error) {
    if (matches() && error instanceof Error && 'code' in error && error.code === 'auth') {
      useComputerConnection.getState().disconnect();
    }
    throw error;
  }
}
