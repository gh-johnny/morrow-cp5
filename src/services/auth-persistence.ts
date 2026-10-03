import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, initializeAuth, type Persistence } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';

/** Firebase's native export uses platform-specific declarations not exposed by its web typings. */
type NativeAuth = typeof import('firebase/auth') & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};
export function initializePersistentAuth(app: FirebaseApp) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const native = require('firebase/auth') as NativeAuth;
  try { return initializeAuth(app, { persistence: native.getReactNativePersistence(AsyncStorage) }); }
  catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/already-initialized') return getAuth(app); throw error; }
}
