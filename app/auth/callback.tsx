import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { colour, space } from '../../lib/theme';

/**
 * Where Google drops you back — safar://auth/callback, the URL registered in
 * Supabase. Usually openAuthSessionAsync in lib/auth.ts has already captured the
 * code and set the session by the time we get here, but Android also delivers
 * the deep link to the app, so this screen has to exist and be able to finish
 * the job on its own.
 */
export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (params.error_description) {
        setMessage(String(params.error_description));
        setTimeout(() => router.replace('/'), 2500);
        return;
      }

      // The signInWithGoogle path may already have exchanged the code.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        router.replace('/onboard');
        return;
      }

      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(String(params.code));
        if (cancelled) return;
        if (!error) {
          router.replace('/onboard');
          return;
        }
        setMessage(error.message);
      } else {
        setMessage('Sign-in did not complete.');
      }
      setTimeout(() => router.replace('/'), 2500);
    })();

    return () => {
      cancelled = true;
    };
  }, [params.code, params.error_description]);

  return (
    <View style={styles.screen}>
      {message ? (
        <Text style={styles.error}>{message}</Text>
      ) : (
        <>
          <ActivityIndicator color={colour.frost} />
          <Text style={styles.text}>Signing you in…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colour.oxford,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.md,
  },
  text: { color: colour.frost, fontSize: 15 },
  error: { color: colour.danger, fontSize: 15, textAlign: 'center' },
});
