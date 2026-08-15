import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SessionProvider, useSession } from '../lib/session';
import { colour } from '../lib/theme';

function Gate() {
  const { session, loading } = useSession();
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
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Gate />
    </SessionProvider>
  );
}
