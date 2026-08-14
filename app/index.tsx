import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { signInWithGoogle, warmUpBrowser } from '../lib/auth';
import { colour, space } from '../lib/theme';

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(warmUpBrowser, []);

  async function onPress() {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    // Cancelling is a normal thing to do, not a failure worth a red message.
    if (!result.ok && result.reason !== 'cancelled') setError(result.reason);
    setBusy(false);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.wordmark}>SAFAR</Text>
        <Text style={styles.line}>
          The train is long. Some of the people on it are going where you are going.
        </Text>
      </View>

      <View>
        <Pressable style={styles.button} onPress={onPress} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colour.oxford} />
          ) : (
            <Text style={styles.buttonText}>Continue with Google</Text>
          )}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.small}>No password. Nobody sees your number.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colour.oxford,
    padding: space.lg,
    paddingBottom: space.xl,
    justifyContent: 'space-between',
  },
  top: { flex: 1, justifyContent: 'center' },
  // Jangkuy is caps-only and expanded — set uppercase deliberately. The face
  // isn't loaded yet, so this is the system fallback until it is.
  wordmark: {
    color: colour.moonlight,
    fontSize: 44,
    letterSpacing: 8,
    fontWeight: '700',
    marginBottom: space.md,
  },
  line: { color: colour.frost, fontSize: 17, lineHeight: 25, maxWidth: 320 },
  button: {
    backgroundColor: colour.moonlight,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colour.oxford, fontSize: 16, fontWeight: '600' },
  error: { color: colour.danger, marginTop: space.md, textAlign: 'center' },
  small: { color: colour.steel, fontSize: 13, textAlign: 'center', marginTop: space.md },
});
