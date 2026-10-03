import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import config from '../../firebaseConfig.json';
import { initializePersistentAuth } from './auth-persistence';

const existing = getApps().find((app) => app.name === 'morrow');
export const firebaseApp = existing ?? initializeApp(config, 'morrow');
export const auth = initializePersistentAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const realtime = getDatabase(firebaseApp);
if (!existing && process.env.EXPO_PUBLIC_USE_EMULATORS === 'true') {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || 'localhost';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(firestore, host, 8080);
  connectDatabaseEmulator(realtime, host, 9000);
}
