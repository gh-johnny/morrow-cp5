import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { readSecret, writeSecret } from './key-store';

const databases = new Map<string, Promise<SQLite.SQLiteDatabase>>();
function database(uid: string): Promise<SQLite.SQLiteDatabase> {
  let pending = databases.get(uid);
  if (!pending) {
    pending = (async () => {
      const name = `morrow-${uid}`;
      let key = await readSecret(`${name}-database-key`);
      if (!key) { key = Array.from(Crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join(''); await writeSecret(`${name}-database-key`, key); }
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Chave do banco local inválida.');
      const db = await SQLite.openDatabaseAsync(`${name}.db`);
      await db.execAsync(`PRAGMA key = "x'${key}'"; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS journal (name TEXT PRIMARY KEY, value TEXT NOT NULL);`);
      return db;
    })();
    databases.set(uid, pending);
  }
  return pending;
}
export async function readJournal(uid: string, name: string): Promise<string | null> {
  return (await (await database(uid)).getFirstAsync<{ value: string }>('SELECT value FROM journal WHERE name = ?', name))?.value ?? null;
}
export async function writeJournal(uid: string, name: string, value: string): Promise<void> {
  await (await database(uid)).runAsync('INSERT INTO journal(name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value', name, value);
}
