import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SessionProvider, useSession } from '../lib/session';
import { startOutboxPump } from '../lib/outbox';
import { colour } from '../lib/theme';

function Gate({ fontsReady }: { fontsReady: boolean }) {
  const { session, loading: sessionLoading } = useSession();
  // Hold the first paint until the display face is in. A wordmark that appears
  // in the system font and then jumps to Jangkuy looks like a bug.
  const loading = sessionLoading || !fontsReady;
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onSignIn = pathname === '/';
    // The callback screen finishes the sign-in itself; bouncing it back to the
    // sign-in screen mid-exchange would drop the session on the floor.
    const inAuthFlow = pathname.startsWith('/auth');
    if (!session && !onSignIn && !inAuthFlow) router.replace('/');
    if (session && (onSignIn || inAuthFlow)) router.replace('/onboard');
  }, [session, loading, pathname]);

  // The navigator is rendered from the very first frame, always. It used to be
  // swapped out for a spinner while the session loaded, which meant that on a
  // cold start there was no router yet — and a cold start is exactly how the app
  // comes back when the OS killed it during sign-in. The safar://auth/callback
  // deep link arrived with nowhere to go and was dropped, taking a perfectly good
  // one-time code with it. That is the four-attempts-to-sign-in bug.
  //
  // The spinner is now painted over the top instead, so waiting never costs us
  // the incoming link.
  return (
    <View style={{ flex: 1, backgroundColor: colour.oxford }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colour.oxford },
          animation: 'fade',
        }}
      />
      {loading ? (
        <View style={styles.cover}>
          <ActivityIndicator color={colour.frost} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colour.oxford,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function RootLayout() {
  // Bold Expanded is the one in use. Black Expanded is kept in fonts/ but not
  // loaded — every face bundled costs install size on a phone that may be
  // downloading this over a patchy connection.
  const [fontsReady, fontError] = useFonts({
    Jangkuy: require('../fonts/JANGKUY-BoldExpanded.otf'),
  });

  // Runs for the life of the app, not just while a chat is open — a message
  // written in a tunnel should send itself whether or not you are looking at it.
  useEffect(startOutboxPump, []);

  return (
    <SessionProvider>
      <StatusBar style="light" />
      {/* If the font fails to load, ship the app in the fallback rather than
          hanging on a splash screen forever. */}
      <Gate fontsReady={fontsReady || !!fontError} />
    </SessionProvider>
  );
}
