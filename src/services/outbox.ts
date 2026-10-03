import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { type Conversation, type LocalMessage, messageInputSchema, messageSchema, notificationEventSchema, deviceSchema } from '../../shared/contracts';
import { encryptForDevices } from '../../shared/encryption';
import { retryDelay } from '../../shared/domain';
import { api, friendlyError, RequestError } from './api';
import { auth } from './firebase';
import { identityFor } from './device-identity';
import { readJournal, writeJournal } from './journal';
import { type SelectedFile, uploadFile } from './media';
import { retainFile, resolveRetainedFile, removeRetainedFile } from './retained-files';
import { useRuntime } from '../store/runtime';

const operationSchema = z.object({ conversationId: z.string(), input: messageInputSchema, encrypted: z.boolean(), createdAt: z.number(),
  files: z.array(z.object({ uri: z.string(), name: z.string(), mimeType: z.string(), size: z.number().optional(), duration: z.number().optional() })),
  preview: z.string().default(''), attempt: z.number(), nextAt: z.number(), error: z.string().nullable(), terminal: z.boolean() });
export type OutboxEntry = z.infer<typeof operationSchema>;
let entries: OutboxEntry[] = [];
let uid: string | null = null;
let syncing = false;
let serial = Promise.resolve();
const listeners = new Set<() => void>();
function emit() { useRuntime.getState().set({ pending: entries.length }); listeners.forEach((listener) => listener()); }
export function subscribeOutbox(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function outboxSnapshot(): readonly OutboxEntry[] { return entries; }
async function mutate(callback: () => void): Promise<void> {
  const account = uid;
  if (!account) throw new Error('Sua sessão precisa ser autenticada.');
  const action = serial.then(async () => { if (uid !== account) return; callback(); await writeJournal(account, 'outbox', JSON.stringify(entries)); emit(); });
  serial = action.catch(() => undefined);
  await action;
}
export async function activateOutbox(account: string | null): Promise<void> {
  await serial;
  uid = account;
  entries = account ? z.array(operationSchema).parse(JSON.parse(await readJournal(account, 'outbox') ?? '[]')) : [];
  useRuntime.getState().set({ blackout: account ? JSON.parse(await readJournal(account, 'blackout') ?? 'false') === true : false });
  emit();
}
export async function setBlackout(value: boolean): Promise<void> {
  if (!uid) throw new Error('Sua sessão precisa ser autenticada.');
  await writeJournal(uid, 'blackout', JSON.stringify(value));
  useRuntime.getState().set({ blackout: value });
  if (!value) await syncOutbox();
}
export async function enqueueMessage(conversation: Conversation, text: string, options: { mentions?: string[]; threadId?: string | null; replyToId?: string | null; files?: SelectedFile[] } = {}): Promise<void> {
  if (!uid) throw new Error('Sua sessão precisa ser autenticada.');
  if (conversation.encrypted && options.files?.length) throw new Error('A proteção de dispositivos aceita texto. Desative para compartilhar arquivos.');
  const files = await Promise.all((options.files ?? []).map((file) => retainFile(uid!, file)));
  const input = messageInputSchema.parse({ id: `m_${Crypto.randomUUID().replaceAll('-', '')}`, text: text || (files.length ? 'Arquivo compartilhado' : ''),
    mentionedUserIds: options.mentions ?? [], threadId: options.threadId ?? null, replyToId: options.replyToId ?? null });
  await mutate(() => { entries = [...entries, { conversationId: conversation.id, input, preview: input.text, encrypted: conversation.encrypted, files, createdAt: Date.now(), attempt: 0, nextAt: 0, error: null, terminal: false }]; });
  void syncOutbox();
}
export function localMessages(conversation: Conversation, snapshot: readonly OutboxEntry[] = entries): LocalMessage[] {
  return snapshot.filter((entry) => entry.conversationId === conversation.id).map((entry) => ({ ...entry.input, text: entry.input.text || entry.preview, conversationId: conversation.id,
    conversationType: conversation.type, senderId: uid ?? '', createdAt: entry.createdAt, editedAt: null, deletedAt: null, pinned: false, reactions: {}, history: [], localStatus: entry.terminal ? 'failed' : 'pending' }));
}
export async function discardEntry(id: string): Promise<void> {
  const entry = entries.find((item) => item.input.id === id);
  if (entry && uid) await Promise.all(entry.files.map((file) => removeRetainedFile(uid!, file)));
  await mutate(() => { entries = entries.filter((entry) => entry.input.id !== id); });
}
export async function retryEntries(): Promise<void> { await mutate(() => { entries = entries.map((entry) => ({ ...entry, nextAt: 0, terminal: false, error: null })); }); await syncOutbox(); }
export async function syncOutbox(): Promise<void> {
  const runtime = useRuntime.getState();
  const account = uid;
  if (syncing || !account || runtime.blackout || !runtime.online || auth.currentUser?.uid !== account) return;
  syncing = true;
  runtime.set({ syncing: true, syncError: null });
  try {
    for (const entry of [...entries]) {
      if (uid !== account || useRuntime.getState().blackout || entry.terminal || entry.nextAt > Date.now()) continue;
      try {
        let input = entry.input;
        if (entry.files.length && !input.attachments.length) {
          const attachments = await Promise.all(entry.files.map(async (file) => uploadFile(await resolveRetainedFile(account, file), 'attachment', entry.conversationId)));
          input = { ...input, attachments, text: input.text === 'Arquivo compartilhado' ? '' : input.text };
          await mutate(() => { entries = entries.map((item) => item.input.id === input.id ? { ...item, input } : item); });
        }
        if (entry.encrypted && !input.envelopes.length) {
          const devices = await api(`/conversations/${entry.conversationId}/devices`, z.array(deviceSchema.omit({ token: true })));
          const peerIds = new Set(devices.filter((device) => device.uid !== account).map((device) => device.uid));
          if (!peerIds.size) throw new RequestError('O destinatário precisa registrar um dispositivo antes de receber texto protegido.', 409, 'NO_DEVICE');
          input = { ...input, text: '', envelopes: encryptForDevices(input.text, await identityFor(account), devices) };
          await mutate(() => { entries = entries.map((item) => item.input.id === input.id ? { ...item, input } : item); });
        }
        await api(`/conversations/${entry.conversationId}/messages`, messageSchema, { method: 'POST', body: input });
        await api('/notifications', notificationEventSchema, { method: 'POST', body: { conversationId: entry.conversationId, messageId: input.id } });
        if (uid !== account) break;
        await discardEntry(input.id);
      } catch (error) {
        if (uid !== account) break;
        const terminal = error instanceof RequestError && [400, 401, 403, 404, 409].includes(error.status);
        await mutate(() => { entries = entries.map((item) => item.input.id === entry.input.id ? { ...item, attempt: item.attempt + 1,
          nextAt: Date.now() + retryDelay(item.attempt), error: friendlyError(error), terminal } : item); });
        useRuntime.getState().set({ syncError: friendlyError(error) });
      }
    }
  } finally { syncing = false; useRuntime.getState().set({ syncing: false }); }
}
