import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
export async function exportData(filename: string, value: unknown): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.write(JSON.stringify(value, null, 2));
  if (!await Sharing.isAvailableAsync()) throw new Error('O compartilhamento não está disponível neste dispositivo.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Compartilhar memória da equipe', UTI: 'public.json' });
}
