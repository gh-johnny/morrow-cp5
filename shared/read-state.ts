import { z } from 'zod';

export const readMarkerSchema = z.object({ conversationId: z.string(), threadId: z.string().nullable(), lastReadAt: z.number() });
export const readReceiptSchema = readMarkerSchema.extend({ uid: z.string() });
export const threadSubscriptionSchema = z.object({ uid: z.string(), threadId: z.string(), subscribed: z.boolean(), updatedAt: z.number() });
