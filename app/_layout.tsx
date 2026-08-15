import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import { SessionProvider, useSession } from '../lib/session';
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colour.oxford, justifyContent: 'center' }}>
        <ActivityIndicator color={colour.frost} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colour.oxford },
        animation: 'fade',
      }}
    />
  );
}

export default function RootLayout() {
  // Bold Expanded is the one in use. Black Expanded is kept in fonts/ but not
  // loaded — every face bundled costs install size on a phone that may be
  // downloading this over a patchy connection.
  const [fontsReady, fontError] = useFonts({
    Jangkuy: require('../fonts/JANGKUY-BoldExpanded.otf'),
  });

  return (
    <SessionProvider>
      <StatusBar style="light" />
      {/* If the font fails to load, ship the app in the fallback rather than
          hanging on a splash screen forever. */}
      <Gate fontsReady={fontsReady || !!fontError} />
    </SessionProvider>
  );
}
