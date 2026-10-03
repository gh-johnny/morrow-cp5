import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { notificationEventSchema } from '../../shared/contracts';
import { db } from './firebase';
import { ApiError, authenticate, handleError, parseId, requireMember, userOf } from './security';
import { conversationsRouter } from './conversations';
import { messagesRouter } from './messages';
import { usersRouter, deviceKeysRouter, readRouter, addNotificationAck } from './users';
import { collaborationRouter } from './collaboration';
import { invitationsRouter, admissionRouter } from './invitations';
import { realtimeToolsRouter } from './realtime-tools';
import { mediaRouter } from './media';
import { aiRouter } from './ai';
import { dispatchNotifications, runNotificationJobs } from './notifications';

export const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const origins = new Set((process.env.WEB_ORIGINS ?? 'http://localhost:8081,http://localhost:8082').split(','));
app.use(cors({ origin: (origin, callback) => callback(origin && !origins.has(origin) ? new ApiError(403, 'Origem não autorizada.') : null, true) }));
app.use(express.json({ limit: '250kb' }));
app.get('/api/health', async (request, response) => {
  await db.doc('health/ping').get();
  response.json({ name: 'Morrow API', version: '1.0.0', status: 'ok',
    features: { ai: Boolean(process.env.GEMINI_API_KEY), media: Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
      turn: Boolean(process.env.TURN_URLS && process.env.TURN_SHARED_SECRET) } });
});
app.post('/api/jobs/run', async (request, response) => {
  const provided = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) throw new ApiError(401, 'Autenticação necessária.');
  response.json(await runNotificationJobs());
});
app.use('/api/media', mediaRouter);
app.use('/api', authenticate);
app.use('/api', async (request, response, next) => {
  // Durable per-user windows work across independent serverless instances.
  const uid = userOf(request).uid;
  const ai = request.path.includes('/ai/');
  const window = Math.floor(Date.now() / 60_000);
  const ref = db.doc(`rateLimits/${uid}_${ai ? 'ai' : 'api'}`);
  try {
    await db.runTransaction(async (transaction) => {
      const data = (await transaction.get(ref)).data();
      const count = data?.window === window ? Number(data.count) : 0;
      if (count >= (ai ? 6 : 200)) throw new ApiError(429, 'Muitas solicitações. Aguarde um minuto.');
      transaction.set(ref, { window, count: count + 1 });
    });
    next();
  } catch (error) { next(error); }
});
app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/conversations/:id/messages', messagesRouter);
app.use('/api/conversations/:id/devices', deviceKeysRouter);
app.use('/api/conversations/:id/read', readRouter);
app.use('/api/conversations/:id/join-requests', admissionRouter);
app.use('/api/conversations/:id/ai', aiRouter);
app.use('/api/conversations/:id', collaborationRouter);
app.use('/api/conversations/:id', realtimeToolsRouter);
app.use('/api/invitations', invitationsRouter);
app.post('/api/notifications', async (request, response) => {
  const { conversationId, messageId } = z.object({ conversationId: z.string(), messageId: z.string() }).strict().parse(request.body);
  await requireMember(parseId(conversationId), userOf(request).uid);
  response.json(await dispatchNotifications(conversationId, parseId(messageId), userOf(request).uid));
});
app.post('/api/notifications/ack', async (request, response) => {
  const { eventId, kind } = z.object({ eventId: z.string().max(400), kind: z.enum(['opens', 'received']) }).strict().parse(request.body);
  const event = notificationEventSchema.parse((await db.doc(`notificationEvents/${eventId}`).get()).data());
  await requireMember(event.conversationId, userOf(request).uid);
  await addNotificationAck(eventId, userOf(request).uid, kind);
  response.json({ acknowledged: true });
});
app.get('/api/conversations/:id/notifications', async (request, response) => {
  const conversation = await requireMember(parseId(request.params.id), userOf(request).uid);
  const docs = await db.collection('notificationEvents').where('conversationId', '==', conversation.id).limit(100).get();
  response.json(docs.docs.map((doc) => {
    const delivery = z.record(z.string(), z.object({ state: z.string() }).passthrough()).parse(doc.data().delivery ?? {});
    const values = Object.values(delivery);
    return notificationEventSchema.parse({ ...doc.data(), providerConfirmed: values.filter((entry) => entry.state === 'accepted_by_provider').length,
      providerErrors: values.filter((entry) => entry.state === 'provider_error').length, uncertainDeliveries: values.filter((entry) => ['sending', 'unknown'].includes(entry.state)).length });
  }).sort((a, b) => b.createdAt - a.createdAt));
});
app.use((request, response) => response.status(404).json({ error: 'Endpoint não encontrado.', code: 'NOT_FOUND' }));
app.use(handleError);
