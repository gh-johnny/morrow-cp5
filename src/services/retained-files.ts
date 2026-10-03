import { File, Paths, Directory } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import type { SelectedFile } from './media';
export async function retainFile(uid: string, file: SelectedFile): Promise<SelectedFile> {
  const directory = new Directory(Paths.document, 'outbox', uid);
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(directory, `${Crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9.]/g, '_')}`);
  new File(file.uri).copy(destination);
  return { ...file, uri: destination.uri };
}
export async function resolveRetainedFile(_uid: string, file: SelectedFile): Promise<SelectedFile> { return file; }
export async function removeRetainedFile(_uid: string, file: SelectedFile): Promise<void> { const local = new File(file.uri); if (local.exists) local.delete(); }
