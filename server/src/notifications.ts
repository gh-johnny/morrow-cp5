import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { conversationSchema, deviceSchema, messageSchema, notificationEventSchema, preferenceSchema,
  type NotificationEvent } from '../../shared/contracts';
import { isQuietTime, nextQuietEnd, resolveRecipients } from '../../shared/domain';
import { db, realtime } from './firebase';
import { ApiError } from './security';

const ticketSchema = z.object({ status: z.enum(['ok', 'error']), id: z.string().optional(),
  details: z.object({ error: z.string().optional() }).optional() });
const expoResponseSchema = z.object({ data: z.union([ticketSchema, z.array(ticketSchema)]) });
const receiptSchema = z.object({ data: z.record(z.string(), ticketSchema) });

/** Durable job reservation makes retries of the mobile request return the same event. */
export async function dispatchNotifications(conversationId: string, messageId: string, senderId: string): Promise<NotificationEvent> {
  const snapshot = await realtime.ref(`rooms/${conversationId}/messages/${messageId}`).get();
  if (!snapshot.exists()) throw new ApiError(404, 'A mensagem ainda não foi persistida.');
  const message = messageSchema.parse(snapshot.val());
  if (message.senderId !== senderId) throw new ApiError(403, 'Você não pode notificar em nome de outra pessoa.');
  const eventId = `${conversationId}_${messageId}`;
  const ref = db.doc(`notificationEvents/${eventId}`);
  await db.runTransaction(async (transaction) => {
    const previous = await transaction.get(ref);
    if (previous.exists) return;
    transaction.create(ref, { id: eventId, conversationId, messageId, senderId, createdAt: Date.now(),
      status: 'queued', recipients: [], excluded: {}, providerAccepted: 0, providerRejected: 0,
      opens: [], received: [], nextAttemptAt: Date.now(), delivery: {}, claim: null });
  });
  await processEvent(eventId);
  return notificationEventSchema.parse((await ref.get()).data());
}

export async function processEvent(eventId: string, jobDeadline = Date.now() + 35_000): Promise<void> {
  if (Date.now() + 5000 >= jobDeadline) return;
  const ref = db.doc(`notificationEvents/${eventId}`);
  const claim = randomUUID();
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const event = snapshot.data();
    if (!event || event.status === 'completed' || event.claim && Number(event.claimUntil ?? 0) > Date.now() || event.nextAttemptAt > Date.now()) return false;
    transaction.update(ref, { claim, claimUntil: Date.now() + 65_000, status: 'processing' });
    return true;
  });
  if (!claimed) return;
  const deadline = Math.min(Date.now() + 35_000, jobDeadline);
  try {
    const stored = (await ref.get()).data();
    const event = notificationEventSchema.parse(stored);
    const conversationSnapshot = await db.doc(`conversations/${event.conversationId}`).get();
    const conversation = conversationSchema.parse(conversationSnapshot.data());
    const message = messageSchema.parse((await realtime.ref(`rooms/${event.conversationId}/messages/${event.messageId}`).get()).val());
    const recipients = message.deletedAt || !conversation.memberIds.includes(message.senderId) ? [] :
      resolveRecipients(conversation.notificationPolicy, conversation.memberIds, message.senderId, message.mentionedUserIds, conversation.type);
    const excluded: Record<string, string> = {};
    const deliveries = z.record(z.string(), z.object({ state: z.string(), ticketId: z.string().nullable(), devicePath: z.string() })).parse(stored?.delivery ?? {});
    let nextAttemptAt: number | null = null;
    let accepted = event.providerAccepted;
    let rejected = event.providerRejected;
    recipientsLoop: for (const uid of conversation.memberIds) {
      if (Date.now() >= deadline) { nextAttemptAt = Math.min(nextAttemptAt ?? Infinity, Date.now() + 5000); break; }
      if (uid === message.senderId) { excluded[uid] = 'Remetente da mensagem'; continue; }
      if (!recipients.includes(uid)) { excluded[uid] = 'Política da conversa'; continue; }
      const preferences = preferenceSchema.parse((await db.doc(`users/${uid}/settings/preferences`).get()).data() ?? {});
      if (!preferences.pushEnabled || preferences.mutedConversationIds.includes(conversation.id)) { excluded[uid] = 'Preferência pessoal'; continue; }
      if (isQuietTime(preferences, Date.now())) {
        excluded[uid] = 'Horário de silêncio';
        nextAttemptAt = Math.min(nextAttemptAt ?? Infinity, nextQuietEnd(preferences, Date.now()));
        continue;
      }
      const devices = await db.collection(`users/${uid}/devices`).where('enabled', '==', true).get();
      let available = false;
      for (const doc of devices.docs) {
        if (Date.now() >= deadline) { nextAttemptAt = Math.min(nextAttemptAt ?? Infinity, Date.now() + 5000); break recipientsLoop; }
        const device = deviceSchema.parse(doc.data());
        if (!device.token || device.platform === 'web') continue;
        available = true;
        const deliveryKey = `${uid}_${device.id}`;
        if (deliveries[deliveryKey] && deliveries[deliveryKey].state !== 'retryable') continue;
        const latest = conversationSchema.parse((await db.doc(`conversations/${event.conversationId}`).get()).data());
        if (!latest.memberIds.includes(uid) || !latest.memberIds.includes(message.senderId) || !resolveRecipients(latest.notificationPolicy, latest.memberIds, message.senderId, message.mentionedUserIds, latest.type).includes(uid)) { excluded[uid] = 'Participação ou política alterada antes do envio'; continue; }
        // Reserve before the provider call. An ambiguous network failure is never
        // automatically repeated, because the provider might already have accepted it.
        deliveries[deliveryKey] = { state: 'sending', ticketId: null, devicePath: doc.ref.path };
        await ref.update({ delivery: deliveries });
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
          body: JSON.stringify({ to: device.token, title: 'Morrow', sound: 'default', channelId: 'morrow-messages',
            body: preferences.hidePreview || conversation.encrypted ? 'Uma nova mensagem espera por você.' : message.text.slice(0, 120) || 'Você recebeu um arquivo.',
            data: { conversationId: conversation.id, conversationType: conversation.type, messageId: message.id, eventId },
          }), signal: AbortSignal.timeout(Math.max(1000, Math.min(15_000, deadline - Date.now()))),
        }).catch(() => undefined);
        if (!response) { deliveries[deliveryKey].state = 'unknown'; await ref.update({ delivery: deliveries }); continue; }
        if (response.status === 429 || response.status >= 500) {
          deliveries[deliveryKey].state = 'retryable'; await ref.update({ delivery: deliveries });
          nextAttemptAt = Math.min(nextAttemptAt ?? Infinity, Date.now() + 60_000);
          continue;
        }
        if (!response.ok) {
          deliveries[deliveryKey] = { state: 'rejected', ticketId: null, devicePath: doc.ref.path };
          rejected++;
          continue;
        }
        const parsed = expoResponseSchema.parse(await response.json());
        const ticket = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
        deliveries[deliveryKey] = { state: ticket.status === 'ok' ? 'accepted_by_expo' : 'rejected', ticketId: ticket.id ?? null, devicePath: doc.ref.path };
        if (ticket.status === 'ok') accepted++; else rejected++;
        if (ticket.details?.error === 'DeviceNotRegistered') await doc.ref.update({ token: null, updatedAt: Date.now() });
        // Persist each accepted device before processing the next; request replay sees it.
        await ref.update({ delivery: deliveries, providerAccepted: accepted, providerRejected: rejected });
      }
      if (!available) excluded[uid] = 'Nenhum dispositivo habilitado';
    }
    await ref.update({ status: nextAttemptAt === null ? 'completed' : 'deferred', recipients, excluded,
      providerAccepted: accepted, providerRejected: rejected, delivery: deliveries, nextAttemptAt, claim: null });
  } catch (error) {
    console.error(JSON.stringify({ event: 'push.processing.failed', eventId, errorType: error instanceof Error ? error.name : 'UnknownError' }));
    await ref.update({ status: 'retrying', claim: null, nextAttemptAt: Date.now() + 60_000 });
  }
}

export async function runNotificationJobs(): Promise<{ processed: number; receipts: number }> {
  const deadline = Date.now() + 45_000; let processed = 0;
  const pending = await db.collection('notificationEvents').where('nextAttemptAt', '<=', Date.now()).limit(40).get();
  for (const doc of pending.docs) { if (Date.now() + 5000 >= deadline) break; await processEvent(doc.id, deadline - 3000); processed++; }
  const events = await db.collection('notificationEvents').where('createdAt', '>', Date.now() - 86_400_000).orderBy('createdAt', 'desc').limit(100).get();
  let receipts = 0;
  for (const doc of events.docs) {
    if (Date.now() + 5000 >= deadline) break;
    const deliveries = z.record(z.string(), z.object({ state: z.string(), ticketId: z.string().nullable(), devicePath: z.string() })).parse(doc.data().delivery ?? {});
    const waiting = Object.entries(deliveries).filter(([, d]) => d.state === 'accepted_by_expo' && d.ticketId);
    if (!waiting.length) continue;
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify({ ids: waiting.map(([, d]) => d.ticketId) }), signal: AbortSignal.timeout(Math.max(1000, Math.min(15_000, deadline - Date.now()))),
    }).catch(() => undefined);
    if (!response?.ok) continue;
    const result = receiptSchema.parse(await response.json());
    for (const [key, delivery] of waiting) {
      const receipt = result.data[delivery.ticketId ?? ''];
      if (!receipt) continue;
      deliveries[key].state = receipt.status === 'ok' ? 'accepted_by_provider' : 'provider_error';
      if (receipt.details?.error === 'DeviceNotRegistered') await db.doc(delivery.devicePath).update({ token: null, updatedAt: Date.now() });
      receipts++;
    }
    await doc.ref.update({ delivery: deliveries });
  }
  return { processed, receipts };
}
