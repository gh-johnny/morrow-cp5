import { Router } from 'express';
import { z } from 'zod';
import { deviceSchema, messageInputSchema, messageSchema, type Message } from '../../shared/contracts';
import { db, realtime } from './firebase';
import { conversationIdOf, ApiError, parseId, requireMember, userOf } from './security';
import { createAttention } from './users';

export const messagesRouter = Router({ mergeParams: true });
messagesRouter.get('/', async (request, response) => {
  const id = conversationIdOf(request);
  await requireMember(id, userOf(request).uid);
  const snapshot = await realtime.ref(`rooms/${id}/messages`).orderByChild('createdAt').limitToLast(200).get();
  response.json(Object.values(snapshot.val() ?? {}).map((value) => messageSchema.parse(value)));
});
messagesRouter.post('/', async (request, response) => {
  const uid = userOf(request).uid;
  const id = conversationIdOf(request);
  const conversation = await requireMember(id, uid);
  const input = messageInputSchema.parse(request.body);
  if (input.mentionedUserIds.some((member) => !conversation.memberIds.includes(member))) throw new ApiError(400, 'Mencione somente integrantes ativos.');
  if (input.threadId && !(await realtime.ref(`rooms/${id}/messages/${input.threadId}`).get()).exists()) throw new ApiError(400, 'Tópico não encontrado.');
  if (input.replyToId && !(await realtime.ref(`rooms/${id}/messages/${input.replyToId}`).get()).exists()) throw new ApiError(400, 'Mensagem de origem não encontrada.');
  if (conversation.encrypted) {
    if (!input.envelopes.length || input.text || input.attachments.length) throw new ApiError(400, 'Esta conversa exige envelopes criptografados de texto.');
    for (const envelope of input.envelopes) {
      if (!conversation.memberIds.includes(envelope.recipientUid)) throw new ApiError(400, 'Destinatário inválido.');
      const sender = deviceSchema.parse((await db.doc(`users/${uid}/devices/${envelope.senderDeviceId}`).get()).data());
      const recipient = deviceSchema.parse((await db.doc(`users/${envelope.recipientUid}/devices/${envelope.recipientDeviceId}`).get()).data());
      if (!sender.enabled || !recipient.enabled || sender.publicKey !== envelope.senderPublicKey) throw new ApiError(403, 'A chave deste dispositivo foi revogada.');
    }
  } else if (input.envelopes.length) throw new ApiError(400, 'Ative a proteção de dispositivos antes de enviar envelopes.');
  for (const attachment of input.attachments) {
    const asset = await db.doc(`assets/${attachment.id}`).get();
    if (!asset.exists || asset.data()?.ownerId !== uid || asset.data()?.url !== attachment.url || asset.data()?.conversationId !== id || asset.data()?.purpose !== 'attachment') throw new ApiError(403, 'Arquivo não autorizado para esta conversa.');
    if (attachment.kind !== asset.data()?.kind || attachment.mimeType !== asset.data()?.mimeType || attachment.size !== asset.data()?.size) throw new ApiError(400, 'Os metadados do arquivo não correspondem ao upload.');
  }
  const message: Message = { ...input, conversationId: id, conversationType: conversation.type, senderId: uid,
    createdAt: Date.now(), editedAt: null, deletedAt: null, pinned: false, reactions: {}, history: [] };
  const ref = realtime.ref(`rooms/${id}/messages/${input.id}`);
  let revoked = false;
  // A null proposal forces RTDB to compare its server hash and hydrate existing data.
  const result = await realtime.ref(`rooms/${id}`).transaction((current: unknown) => {
    if (current === null) return null;
    const room = z.record(z.string(), z.unknown()).parse(current ?? {});
    const access = z.object({ members: z.record(z.string(), z.boolean()) }).safeParse(room.access);
    if (!access.success || access.data.members[uid] !== true) { revoked = true; return; }
    const messages = z.record(z.string(), z.unknown()).parse(room.messages ?? {});
    return { ...room, messages: { ...messages, [input.id]: messages[input.id] ?? message } };
  });
  if (revoked || !result.committed || result.snapshot.child(`access/members/${uid}`).val() !== true) throw new ApiError(403, 'Sua participação nesta conversa foi revogada.');
  const saved = messageSchema.parse((await ref.get()).val());
  if (saved.senderId !== uid) throw new ApiError(409, 'Este identificador pertence a outra mensagem.');
  const conversationRef = db.doc(`conversations/${id}`);
  await db.runTransaction(async (transaction) => {
    const latest = (await transaction.get(conversationRef)).data();
    if (Number(latest?.lastMessageAt ?? 0) > saved.createdAt) return;
    transaction.update(conversationRef, { lastMessage: conversation.encrypted ? 'Mensagem protegida' : saved.text.slice(0, 160) || 'Arquivo compartilhado',
      lastMessageAt: saved.createdAt, lastSenderId: uid, updatedAt: Date.now() });
  });
  const current = await requireMember(id, uid);
  for (const recipient of saved.mentionedUserIds.filter((recipient) => recipient !== uid && current.memberIds.includes(recipient))) {
    await createAttention(recipient, { id: `${saved.id}_mention`, conversationId: id, title: 'Você foi mencionado na conversa.', kind: 'mention', sourceId: saved.id });
  }
  if (saved.threadId) {
    const subscriptions = await db.collection(`conversations/${id}/threadSubscriptions`).where('threadId', '==', saved.threadId).get();
    for (const subscription of subscriptions.docs) {
      const subscribed = z.object({ uid: z.string(), subscribed: z.boolean() }).parse(subscription.data());
      if (subscribed.subscribed && subscribed.uid !== uid && current.memberIds.includes(subscribed.uid)) await createAttention(subscribed.uid,
        { id: `${saved.id}_thread`, conversationId: id, title: 'Há uma nova resposta no tópico que você acompanha.', kind: 'thread', sourceId: saved.threadId });
    }
  }
  response.status(201).json(saved);
});
messagesRouter.patch('/:messageId', async (request, response) => {
  const uid = userOf(request).uid;
  const id = conversationIdOf(request);
  const conversation = await requireMember(id, uid);
  const messageId = parseId(request.params.messageId);
  const input = z.object({ action: z.enum(['edit', 'delete', 'reaction', 'pin']), text: z.string().trim().min(1).max(8000).optional(),
    reaction: z.enum(['heart', 'spark', 'laugh', 'check']).nullable().optional(), pinned: z.boolean().optional() }).strict().parse(request.body);
  const ref = realtime.ref(`rooms/${id}/messages/${messageId}`);
  let denied = false;
  let missing = false;
  const changed = await realtime.ref(`rooms/${id}`).transaction((value: unknown) => {
    if (value === null) return null;
    const room = z.record(z.string(), z.unknown()).parse(value);
    const access = z.object({ members: z.record(z.string(), z.boolean()) }).safeParse(room.access);
    if (!access.success || access.data.members[uid] !== true) { denied = true; return; }
    const messages = z.record(z.string(), z.unknown()).parse(room.messages ?? {});
    if (!messages[messageId]) { missing = true; return; }
    const message = messageSchema.parse(messages[messageId]);
    const commit = (updated: Message) => ({ ...room, messages: { ...messages, [messageId]: updated } });
    if ((input.action === 'edit' || input.action === 'delete') && message.senderId !== uid) { denied = true; return; }
    if (message.deletedAt) return room;
    if (input.action === 'edit') {
      if (conversation.encrypted || !input.text) { denied = true; return; }
      return commit({ ...message, text: input.text, editedAt: Date.now(), history: [...message.history, { text: message.text, at: Date.now() }].slice(-20) });
    }
    if (input.action === 'delete') return commit({ ...message, text: '', attachments: [], envelopes: [], history: [], deletedAt: Date.now() });
    if (input.action === 'pin') return commit({ ...message, pinned: input.pinned ?? !message.pinned });
    const reactions = { ...message.reactions };
    if (input.reaction) reactions[uid] = input.reaction; else delete reactions[uid];
    return commit({ ...message, reactions });
  });
  if (denied) throw new ApiError(403, 'Esta alteração não é permitida.');
  if (missing || !changed.committed) throw new ApiError(404, 'Mensagem não encontrada.');
  response.json(messageSchema.parse((await ref.get()).val()));
});
