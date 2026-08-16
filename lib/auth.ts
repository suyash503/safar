import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

// Google's *web* client id, not the Android one. Native sign-in asks Google for an
// ID token minted for this audience, which is the audience Supabase verifies.
// The Android client still has to exist, matched by package name and SHA-1 — it is
// what authorises this app to ask at all.
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

let configured = false;
function configure() {
  if (configured || !webClientId) return;
  GoogleSignin.configure({ webClientId });
  configured = true;
}

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
 * Two taps, no password.
 *
 * Native first: the account picker appears inside the app, so Safar is never
 * backgrounded and the OS never gets a window in which to kill it. That window is
 * what made sign-in take four attempts on a Redmi Note 12 — the browser trip means
 * handing control to Chrome on a phone that is short of memory. There is also no
 * PKCE here, which sidesteps the `plain` code challenge this runtime falls back to
 * for want of WebCrypto.
 *
 * The browser flow stays as a fallback. It works, it is proven, and it covers the
 * case where Play Services is missing or the Android client is not configured.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  const native = await signInNatively();
  if (native !== 'unavailable') return native;
  return signInThroughBrowser();
}

async function signInNatively(retrying = false): Promise<SignInResult | 'unavailable'> {
  if (!webClientId) {
    console.log('[auth] no EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — using the browser');
    return 'unavailable';
  }
  configure();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    const response = await GoogleSignin.signIn();

    const idToken =
      response.type === 'success' ? response.data.idToken : null;
    if (response.type === 'cancelled') return { ok: false, reason: 'cancelled' };
    // No token and not a cancellation means Google is not set up for this build —
    // fall through to the browser rather than dead-ending the user.
    if (!idToken) {
      console.log('[auth] native returned no id token — using the browser');
      return 'unavailable';
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: 'cancelled' };
      if (e.code === statusCodes.IN_PROGRESS) return { ok: false, reason: 'cancelled' };
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'unavailable';
      // DEVELOPER_ERROR (code 10) means the package and SHA-1 are not registered
      // with a Google client. Falling back silently would hide the one thing worth
      // knowing, so say it out loud.
      console.log('[auth] native google sign-in failed:', e.code, e.message);

      // INTERNAL_ERROR (code 8) is Google's catch-all, and it shows up reliably
      // when picking a different account after a sign-out — cached credential
      // state rather than anything wrong with the account. Clearing that state and
      // asking once more is cheaper for the user than being thrown into a browser.
      if (!retrying && String(e.code) === '8') {
        try {
          await GoogleSignin.signOut();
        } catch {
          // Nothing cached to clear.
        }
        return signInNatively(true);
      }
    } else {
      console.log('[auth] native google sign-in threw:', String(e));
    }
    return 'unavailable';
  }
}

async function signInThroughBrowser(): Promise<SignInResult> {
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
  // Sign out of Google too, or the next sign-in silently reuses the same account
  // and the picker never appears — which on a shared phone is a privacy problem,
  // not a convenience.
  try {
    configure();
    await GoogleSignin.signOut();
  } catch {
    // Never signed in natively; nothing to undo.
  }
  await supabase.auth.signOut();
}

// Dismisses the auth browser tab if the app is resumed while it's still open.
export function warmUpBrowser() {
  WebBrowser.warmUpAsync();
  return () => {
    WebBrowser.coolDownAsync();
  };
}
