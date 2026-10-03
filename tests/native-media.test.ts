import { afterEach, expect, it, vi } from 'vitest';
import { convertFormDataAsync } from '../node_modules/expo/src/winter/fetch/convertFormData';

const native = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-image-manipulator', () => ({}));
vi.mock('expo-document-picker', () => ({}));
vi.mock('expo-file-system', () => ({ File: class {
  constructor(readonly uri: string) {}
  name = 'audio.m4a';
  type = 'audio/mp4';
  size = 4;
  async bytes() { return new Uint8Array([1, 2, 3, 4]); }
} }));
vi.mock('expo/fetch', () => ({ fetch: native.fetch }));
vi.mock('../src/services/firebase', () => ({ auth: { currentUser: { uid: 'native-user', getIdToken: async () => 'test-id-token' } } }));
vi.mock('../src/services/api', () => ({ apiBase: 'https://example.com/api', api: vi.fn(), RequestError: Error }));
import { uploadFile } from '../src/services/media';

afterEach(() => vi.unstubAllGlobals());

it('encodes native files with the real Expo multipart converter without constructing an RN Blob', async () => {
  vi.stubGlobal('Blob', class { constructor() { throw new Error('RN Blob rejects ArrayBuffer parts.'); } });
  vi.stubGlobal('FormData', class {
    parts = new Map<string, unknown>();
    append(name: string, value: unknown) { this.parts.set(name, value); }
    get(name: string) { return this.parts.get(name); }
    entries() { return this.parts.entries(); }
  });
  native.fetch.mockImplementation(async (_url: string, options: RequestInit) => {
    const form = options.body as FormData;
    const part = form.get('file') as unknown as { name: string; type: string; size: number };
    expect(part.type).toBe('audio/mp4');
    expect(part.name).toBe('audio.m4a');
    const multipart = await convertFormDataAsync(form, 'native-boundary');
    const encoded = new TextDecoder().decode(multipart.body);
    expect(encoded).toContain('filename="audio.m4a"');
    expect(encoded).toContain('content-type: audio/mp4');
    expect(encoded).toContain('\u0001\u0002\u0003\u0004');
    expect(form.get('purpose')).toBe('attachment');
    expect(form.get('conversationId')).toBe('direct-chat');
    expect(options.headers).toEqual({ Authorization: 'Bearer test-id-token' });
    return Response.json({ id: 'native-audio', name: part.name, url: 'https://example.com/api/media/native-audio', mimeType: part.type, size: part.size, kind: 'audio' });
  });
  const uploaded = await uploadFile({ uri: 'file:///private/outbox/audio.m4a', name: 'audio.m4a', mimeType: 'audio/mp4', duration: 22 }, 'attachment', 'direct-chat');
  expect(native.fetch).toHaveBeenCalledOnce();
  expect(uploaded.duration).toBe(22);
});
