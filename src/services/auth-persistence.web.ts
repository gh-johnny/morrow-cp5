import { getAuth } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';
export function initializePersistentAuth(app: FirebaseApp) { return getAuth(app); }
