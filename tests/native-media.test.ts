import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-image-manipulator', () => ({}));
vi.mock('expo-document-picker', () => ({}));
vi.mock('expo-file-system', () => ({ File: class {
  constructor(readonly uri: string) {}
  async arrayBuffer() { return new Uint8Array([1, 2, 3, 4]).buffer; }
} }));
vi.mock('../src/services/firebase', () => ({ auth: { currentUser: { uid: 'native-user', getIdToken: async () => 'test-id-token' } } }));
vi.mock('../src/services/api', () => ({ apiBase: 'https://example.com/api', api: vi.fn(), RequestError: Error }));
import { uploadFile } from '../src/services/media';

afterEach(() => vi.unstubAllGlobals());

it('uploads native file bytes as multipart Blob with the declared MIME, filename and conversation', async () => {
  const request = vi.fn(async (_url: string, options: RequestInit) => {
    const form = options.body as FormData;
    const part = form.get('file') as File;
    expect(part).toBeInstanceOf(Blob);
    expect(part.type).toBe('audio/mp4');
    expect(part.name).toBe('audio.m4a');
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(form.get('purpose')).toBe('attachment');
    expect(form.get('conversationId')).toBe('direct-chat');
    expect(options.headers).toEqual({ Authorization: 'Bearer test-id-token' });
    return Response.json({ id: 'native-audio', name: part.name, url: 'https://example.com/api/media/native-audio', mimeType: part.type, size: part.size, kind: 'audio' });
  });
  vi.stubGlobal('fetch', request);
  const uploaded = await uploadFile({ uri: 'file:///private/outbox/audio.m4a', name: 'audio.m4a', mimeType: 'audio/mp4', duration: 22 }, 'attachment', 'direct-chat');
  expect(request).toHaveBeenCalledOnce();
  expect(uploaded.duration).toBe(22);
});
