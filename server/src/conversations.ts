import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { conversationSchema, groupInputSchema, groupUpdateSchema, uidSchema, type Conversation } from '../../shared/contracts';
import { directConversationId } from '../../shared/domain';
import { db } from './firebase';
import { enforceCapacity, ApiError, parseId, projectAcl, requireMember, userOf } from './security';

export const conversationsRouter = Router();
async function requireGroupPhoto(url: string, uid: string) {
  const assets = await db.collection('assets').where('url', '==', url).where('ownerId', '==', uid).limit(1).get();
  const photo = assets.docs[0]?.data();
  if (!photo || photo.purpose !== 'group' || photo.kind !== 'image') throw new ApiError(400, 'Selecione e envie uma foto para este grupo.');
}
conversationsRouter.get('/', async (request, response) => {
  const snapshot = await db.collection('conversations').where('memberIds', 'array-contains', userOf(request).uid).get();
  response.json(snapshot.docs.map((doc) => conversationSchema.parse(doc.data())).sort((a, b) => b.lastMessageAt - a.lastMessageAt));
});
conversationsRouter.post('/direct', async (request, response) => {
  const uid = userOf(request).uid;
  const { recipientId } = z.object({ recipientId: uidSchema }).strict().parse(request.body);
  if (recipientId === uid) throw new ApiError(400, 'Você não pode conversar consigo mesmo.');
  const recipient = await db.doc(`users/${recipientId}`).get();
  if (!recipient.exists) throw new ApiError(404, 'Usuário não encontrado.');
  const id = directConversationId(uid, recipientId);
  const ref = db.doc(`conversations/${id}`);
  const conversation = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return conversationSchema.parse(existing.data());
    const value: Conversation = { id, type: 'direct', name: '', photoUrl: '', ownerId: uid,
      memberIds: [uid, recipientId].sort(), memberLimit: 2, notificationPolicy: 'all_group_messages',
      encrypted: false, membershipVersion: 1, createdAt: Date.now(), updatedAt: Date.now(),
      lastMessage: '', lastMessageAt: 0, lastSenderId: '' };
    transaction.create(ref, value);
    return value;
  });
  await projectAcl(conversation);
  response.json(conversation);
});
conversationsRouter.post('/groups', async (request, response) => {
  const uid = userOf(request).uid;
  const input = groupInputSchema.parse(request.body);
  await requireGroupPhoto(input.photoUrl, uid);
  const members = enforceCapacity(input.memberIds, input.memberLimit, uid);
  const profiles = await db.getAll(...members.map((id) => db.doc(`users/${id}`)));
  if (profiles.some((profile) => !profile.exists)) throw new ApiError(400, 'Um integrante selecionado não existe.');
  const id = `g_${randomUUID().replaceAll('-', '')}`;
  const conversation: Conversation = { ...input, id, type: 'group', ownerId: uid,
    memberIds: members, encrypted: false, membershipVersion: 1, createdAt: Date.now(), updatedAt: Date.now(),
    lastMessage: '', lastMessageAt: 0, lastSenderId: '' };
  await db.doc(`conversations/${id}`).create(conversation);
  await projectAcl(conversation);
  response.status(201).json(conversation);
});
conversationsRouter.patch('/:id', async (request, response) => {
  const id = parseId(request.params.id);
  const uid = userOf(request).uid;
  const input = groupUpdateSchema.parse(request.body);
  if (input.photoUrl) await requireGroupPhoto(input.photoUrl, uid);
  const ref = db.doc(`conversations/${id}`);
  const conversation = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = conversationSchema.parse(snapshot.data());
    if (previous.type !== 'group' || previous.ownerId !== uid) throw new ApiError(403, 'Somente o proprietário pode editar o grupo.');
    const memberIds = enforceCapacity(input.memberIds ?? previous.memberIds, input.memberLimit ?? previous.memberLimit, uid);
    const profiles = await transaction.getAll(...memberIds.map((memberId) => db.doc(`users/${memberId}`)));
    if (profiles.some((profile) => !profile.exists)) throw new ApiError(400, 'Um integrante não foi encontrado.');
    const next: Conversation = { ...previous, ...input, memberIds, membershipVersion: previous.membershipVersion + 1, updatedAt: Date.now() };
    transaction.set(ref, next);
    return next;
  });
  await projectAcl(conversation);
  response.json(conversation);
});
conversationsRouter.post('/:id/encryption', async (request, response) => {
  const id = parseId(request.params.id);
  const conversation = await requireMember(id, userOf(request).uid);
  if (conversation.type !== 'direct') throw new ApiError(400, 'A criptografia de dispositivos está disponível em conversas diretas.');
  const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(request.body);
  await db.doc(`conversations/${id}`).update({ encrypted: enabled, updatedAt: Date.now() });
  response.json({ ...conversation, encrypted: enabled });
});
conversationsRouter.get('/:id', async (request, response) => response.json(await requireMember(parseId(request.params.id), userOf(request).uid)));
