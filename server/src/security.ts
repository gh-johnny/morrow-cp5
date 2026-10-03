import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { z } from 'zod';
import { conversationSchema, type Conversation } from '../../shared/contracts';
import { validateCapacity } from '../../shared/domain';
import { auth, db, realtime } from './firebase';

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code = 'INVALID_OPERATION') { super(message); }
}
const users = new WeakMap<Request, DecodedIdToken>();
export function userOf(request: Request): DecodedIdToken {
  const user = users.get(request);
  if (!user) throw new ApiError(401, 'Entre na sua conta para continuar.', 'UNAUTHENTICATED');
  return user;
}
export async function authenticate(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) { next(new ApiError(401, 'Sua sessão precisa ser autenticada.', 'UNAUTHENTICATED')); return; }
  try {
    const user = await auth.verifyIdToken(token, true);
    if (user.firebase.sign_in_provider !== 'password') throw new ApiError(403, 'Use uma conta de e-mail e senha.');
    users.set(request, user);
    next();
  } catch { next(new ApiError(401, 'Sua sessão expirou. Entre novamente.', 'UNAUTHENTICATED')); }
}

export async function requireMember(conversationId: string, uid: string, owner = false): Promise<Conversation> {
  const snapshot = await db.doc(`conversations/${conversationId}`).get();
  if (!snapshot.exists) throw new ApiError(404, 'Conversa não encontrada.', 'NOT_FOUND');
  const conversation = conversationSchema.parse(snapshot.data());
  if (!conversation.memberIds.includes(uid) || (owner && conversation.ownerId !== uid)) {
    throw new ApiError(403, owner ? 'Somente o proprietário pode alterar o grupo.' : 'Você não participa desta conversa.', 'FORBIDDEN');
  }
  return conversation;
}

/** Monotonic versions prevent an older concurrent operation from restoring revoked access. */
export async function projectAcl(conversation: Conversation): Promise<void> {
  await realtime.ref(`rooms/${conversation.id}/access`).transaction((current: unknown) => {
    const previous = z.object({ version: z.number() }).passthrough().safeParse(current);
    if (previous.success && previous.data.version > conversation.membershipVersion) return;
    return { version: conversation.membershipVersion,
      members: Object.fromEntries(conversation.memberIds.map((uid) => [uid, true])) };
  });
}

export function parseId(value: unknown): string {
  return z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).parse(value);
}
export function conversationIdOf(request: Request): string { return parseId(request.params.id); }
export function enforceCapacity(memberIds: readonly string[], limit: number, ownerId: string): string[] {
  try { return validateCapacity(memberIds, limit, ownerId); }
  catch (error) { throw new ApiError(409, error instanceof Error ? error.message : 'Confira as vagas disponíveis.', 'CAPACITY'); }
}

export function handleError(error: unknown, request: Request, response: Response, next: NextFunction) {
  if (response.headersSent) { next(error); return; }
  if (error instanceof z.ZodError) { response.status(400).json({ error: 'Confira os dados informados.', code: 'VALIDATION', details: error.issues.map((issue) => issue.message) }); return; }
  if (error instanceof ApiError) { response.status(error.status).json({ error: error.message, code: error.code }); return; }
  console.error(JSON.stringify({ event: 'api.error', method: request.method, path: request.path,
    errorType: error instanceof Error ? error.name : 'UnknownError' }));
  response.status(500).json({ error: 'Não foi possível concluir agora. Tente novamente.', code: 'SERVER_ERROR' });
}
