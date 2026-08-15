import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill them in from Supabase → Settings → API.',
  );
}

// The session is a bearer token for the whole account, so it goes in the keystore
// rather than AsyncStorage. SecureStore rejects values over 2048 bytes, and a
// Google session carries name and photo URL in the JWT, so it can get close —
// hence the split. Chunk count lives at the base key; chunks at key.0, key.1, …
const CHUNK = 1800;

const secureStorage = {
  async getItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(key));
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    await this.removeItem(key);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(key, String(parts.length));
  },
  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(key));
    await Promise.all(
      Array.from({ length: count || 0 }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)),
    );
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === 'web' ? AsyncStorage : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to parse in a native app — the deep link is handled by hand in
    // lib/auth.ts so we control what happens when the browser hands back.
    detectSessionInUrl: false,
    // Not the default. Without this supabase-js uses the implicit flow, which
    // returns tokens in the URL fragment — a fragment never survives the trip
    // back through a deep link, so the app sees a callback with nothing in it.
    // PKCE returns ?code=, which is what auth.ts and the callback screen read.
    flowType: 'pkce',
  },
});
