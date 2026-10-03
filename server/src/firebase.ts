import { cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-morrow';
const emulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const app = getApps()[0] ?? initializeApp({
  projectId, databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
  ...(!emulator && privateKey && process.env.FIREBASE_CLIENT_EMAIL ? {
    credential: cert({ projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }),
  } : {}),
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtime = getDatabase(app);
db.settings({ ignoreUndefinedProperties: true });
export async function closeFirebase() { await db.terminate(); realtime.goOffline(); await deleteApp(app); }
