import { useEffect } from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRuntime, notify } from '../store/runtime';
import { useSession } from './session';
import { usePalette } from '../ui/theme';
import { Button, Kite, Title } from '../ui/kit';
export function PrivacyLock() {
  const { user } = useSession(); const enabled = useRuntime((state) => state.biometric); const locked = useRuntime((state) => state.locked); const colors = usePalette();
  useEffect(() => {
    if (!enabled || !user) return;
    useRuntime.getState().set({ locked: true });
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') useRuntime.getState().set({ locked: true }); });
    return () => subscription.remove();
  }, [enabled, user]);
  if (!enabled || !locked || !user) return null;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 25, padding: 30 }]}><Kite size={100} /><Title>Seu espaço está protegido.</Title><Button label="Desbloquear" onPress={async () => { const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Abrir o Morrow', cancelLabel: 'Cancelar', disableDeviceFallback: false }); if (result.success) useRuntime.getState().set({ locked: false }); else notify('Tente desbloquear novamente.'); }} /></View>;
}
