import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// Must match Supabase → Authentication → URL Configuration exactly.
// In a dev build this resolves to safar://auth/callback; under `expo start --web`
// it becomes an http://localhost URL, which is why localhost is still on the
// allowlist. NOTES.md says to take it off before production.
export const redirectTo = AuthSession.makeRedirectUri({ path: 'auth/callback' });

export type SignInResult = { ok: true } | { ok: false; reason: 'cancelled' | string };

/** Poll for a session the callback screen may be establishing in parallel. */
async function waitForSession(timeoutMs = 4000, everyMs = 250) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await supabase.auth.getSession()).data.session) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

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

  // Android hands the redirect to the app as a deep link and closes the browser,
  // so this comes back 'dismiss' even when sign-in worked — app/auth/callback.tsx
  // is finishing it on another thread. Cancelling and succeeding look identical
  // here; only the session tells them apart.
  if (result.type !== 'success') {
    return (await waitForSession()) ? { ok: true } : { ok: false, reason: 'cancelled' };
  }

  const code = new URL(result.url).searchParams.get('code');
  if (!code) {
    const err = new URL(result.url).searchParams.get('error_description');
    return { ok: false, reason: err ?? 'Google did not return a sign-in code' };
  }

  // The callback screen may already have spent this code. A PKCE code is
  // single-use, so the second attempt fails with 'invalid flow state' — which
  // means success, not failure. Check before spending it.
  if ((await supabase.auth.getSession()).data.session) return { ok: true };

  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) {
    // Lost the race rather than actually failed.
    if (await waitForSession()) return { ok: true };
    return { ok: false, reason: exchange.error.message };
  }
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
