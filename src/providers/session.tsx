import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import * as Network from 'expo-network';
import { onDisconnect, onValue, ref, set, serverTimestamp } from 'firebase/database';
import { z } from 'zod';
import { deviceSchema, profileSchema, type Profile } from '../../shared/contracts';
import { auth, realtime } from '../services/firebase';
import { api, friendlyError, RequestError } from '../services/api';
import { identityFor, clearIdentityCache } from '../services/device-identity';
import { activateOutbox, syncOutbox } from '../services/outbox';
import { readJournal, writeJournal } from '../services/journal';
import { useRuntime } from '../store/runtime';

type Session = { user: User | null; profile: Profile | null; loading: boolean; error: string | null; refresh: () => Promise<void>; logout: () => Promise<void> };
const context = createContext<Session | null>(null);
export function useSession(): Session { const value = useContext(context); if (!value) throw new Error('SessionProvider ausente.'); return value; }
export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const account = auth.currentUser;
    if (!account) { setProfile(null); return; }
    try {
      const storedAppearance = await readJournal(account.uid, 'appearance');
      if (storedAppearance) useRuntime.getState().set(z.object({ theme: z.enum(['dark', 'light']), biometric: z.boolean() }).parse(JSON.parse(storedAppearance)));
      const next = await api('/users/me', profileSchema);
      if (auth.currentUser?.uid !== account.uid) return;
      await writeJournal(account.uid, 'profile', JSON.stringify(next));
      setProfile(next); setError(null);
      const identity = await identityFor(account.uid);
      await api('/users/me/devices', deviceSchema, { method: 'POST', body: { id: identity.deviceId, publicKey: identity.publicKey,
        token: null, platform: Platform.OS, label: `${Platform.OS} · ${identity.deviceId.slice(-6)}`, enabled: true } });
    } catch (error) {
      if (error instanceof RequestError && error.code === 'PROFILE_REQUIRED') { setProfile(null); setError(null); return; }
      const cached = await readJournal(account.uid, 'profile');
      if (cached) setProfile(profileSchema.parse(JSON.parse(cached)));
      setError(friendlyError(error));
    }
  }, []);
  useEffect(() => onAuthStateChanged(auth, (account) => {
    setUser(account); setProfile(null); setLoading(true);
    void (async () => {
      try { await activateOutbox(account?.uid ?? null); if (account) await refresh(); else setError(null); }
      catch (error) { setError(friendlyError(error)); }
      finally { setLoading(false); }
    })();
  }), [refresh]);
  useEffect(() => {
    let active = true;
    void Network.getNetworkStateAsync().then((state) => { if (active) useRuntime.getState().set({ online: state.isInternetReachable !== false && state.isConnected !== false }); });
    const subscription = Network.addNetworkStateListener((state) => {
      useRuntime.getState().set({ online: state.isInternetReachable !== false && state.isConnected !== false });
      void syncOutbox();
    });
    const interval = setInterval(() => { void syncOutbox(); }, 5000);
    const app = AppState.addEventListener('change', (state) => { if (state === 'active') void syncOutbox(); });
    return () => { active = false; subscription.remove(); app.remove(); clearInterval(interval); };
  }, []);
  useEffect(() => {
    if (!user || !profile) return;
    let unsubscribe = () => {};
    let active = true;
    void identityFor(user.uid).then((identity) => {
      if (!active) return;
      const presence = ref(realtime, `presence/${user.uid}/${identity.deviceId}`);
      unsubscribe = onValue(ref(realtime, '.info/connected'), (snapshot) => {
        if (!snapshot.val()) return;
        void onDisconnect(presence).set({ online: false, at: serverTimestamp() }).then(() => set(presence, { online: true, at: serverTimestamp() }));
      });
    });
    return () => { active = false; unsubscribe(); };
  }, [user, profile]);
  const logout = useCallback(async () => {
    if (auth.currentUser) {
      try {
        const identity = await identityFor(auth.currentUser.uid);
        await api(`/users/me/devices/${identity.deviceId}/logout`, z.object({ loggedOut: z.boolean() }), { method: 'POST' });
        await set(ref(realtime, `presence/${auth.currentUser.uid}/${identity.deviceId}`), { online: false, at: serverTimestamp() });
      } catch { /* Offline logout still removes the local authenticated session. */ }
    }
    await signOut(auth); clearIdentityCache(); useRuntime.getState().reset();
  }, []);
  const value = useMemo(() => ({ user, profile, loading, error, refresh, logout }), [user, profile, loading, error, refresh, logout]);
  return <context.Provider value={value}>{children}</context.Provider>;
}
