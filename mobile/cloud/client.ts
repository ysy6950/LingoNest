import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Expo only exposes EXPO_PUBLIC_ values. This key identifies the public
// project; user isolation comes from Auth and database policies, not secrecy.
export const cloudConfigured = Boolean(url && publishableKey && Platform.OS !== 'web');

const secureSessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const cloudClient = cloudConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    })
  : null;

if (cloudClient) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') cloudClient.auth.startAutoRefresh();
    else cloudClient.auth.stopAutoRefresh();
  });
}
