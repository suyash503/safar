import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// Must match Supabase → Authentication → URL Configuration exactly.
// In a dev build this resolves to safar://auth/callback; under `expo start --web`
// it becomes an http://localhost URL, which is why localhost is still on the
// allowlist. NOTES.md says to take it off before production.
export const redirectTo = AuthSession.makeRedirectUri({ path: 'auth/callback' });

export type SignInResult = { ok: true } | { ok: false; reason: 'cancelled' | string };

/**
 * Two taps, no password. Opens Google in the system browser, waits for the
 * deep link back, and exchanges the code for a session.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true, // we open it ourselves so we can await the result
    },
  });
  if (error) return { ok: false, reason: error.message };
  if (!data?.url) return { ok: false, reason: 'Google sign-in is not configured' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { ok: false, reason: 'cancelled' };

  const code = new URL(result.url).searchParams.get('code');
  if (!code) {
    // PKCE is the flow we asked for; anything else means the URL config drifted.
    const err = new URL(result.url).searchParams.get('error_description');
    return { ok: false, reason: err ?? 'Google did not return a sign-in code' };
  }

  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) return { ok: false, reason: exchange.error.message };
  return { ok: true };
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Dismisses the auth browser tab if the app is resumed while it's still open.
export function warmUpBrowser() {
  WebBrowser.warmUpAsync();
  return () => {
    WebBrowser.coolDownAsync();
  };
}
