import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { attachmentSchema, type Attachment } from '../../shared/contracts';
import { auth } from './firebase';
import { api, apiBase, RequestError } from './api';
import { z } from 'zod';

export type SelectedFile = { uri: string; name: string; mimeType: string; size?: number; duration?: number };
export async function pickPhoto(): Promise<SelectedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Permita acesso às fotos para selecionar uma imagem.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const image = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: Math.min(asset.width, 1200) } }], { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG });
  return { uri: image.uri, name: 'foto.jpg', mimeType: 'image/jpeg' };
}
export async function pickFile(): Promise<SelectedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf', 'text/plain', 'audio/*'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0];
  if ((file.size ?? 0) > 3_000_000) throw new Error('Escolha um arquivo com até 3 MB.');
  return { uri: file.uri, name: file.name, mimeType: file.mimeType ?? 'application/octet-stream', size: file.size };
}
export async function uploadFile(file: SelectedFile, purpose: 'profile' | 'group' | 'attachment', conversationId?: string): Promise<Attachment> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sua sessão precisa ser autenticada.');
  const body = new FormData();
  if (Platform.OS === 'web') body.append('file', await (await fetch(file.uri)).blob(), file.name);
  else body.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  body.append('purpose', purpose);
  if (conversationId) body.append('conversationId', conversationId);
  const response = await fetch(`${apiBase}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, signal: AbortSignal.timeout(55_000) });
  const result: unknown = await response.json();
  if (!response.ok) throw new RequestError(z.object({ error: z.string() }).parse(result).error, response.status, 'MEDIA_UPLOAD');
  return { ...attachmentSchema.parse(result), ...(file.duration ? { duration: file.duration } : {}) };
}
export async function signedMediaUrl(url: string): Promise<string> {
  const id = url.match(/\/media\/([A-Za-z0-9_-]+)$/)?.[1];
  if (!id) return url;
  return (await api(`/media/${id}/link`, z.object({ url: z.string() }))).url;
}
