import { Router } from 'express';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { deviceInputSchema, deviceSchema, personSchema, preferenceSchema, profileInputSchema, profileSchema } from '../../shared/contracts';
import { db, realtime } from './firebase';
import { conversationIdOf, ApiError, parseId, requireMember, userOf } from './security';

export const usersRouter = Router();
usersRouter.get('/me', async (request, response) => {
  const doc = await db.doc(`users/${userOf(request).uid}`).get();
  if (!doc.exists) throw new ApiError(404, 'Conclua seu perfil para começar.', 'PROFILE_REQUIRED');
  response.json(profileSchema.parse(doc.data()));
});
usersRouter.put('/me', async (request, response) => {
  const user = userOf(request);
  const input = profileInputSchema.parse(request.body);
  const photo = await db.collection('assets').where('url', '==', input.photoUrl).where('ownerId', '==', user.uid).limit(1).get();
  if (photo.empty || photo.docs[0].data().purpose !== 'profile' || photo.docs[0].data().kind !== 'image') throw new ApiError(400, 'Selecione e envie sua foto de perfil.');
  const ref = db.doc(`users/${user.uid}`);
  const existing = await ref.get();
  const profile = { ...input, uid: user.uid, email: user.email ?? '', createdAt: existing.data()?.createdAt ?? Date.now() };
  const batch = db.batch();
  batch.set(ref, profile);
  batch.set(db.doc(`directory/${user.uid}`), { uid: user.uid, name: input.name, photoUrl: input.photoUrl });
  if (!existing.exists) batch.set(db.doc(`users/${user.uid}/settings/preferences`), preferenceSchema.parse({}));
  await batch.commit();
  response.json(profileSchema.parse(profile));
});
usersRouter.get('/', async (request, response) => {
  const search = z.string().max(100).parse(request.query.search ?? '').toLocaleLowerCase('pt-BR');
  const docs = await db.collection('directory').limit(500).get();
  response.json(docs.docs.map((doc) => personSchema.parse(doc.data())).filter((person) => person.uid !== userOf(request).uid && person.name.toLocaleLowerCase('pt-BR').includes(search)));
});
usersRouter.get('/me/preferences', async (request, response) => {
  response.json(preferenceSchema.parse((await db.doc(`users/${userOf(request).uid}/settings/preferences`).get()).data() ?? {}));
});
usersRouter.put('/me/preferences', async (request, response) => {
  const preferences = preferenceSchema.parse(request.body);
  await db.doc(`users/${userOf(request).uid}/settings/preferences`).set(preferences);
  response.json(preferences);
});
usersRouter.post('/me/devices', async (request, response) => {
  const uid = userOf(request).uid;
  const device = { ...deviceInputSchema.parse(request.body), uid, updatedAt: Date.now() };
  const deviceRef = db.doc(`users/${uid}/devices/${device.id}`);
  const registry = db.doc(`users/${uid}/settings/deviceRegistry`);
  await db.runTransaction(async (transaction) => {
    const [existing, active] = await Promise.all([transaction.get(deviceRef), transaction.get(db.collection(`users/${uid}/devices`).where('enabled', '==', true)), transaction.get(registry)]);
    if (existing.exists && existing.data()?.publicKey !== device.publicKey) throw new ApiError(409, 'Este dispositivo já possui outra identidade criptográfica.');
    if (existing.exists && existing.data()?.enabled === false) throw new ApiError(403, 'Este dispositivo foi revogado. Registre uma nova identidade local.', 'DEVICE_REVOKED');
    if (!existing.exists && active.size >= 16) throw new ApiError(409, 'Sua conta já tem 16 dispositivos ativos. Revogue um dispositivo antigo no seu perfil.', 'DEVICE_LIMIT');
    if (existing.exists && device.token === null) device.token = existing.data()?.token ?? null;
    transaction.set(deviceRef, device);
    transaction.set(registry, { updatedAt: Date.now() });
  });
  response.json(device);
});
usersRouter.get('/me/devices', async (request, response) => {
  const docs = await db.collection(`users/${userOf(request).uid}/devices`).get();
  response.json(docs.docs.map((doc) => { const { token, ...device } = deviceSchema.parse(doc.data()); return { ...device, pushRegistered: Boolean(token) }; }));
});
usersRouter.delete('/me/devices/:id', async (request, response) => {
  const uid = userOf(request).uid; const device = db.doc(`users/${uid}/devices/${conversationIdOf(request)}`); const registry = db.doc(`users/${uid}/settings/deviceRegistry`);
  await db.runTransaction(async (transaction) => { const existing = await transaction.get(device); if (!existing.exists) throw new ApiError(404, 'Dispositivo não encontrado.'); transaction.update(device, { enabled: false, token: null, updatedAt: Date.now() }); transaction.set(registry, { updatedAt: Date.now() }); });
  response.json({ revoked: true });
});
usersRouter.post('/me/devices/:id/logout', async (request, response) => {
  await db.doc(`users/${userOf(request).uid}/devices/${parseId(request.params.id)}`).update({ token: null, updatedAt: Date.now() });
  response.json({ loggedOut: true });
});
usersRouter.get('/:uid', async (request, response) => {
  const currentUid = userOf(request).uid;
  const targetUid = parseId(request.params.uid);
  if (targetUid !== currentUid) {
    const shared = await db.collection('conversations').where('memberIds', 'array-contains', currentUid).get();
    if (!shared.docs.some((doc) => (doc.data().memberIds as string[]).includes(targetUid))) throw new ApiError(403, 'Este perfil exige uma conversa ou grupo em comum.');
  }
  const profile = await db.doc(`users/${targetUid}`).get();
  if (!profile.exists) throw new ApiError(404, 'Perfil não encontrado.');
  response.json(profileSchema.parse(profile.data()));
});

export const deviceKeysRouter = Router({ mergeParams: true });
deviceKeysRouter.get('/', async (request, response) => {
  const conversation = await requireMember(conversationIdOf(request), userOf(request).uid);
  const devices = await Promise.all(conversation.memberIds.map((uid) => db.collection(`users/${uid}/devices`).where('enabled', '==', true).get()));
  response.json(devices.flatMap((list) => list.docs.map((doc) => {
    const { token: _token, ...device } = deviceSchema.parse(doc.data());
    return device;
  })));
});

export const readRouter = Router({ mergeParams: true });
readRouter.post('/', async (request, response) => {
  const id = conversationIdOf(request);
  const uid = userOf(request).uid;
  await requireMember(id, uid);
  const { threadId } = z.object({ threadId: z.string().nullable().default(null) }).strict().parse(request.body);
  if (threadId && !(await realtime.ref(`rooms/${id}/messages/${parseId(threadId)}`).get()).exists()) throw new ApiError(404, 'Este tópico não existe.');
  const marker = { conversationId: id, threadId, lastReadAt: Date.now() };
  await db.doc(`users/${uid}/readMarkers/${threadId ? `${id}_${threadId}` : id}`).set(marker);
  await db.doc(`conversations/${id}/readReceipts/${uid}_${threadId ?? 'root'}`).set({ ...marker, uid });
  const attention = await db.collection(`users/${uid}/attention`).where('conversationId', '==', id).get();
  const batch = db.batch();
  attention.docs.filter((doc) => !threadId || doc.data().kind === 'thread' && doc.data().sourceId === threadId).forEach((doc) => batch.update(doc.ref, { read: true }));
  await batch.commit();
  response.json({ read: true });
});

export async function createAttention(uid: string, event: { id: string; conversationId: string; title: string; kind: string; sourceId: string }): Promise<void> {
  const ref = db.doc(`users/${uid}/attention/${event.id}`);
  await db.runTransaction(async (transaction) => { if ((await transaction.get(ref)).exists) return; transaction.create(ref, { ...event, read: false, createdAt: Date.now() }); });
}

export async function addNotificationAck(eventId: string, uid: string, field: 'opens' | 'received'): Promise<void> {
  const ref = db.doc(`notificationEvents/${eventId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || !snapshot.data()?.recipients.includes(uid)) throw new ApiError(403, 'Esta notificação não foi destinada a você.');
  await ref.update({ [field]: FieldValue.arrayUnion(uid) });
}
