import { useEffect } from 'react';
import { Stack, router, useGlobalSearchParams, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../providers/session';
import { State, Toast } from '../ui/kit';
import { usePalette } from '../ui/theme';
import { NotificationBridge } from '../providers/notifications';
import { PrivacyLock } from '../providers/privacy-lock';
void SplashScreen.preventAutoHideAsync();
function Navigation() {
  const session = useSession(); const segments = useSegments(); const colors = usePalette();
  const params = useGlobalSearchParams<{ token?: string; invite?: string }>();
  const candidate = segments[0] === 'invite' ? params.token : params.invite;
  const invitation = typeof candidate === 'string' && /^[A-Za-z0-9_-]{16,160}$/.test(candidate) ? candidate : undefined;
  const atAuth = segments[0] === 'auth';
  useEffect(() => {
    if (session.loading) return;
    if (!session.user || !session.profile) { if (!atAuth) router.replace({ pathname: '/auth', params: invitation ? { invite: invitation } : {} }); }
    else if (atAuth) router.replace(invitation ? { pathname: '/invite/[token]', params: { token: invitation } } : '/');
  }, [session.loading, session.user, session.profile, atAuth, invitation]);
  if (session.loading) return <State loading title="Abrindo seu espaço" detail="Restaurando sua sessão e a fila local." />;
  return <><StatusBar style={colors.background === '#111714' ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }} /><NotificationBridge /><PrivacyLock /><Toast /></>;
}
export default function Layout() {
  const [loaded, error] = useFonts({ SpaceGrotesk_600SemiBold, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });
  useEffect(() => { if (loaded || error) void SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;
  return <SafeAreaProvider><SessionProvider><Navigation /></SessionProvider></SafeAreaProvider>;
}
