import { Router } from 'express';
import { randomUUID, createHmac } from 'node:crypto';
import { z } from 'zod';
import { focusSchema } from '../../shared/contracts';
import { focusRemaining } from '../../shared/domain';
import { db, realtime } from './firebase';
import { conversationIdOf, ApiError, requireMember, userOf } from './security';

export const realtimeToolsRouter = Router({ mergeParams: true });
realtimeToolsRouter.use(async (request, response, next) => {
  try { await requireMember(conversationIdOf(request), userOf(request).uid); next(); } catch (error) { next(error); }
});
realtimeToolsRouter.post('/board', async (request, response) => {
  const { updateId, update } = z.object({ updateId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(160), update: z.string().max(90_000) }).strict().parse(request.body);
  if (Buffer.from(update, 'base64').length > 65_536) throw new ApiError(413, 'A alteração do canvas é muito grande.');
  const id = conversationIdOf(request);
  await realtime.ref(`rooms/${id}/board/updates/${updateId}`).set({ update, senderId: userOf(request).uid, createdAt: Date.now() });
  response.json({ accepted: true });
});
realtimeToolsRouter.post('/focus', async (request, response) => {
  const id = conversationIdOf(request);
  const uid = userOf(request).uid;
  const input = z.object({ goal: z.string().trim().min(2).max(180), durationSeconds: z.number().int().min(60).max(7200) }).strict().parse(request.body);
  const ref = realtime.ref(`rooms/${id}/focus`);
  let existingSession = false;
  await ref.transaction((value: unknown) => {
    const current = focusSchema.safeParse(value);
    if (current.success && current.data.state !== 'completed' && focusRemaining(current.data, Date.now()) > 0) { existingSession = true; return; }
    return { ...input, id: `f_${randomUUID().replaceAll('-', '')}`, conversationId: id, hostId: uid,
      startedAt: Date.now(), state: 'running', remainingAtPause: null, completedBy: [], updatedAt: Date.now() };
  });
  if (existingSession) throw new ApiError(409, 'Já existe uma sessão de foco em andamento.');
  response.json(focusSchema.parse((await ref.get()).val()));
});
realtimeToolsRouter.patch('/focus', async (request, response) => {
  const uid = userOf(request).uid;
  const id = conversationIdOf(request);
  const { action } = z.object({ action: z.enum(['pause', 'resume', 'complete', 'checkpoint']) }).strict().parse(request.body);
  const ref = realtime.ref(`rooms/${id}/focus`);
  let forbidden = false;
  await ref.transaction((value: unknown) => {
    if (value === null) return null;
    const session = focusSchema.parse(value);
    if (action === 'checkpoint') return { ...session, completedBy: [...new Set([...session.completedBy, uid])], updatedAt: Date.now() };
    if (session.hostId !== uid) { forbidden = true; return; }
    if (action === 'complete') return { ...session, state: 'completed', remainingAtPause: 0, updatedAt: Date.now() };
    if (action === 'pause' && session.state === 'running') return { ...session, state: 'paused', remainingAtPause: focusRemaining(session, Date.now()), updatedAt: Date.now() };
    if (action === 'resume' && session.state === 'paused') return { ...session, state: 'running', startedAt: Date.now() - (session.durationSeconds - (session.remainingAtPause ?? session.durationSeconds)) * 1000, remainingAtPause: null, updatedAt: Date.now() };
    return;
  });
  if (forbidden) throw new ApiError(403, 'Somente quem iniciou pode controlar o timer.');
  const session = focusSchema.parse((await ref.get()).val());
  if (action === 'checkpoint') await db.doc(`users/${uid}/focusCheckpoints/${id}_${session.id}`).set({ conversationId: id, sessionId: session.id, goal: session.goal, points: 10 });
  if (session.state === 'completed') await db.doc(`conversations/${id}/focusHistory/${session.id}`).set(session);
  response.json(session);
});
realtimeToolsRouter.get('/call/config', async (request, response) => {
  const uid = userOf(request).uid;
  const urls = process.env.TURN_URLS?.split(',').filter(Boolean) ?? [];
  const secret = process.env.TURN_SHARED_SECRET;
  const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (urls.length && secret) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${uid}`;
    iceServers.push({ urls, username, credential: createHmac('sha1', secret).update(username).digest('base64') });
  }
  response.json({ iceServers, turnConfigured: Boolean(urls.length && secret), maxParticipants: 4 });
});
realtimeToolsRouter.post('/call/join', async (request, response) => {
  const id = conversationIdOf(request);
  const uid = userOf(request).uid;
  const { video } = z.object({ video: z.boolean() }).strict().parse(request.body);
  const ref = realtime.ref(`rooms/${id}/call/participants`);
  let full = false;
  await ref.transaction((value: unknown) => {
    const participants = z.record(z.string(), z.object({ joinedAt: z.number(), video: z.boolean() })).parse(value ?? {});
    const active = Object.fromEntries(Object.entries(participants).filter(([, participant]) => Date.now() - participant.joinedAt < 120_000));
    if (!active[uid] && Object.keys(active).length >= 4) { full = true; return; }
    return { ...active, [uid]: { joinedAt: Date.now(), video } };
  });
  if (full) throw new ApiError(409, 'A sala já está com quatro participantes.');
  response.json({ joined: true });
});
realtimeToolsRouter.post('/call/leave', async (request, response) => {
  const id = conversationIdOf(request);
  const uid = userOf(request).uid;
  await realtime.ref(`rooms/${id}/call/participants/${uid}`).remove();
  await realtime.ref(`rooms/${id}/call/signals/${uid}`).remove();
  response.json({ left: true });
});
realtimeToolsRouter.post('/call/signal', async (request, response) => {
  const id = conversationIdOf(request);
  const uid = userOf(request).uid;
  const input = z.object({ recipientId: z.string(), type: z.enum(['offer', 'answer', 'candidate']),
    payload: z.string().max(30_000), signalId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(160) }).strict().parse(request.body);
  const conversation = await requireMember(id, uid);
  if (!conversation.memberIds.includes(input.recipientId)) throw new ApiError(403, 'Destinatário não participa da conversa.');
  const participants = z.record(z.string(), z.object({ joinedAt: z.number(), video: z.boolean() })).parse((await realtime.ref(`rooms/${id}/call/participants`).get()).val() ?? {});
  if (input.recipientId === uid || !participants[uid] || !participants[input.recipientId] || Date.now() - participants[uid].joinedAt >= 120_000 || Date.now() - participants[input.recipientId].joinedAt >= 120_000) throw new ApiError(409, 'As duas pessoas precisam estar na sala para trocar sinais.');
  await realtime.ref(`rooms/${id}/call/signals/${input.recipientId}/${input.signalId}`).set({ ...input, senderId: uid, createdAt: Date.now() });
  response.json({ sent: true });
});
