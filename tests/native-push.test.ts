import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listener: null as null | ((token: { type: 'android'; data: string }) => void),
  cleanup: null as null | (() => void),
  nativeFetches: 0,
  register: vi.fn(async () => ({})),
  expo: vi.fn(async (options: { devicePushToken?: { type: 'android'; data: string } }) => {
    if (!options.devicePushToken) {
      state.nativeFetches++;
      queueMicrotask(() => state.listener?.({ type: 'android', data: 'initial-native-token' }));
    }
    return { data: 'ExpoPushToken[test]' };
  }),
}));
vi.mock('react', () => ({ useEffect: (effect: () => () => void) => { state.cleanup = effect(); } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('expo-constants', () => ({ default: { easConfig: { projectId: '04683200-f87c-43e2-83e4-ab30b9aa077a' } } }));
vi.mock('../src/providers/session', () => ({ useSession: () => ({ user: { uid: 'native-user' }, profile: { name: 'Native user' } }) }));
vi.mock('../src/services/firebase', () => ({ auth: { currentUser: { uid: 'native-user' } } }));
vi.mock('../src/services/device-identity', () => ({ identityFor: async () => ({ deviceId: 'native-device', publicKey: 'test-public-key' }) }));
vi.mock('../src/services/api', () => ({ api: state.register }));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: vi.fn(), setNotificationChannelAsync: vi.fn(),
  getPermissionsAsync: async () => ({ granted: true }),
  getExpoPushTokenAsync: state.expo,
  addPushTokenListener: (listener: typeof state.listener) => { state.listener = listener; return { remove: () => { state.listener = null; } }; },
  addNotificationReceivedListener: () => ({ remove: vi.fn() }),
  addNotificationResponseReceivedListener: () => ({ remove: vi.fn() }),
  getLastNotificationResponseAsync: async () => null,
}));
import { NotificationBridge } from '../src/providers/notifications';

it('reuses echoed and rotated Android tokens without recursively fetching the native token', async () => {
  NotificationBridge();
  await vi.waitFor(() => expect(state.expo).toHaveBeenCalledTimes(2), { timeout: 5000 });
  await vi.waitFor(() => expect(state.register).toHaveBeenCalled());
  expect(state.nativeFetches).toBe(1);
  expect(state.register.mock.calls.length).toBeLessThanOrEqual(2);
  expect(state.expo).toHaveBeenLastCalledWith(expect.objectContaining({ devicePushToken: { type: 'android', data: 'initial-native-token' } }));
  const registrations = state.register.mock.calls.length;
  state.listener?.({ type: 'android', data: 'rotated-native-token' });
  await vi.waitFor(() => expect(state.register).toHaveBeenCalledTimes(registrations + 1));
  expect(state.nativeFetches).toBe(1);
  expect(state.expo).toHaveBeenLastCalledWith(expect.objectContaining({ devicePushToken: { type: 'android', data: 'rotated-native-token' } }));
  state.cleanup?.();
  expect(state.listener).toBeNull();
});
