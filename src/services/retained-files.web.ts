import type { SelectedFile } from './media';
import { readSecret, writeSecret } from './key-store';
export async function retainFile(uid: string, file: SelectedFile): Promise<SelectedFile> {
  const blob = await (await fetch(file.uri)).blob();
  if (blob.size > 3_000_000) throw new Error('Escolha um arquivo com até 3 MB.');
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Falha ao guardar arquivo.')); reader.readAsDataURL(blob); });
  const uri = `retained-${crypto.randomUUID()}`;
  await writeSecret(`${uid}-${uri}`, data);
  return { ...file, uri };
}
export async function resolveRetainedFile(uid: string, file: SelectedFile): Promise<SelectedFile> {
  const uri = await readSecret(`${uid}-${file.uri}`);
  if (!uri) throw new Error('O arquivo local não está mais disponível.');
  return { ...file, uri };
}
export async function removeRetainedFile(uid: string, file: SelectedFile): Promise<void> { await writeSecret(`${uid}-${file.uri}`, ''); }
