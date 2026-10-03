import { readSecret, writeSecret } from './key-store';
export async function readJournal(uid: string, name: string): Promise<string | null> { return readSecret(`journal-${uid}-${name}`); }
export async function writeJournal(uid: string, name: string, value: string): Promise<void> { await writeSecret(`journal-${uid}-${name}`, value); }
