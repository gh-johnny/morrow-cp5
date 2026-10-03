import { z } from 'zod';

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const uidSchema = z.string().min(1).max(128);
export const policySchema = z.enum(['all_group_messages', 'mentioned_members', 'direct_messages_only', 'disabled']);
export type NotificationPolicy = z.infer<typeof policySchema>;
export const policyLabels: Record<NotificationPolicy, string> = {
  all_group_messages: 'Todas as mensagens', mentioned_members: 'Somente menções',
  direct_messages_only: 'Somente conversas diretas', disabled: 'Desativadas',
};
export const birthDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getTime() <= Date.now();
}, 'Informe uma data de nascimento válida.');
export const profileInputSchema = z.object({
  name: z.string().trim().min(2).max(80), phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
  birthDate: birthDateSchema, photoUrl: z.string().url().max(2000),
}).strict();
export const profileSchema = profileInputSchema.extend({ uid: uidSchema, email: z.string().email(), createdAt: z.number() });
export type Profile = z.infer<typeof profileSchema>;
export const personSchema = z.object({ uid: uidSchema, name: z.string(), photoUrl: z.string() });
export type Person = z.infer<typeof personSchema>;

export const conversationSchema = z.object({
  id: idSchema, type: z.enum(['direct', 'group']), name: z.string(), photoUrl: z.string(),
  ownerId: uidSchema, memberIds: z.array(uidSchema).min(2).max(50), memberLimit: z.number().int().min(2).max(50),
  notificationPolicy: policySchema, encrypted: z.boolean(), membershipVersion: z.number().int(),
  createdAt: z.number(), updatedAt: z.number(), lastMessage: z.string().default(''), lastMessageAt: z.number().default(0),
  lastSenderId: z.string().default(''),
});
export type Conversation = z.infer<typeof conversationSchema>;
export const groupInputSchema = z.object({
  name: z.string().trim().min(2).max(80), photoUrl: z.string().url().max(2000),
  memberIds: z.array(uidSchema).min(1).max(49), memberLimit: z.number().int().min(2).max(50), notificationPolicy: policySchema,
}).strict();
export const groupUpdateSchema = groupInputSchema.partial().strict();

export const attachmentSchema = z.object({
  id: idSchema, name: z.string().max(180), url: z.string().url().max(2000),
  mimeType: z.string().max(100), size: z.number().int().min(1).max(3_000_000),
  kind: z.enum(['image', 'file', 'audio']), duration: z.number().nonnegative().optional(),
  transcript: z.string().max(30_000).optional(),
  segments: z.array(z.object({ start: z.number().nonnegative(), end: z.number().nonnegative(), text: z.string() })).max(1000).optional(),
});
export type Attachment = z.infer<typeof attachmentSchema>;
export const envelopeSchema = z.object({
  recipientUid: uidSchema, recipientDeviceId: idSchema, senderDeviceId: idSchema,
  senderPublicKey: z.string().max(100), nonce: z.string().max(100), ciphertext: z.string().max(40_000),
});
export type Envelope = z.infer<typeof envelopeSchema>;
export const messageInputSchema = z.object({
  id: idSchema, text: z.string().trim().max(8000), mentionedUserIds: z.array(uidSchema).max(50).default([]),
  target: z.enum(['all', 'members']).default('all'), threadId: idSchema.nullable().default(null),
  replyToId: idSchema.nullable().default(null), attachments: z.array(attachmentSchema).max(4).default([]),
  envelopes: z.array(envelopeSchema).max(32).default([]),
}).strict().refine((value) => Boolean(value.text || value.attachments.length || value.envelopes.length), 'A mensagem está vazia.');
export type MessageInput = z.infer<typeof messageInputSchema>;
export const messageSchema = z.object({
  id: idSchema, conversationId: idSchema, conversationType: z.enum(['direct', 'group']), senderId: uidSchema,
  text: z.string(), mentionedUserIds: z.array(uidSchema).default([]), target: z.enum(['all', 'members']),
  threadId: z.string().nullable().default(null), replyToId: z.string().nullable().default(null),
  attachments: z.array(attachmentSchema).default([]), envelopes: z.array(envelopeSchema).default([]),
  createdAt: z.number(), editedAt: z.number().nullable().default(null), deletedAt: z.number().nullable().default(null),
  pinned: z.boolean().default(false), reactions: z.record(z.string(), z.string()).default({}),
  history: z.array(z.object({ text: z.string(), at: z.number() })).default([]),
});
export type Message = z.infer<typeof messageSchema>;
export type LocalMessage = Message & { localStatus?: 'pending' | 'sending' | 'failed'; decrypted?: boolean };
export const taskInputSchema = z.object({
  title: z.string().trim().min(2).max(180), description: z.string().max(3000).default(''),
  assigneeId: uidSchema.nullable().default(null), dueAt: z.number().nullable().default(null),
  sourceMessageId: idSchema.nullable().default(null),
}).strict();
export const taskSchema = taskInputSchema.extend({
  id: idSchema, conversationId: idSchema, authorId: uidSchema, status: z.enum(['todo', 'doing', 'done']),
  checklist: z.array(z.object({ id: idSchema, text: z.string(), done: z.boolean() })).default([]),
  createdAt: z.number(), updatedAt: z.number(),
});
export type Task = z.infer<typeof taskSchema>;
export const pollInputSchema = z.object({
  question: z.string().trim().min(2).max(200), options: z.array(z.string().trim().min(1).max(150)).min(2).max(8),
  type: z.enum(['poll', 'availability']).default('poll'), closesAt: z.number().nullable().default(null),
}).strict().refine((v) => new Set(v.options).size === v.options.length, 'As opções devem ser diferentes.');
export const pollSchema = pollInputSchema.extend({
  id: idSchema, conversationId: idSchema, authorId: uidSchema, closed: z.boolean(),
  votes: z.record(z.string(), z.array(z.number().int().min(0))).default({}), createdAt: z.number(),
});
export type Poll = z.infer<typeof pollSchema>;
export const memoryInputSchema = z.object({
  title: z.string().trim().min(2).max(180), note: z.string().max(8000).default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  sourceMessageIds: z.array(idSchema).max(20).default([]), relatedIds: z.array(idSchema).max(20).default([]),
  kind: z.enum(['decision', 'reference', 'idea']).default('reference'),
}).strict();
export const memorySchema = memoryInputSchema.extend({ id: idSchema, conversationId: idSchema, authorId: uidSchema, createdAt: z.number() });
export type Memory = z.infer<typeof memorySchema>;
export const deviceInputSchema = z.object({
  id: idSchema, token: z.string().max(400).nullable(), platform: z.enum(['android', 'ios', 'web']),
  publicKey: z.string().min(40).max(100), label: z.string().max(100), enabled: z.boolean().default(true),
}).strict();
export const deviceSchema = deviceInputSchema.extend({ uid: uidSchema, updatedAt: z.number() });
export type Device = z.infer<typeof deviceSchema>;
export const preferenceSchema = z.object({
  pushEnabled: z.boolean().default(true), hidePreview: z.boolean().default(false),
  quietEnabled: z.boolean().default(false), quietStart: z.number().int().min(0).max(1439).default(1320),
  quietEnd: z.number().int().min(0).max(1439).default(420), utcOffsetMinutes: z.number().int().min(-840).max(840).default(-180),
  mutedConversationIds: z.array(idSchema).max(200).default([]),
});
export type Preferences = z.infer<typeof preferenceSchema>;
export const preferencesDefault = preferenceSchema.parse({});
export const focusSchema = z.object({
  id: idSchema, conversationId: idSchema, hostId: uidSchema, goal: z.string(),
  durationSeconds: z.number(), startedAt: z.number(), state: z.enum(['running', 'paused', 'completed']),
  remainingAtPause: z.number().nullable().default(null), completedBy: z.array(uidSchema).default([]), updatedAt: z.number(),
});
export type FocusSession = z.infer<typeof focusSchema>;
export type BoardNote = { id: string; x: number; y: number; text: string; color: string; authorId: string };
export type BoardStroke = { id: string; points: { x: number; y: number }[]; color: string; authorId: string };
export const notificationEventSchema = z.object({
  id: z.string(), conversationId: z.string(), messageId: z.string(), senderId: z.string(),
  createdAt: z.number(), status: z.string(), recipients: z.array(z.string()), excluded: z.record(z.string(), z.string()),
  providerAccepted: z.number().default(0), providerRejected: z.number().default(0),
  providerConfirmed: z.number().default(0), providerErrors: z.number().default(0), uncertainDeliveries: z.number().default(0),
  opens: z.array(z.string()).default([]), received: z.array(z.string()).default([]),
  nextAttemptAt: z.number().nullable().default(null),
});
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export const aiAnswerSchema = z.object({
  answer: z.string(), citations: z.array(z.object({ messageId: idSchema, quote: z.string().max(400) })),
  suggestedTasks: z.array(z.object({ title: z.string(), assigneeId: z.string().nullable(), sourceMessageId: z.string().nullable() })),
});
export type AiAnswer = z.infer<typeof aiAnswerSchema>;
export const inviteSchema = z.object({
  id: idSchema, conversationId: idSchema, name: z.string(), createdBy: uidSchema,
  expiresAt: z.number(), revoked: z.boolean(), approvalRequired: z.boolean(),
});
export type Invite = z.infer<typeof inviteSchema>;
