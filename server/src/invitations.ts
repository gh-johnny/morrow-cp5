import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { conversationSchema, inviteSchema } from '../../shared/contracts';
import { db } from './firebase';
import { enforceCapacity, conversationIdOf, ApiError, parseId, projectAcl, requireMember, userOf } from './security';

export const invitationsRouter = Router();
invitationsRouter.post('/', async (request, response) => {
  const { conversationId, approvalRequired, hours } = z.object({ conversationId: z.string(), approvalRequired: z.boolean().default(false), hours: z.number().int().min(1).max(168).default(24) }).strict().parse(request.body);
  const conversation = await requireMember(parseId(conversationId), userOf(request).uid, true);
  if (conversation.type !== 'group') throw new ApiError(400, 'Convites são exclusivos de grupos.');
  const invitation = { id: randomBytes(24).toString('base64url'), conversationId, name: conversation.name,
    createdBy: userOf(request).uid, expiresAt: Date.now() + hours * 3_600_000, revoked: false, approvalRequired };
  await db.doc(`invitations/${invitation.id}`).create(invitation);
  response.status(201).json(invitation);
});
invitationsRouter.get('/:token', async (request, response) => {
  const invitation = inviteSchema.parse((await db.doc(`invitations/${parseId(request.params.token)}`).get()).data());
  if (invitation.revoked || invitation.expiresAt <= Date.now()) throw new ApiError(410, 'Este convite expirou ou foi revogado.');
  const conversation = conversationSchema.parse((await db.doc(`conversations/${invitation.conversationId}`).get()).data());
  response.json({ ...invitation, photoUrl: conversation.photoUrl, vacancies: conversation.memberLimit - conversation.memberIds.length });
});
invitationsRouter.delete('/:token', async (request, response) => {
  const ref = db.doc(`invitations/${parseId(request.params.token)}`);
  const invite = inviteSchema.parse((await ref.get()).data());
  await requireMember(invite.conversationId, userOf(request).uid, true);
  await ref.update({ revoked: true });
  response.json({ revoked: true });
});
invitationsRouter.post('/:token/join', async (request, response) => {
  const uid = userOf(request).uid;
  const ref = db.doc(`invitations/${parseId(request.params.token)}`);
  const result = await db.runTransaction(async (transaction) => {
    const invitation = inviteSchema.parse((await transaction.get(ref)).data());
    if (invitation.revoked || invitation.expiresAt <= Date.now()) throw new ApiError(410, 'Este convite expirou.');
    const conversationRef = db.doc(`conversations/${invitation.conversationId}`);
    const conversation = conversationSchema.parse((await transaction.get(conversationRef)).data());
    const profile = await transaction.get(db.doc(`users/${uid}`));
    if (!profile.exists) throw new ApiError(400, 'Conclua seu perfil antes de entrar.');
    if (conversation.memberIds.includes(uid)) return { conversation, pending: false };
    if (invitation.approvalRequired) {
      transaction.set(db.doc(`conversations/${conversation.id}/joinRequests/${uid}`), { uid, status: 'pending', createdAt: Date.now() });
      return { conversation, pending: true };
    }
    const memberIds = enforceCapacity([...conversation.memberIds, uid], conversation.memberLimit, conversation.ownerId);
    const next = { ...conversation, memberIds, membershipVersion: conversation.membershipVersion + 1, updatedAt: Date.now() };
    transaction.set(conversationRef, next);
    return { conversation: next, pending: false };
  });
  if (!result.pending) await projectAcl(result.conversation);
  response.json({ conversationId: result.conversation.id, pending: result.pending });
});

export const admissionRouter = Router({ mergeParams: true });
admissionRouter.post('/:uid', async (request, response) => {
  const id = conversationIdOf(request);
  const uid = parseId(request.params.uid);
  const owner = userOf(request).uid;
  const { approved } = z.object({ approved: z.boolean() }).strict().parse(request.body);
  const conversation = await db.runTransaction(async (transaction) => {
    const ref = db.doc(`conversations/${id}`);
    const current = conversationSchema.parse((await transaction.get(ref)).data());
    const joinRef = db.doc(`conversations/${id}/joinRequests/${uid}`);
    const join = await transaction.get(joinRef);
    if (current.ownerId !== owner) throw new ApiError(403, 'Somente o proprietário pode aprovar.');
    if (!join.exists || join.data()?.status !== 'pending') throw new ApiError(404, 'Solicitação não encontrada.');
    if (!approved) { transaction.update(joinRef, { status: 'rejected' }); return current; }
    const memberIds = enforceCapacity([...current.memberIds, uid], current.memberLimit, current.ownerId);
    const next = { ...current, memberIds, membershipVersion: current.membershipVersion + 1, updatedAt: Date.now() };
    transaction.set(ref, next); transaction.update(joinRef, { status: 'approved' });
    return next;
  });
  await projectAcl(conversation);
  response.json(conversation);
});
