import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { memoryInputSchema, memorySchema, pollInputSchema, pollSchema, taskInputSchema, taskSchema } from '../../shared/contracts';
import { db, realtime } from './firebase';
import { conversationIdOf, ApiError, parseId, requireMember, userOf } from './security';
import { createAttention } from './users';

const newId = () => randomUUID().replaceAll('-', '');
export const collaborationRouter = Router({ mergeParams: true });
collaborationRouter.use(async (request, response, next) => {
  try { await requireMember(conversationIdOf(request), userOf(request).uid); next(); } catch (error) { next(error); }
});
collaborationRouter.post('/tasks', async (request, response) => {
  const conversationId = conversationIdOf(request);
  const uid = userOf(request).uid;
  const input = taskInputSchema.parse(request.body);
  if (input.sourceMessageId && !(await realtime.ref(`rooms/${conversationId}/messages/${input.sourceMessageId}`).get()).exists()) throw new ApiError(400, 'Mensagem de origem não encontrada nesta conversa.');
  const conversation = await requireMember(conversationId, uid);
  if (input.assigneeId && !conversation.memberIds.includes(input.assigneeId)) throw new ApiError(400, 'Escolha um integrante ativo.');
  const task = taskSchema.parse({ ...input, id: `t_${newId()}`, conversationId, authorId: uid, status: 'todo', checklist: [], createdAt: Date.now(), updatedAt: Date.now() });
  await db.doc(`conversations/${conversationId}/tasks/${task.id}`).create(task);
  if (task.assigneeId && task.assigneeId !== uid) await createAttention(task.assigneeId, { id: task.id, conversationId, title: task.title, kind: 'task', sourceId: task.id });
  response.status(201).json(task);
});
collaborationRouter.patch('/tasks/:taskId', async (request, response) => {
  const input = z.object({ status: z.enum(['todo', 'doing', 'done']).optional(), title: z.string().trim().min(2).max(180).optional(),
    description: z.string().max(3000).optional(), assigneeId: z.string().nullable().optional(), dueAt: z.number().nullable().optional(),
    checklist: z.array(z.object({ id: z.string().max(160), text: z.string().trim().min(1).max(300), done: z.boolean() })).max(40).optional() }).strict().parse(request.body);
  const conversationId = conversationIdOf(request);
  const conversation = await requireMember(conversationId, userOf(request).uid);
  if (input.assigneeId && !conversation.memberIds.includes(input.assigneeId)) throw new ApiError(400, 'Escolha um integrante ativo.');
  const ref = db.doc(`conversations/${conversationId}/tasks/${parseId(request.params.taskId)}`);
  const { previous, task } = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ApiError(404, 'Esta tarefa não existe.');
    const previous = taskSchema.parse(snapshot.data());
    const task = taskSchema.parse({ ...previous, ...input, updatedAt: Date.now() });
    transaction.set(ref, task);
    return { previous, task };
  });
  if (task.assigneeId && task.assigneeId !== previous.assigneeId && task.assigneeId !== userOf(request).uid) {
    await createAttention(task.assigneeId, { id: `${task.id}_${task.updatedAt}`, conversationId, title: task.title, kind: 'task', sourceId: task.id });
  }
  response.json(task);
});
collaborationRouter.post('/polls', async (request, response) => {
  const conversationId = conversationIdOf(request);
  const input = pollInputSchema.parse(request.body);
  if (input.closesAt !== null && input.closesAt <= Date.now()) throw new ApiError(400, 'O encerramento deve estar no futuro.');
  const poll = pollSchema.parse({ ...input, id: `p_${newId()}`, conversationId, authorId: userOf(request).uid, closed: false, votes: {}, createdAt: Date.now() });
  await db.doc(`conversations/${conversationId}/polls/${poll.id}`).create(poll);
  response.status(201).json(poll);
});
collaborationRouter.post('/polls/:pollId/vote', async (request, response) => {
  const uid = userOf(request).uid;
  const { options } = z.object({ options: z.array(z.number().int().min(0)).max(8) }).strict().parse(request.body);
  const ref = db.doc(`conversations/${conversationIdOf(request)}/polls/${parseId(request.params.pollId)}`);
  const poll = await db.runTransaction(async (transaction) => {
    const existing = pollSchema.parse((await transaction.get(ref)).data());
    if (existing.closed || (existing.closesAt && existing.closesAt <= Date.now())) throw new ApiError(409, 'Esta votação está encerrada.');
    if (options.some((option) => option >= existing.options.length) || (existing.type === 'poll' && options.length > 1)) throw new ApiError(400, 'Seleção inválida.');
    const next = { ...existing, votes: { ...existing.votes, [uid]: [...new Set(options)] } };
    transaction.set(ref, next);
    return next;
  });
  response.json(poll);
});
collaborationRouter.post('/polls/:pollId/close', async (request, response) => {
  const ref = db.doc(`conversations/${conversationIdOf(request)}/polls/${parseId(request.params.pollId)}`);
  const poll = pollSchema.parse((await ref.get()).data());
  const conversation = await requireMember(poll.conversationId, userOf(request).uid);
  if (poll.authorId !== userOf(request).uid && conversation.ownerId !== userOf(request).uid) throw new ApiError(403, 'Somente o autor ou proprietário pode encerrar.');
  await ref.update({ closed: true });
  response.json({ ...poll, closed: true });
});
collaborationRouter.post('/memories', async (request, response) => {
  const conversationId = conversationIdOf(request);
  const input = memoryInputSchema.parse(request.body);
  for (const sourceId of input.sourceMessageIds) if (!(await realtime.ref(`rooms/${conversationId}/messages/${sourceId}`).get()).exists()) throw new ApiError(400, 'Uma fonte não pertence a esta conversa.');
  for (const relatedId of input.relatedIds) if (!(await db.doc(`conversations/${conversationId}/memories/${relatedId}`).get()).exists) throw new ApiError(400, 'Uma conexão de memória não existe nesta conversa.');
  const memory = memorySchema.parse({ ...input, id: `r_${newId()}`, conversationId, authorId: userOf(request).uid, createdAt: Date.now() });
  await db.doc(`conversations/${conversationId}/memories/${memory.id}`).create(memory);
  if (memory.kind === 'decision') {
    const conversation = await requireMember(conversationId, userOf(request).uid);
    for (const uid of conversation.memberIds.filter((uid) => uid !== memory.authorId)) await createAttention(uid, { id: memory.id, conversationId, title: memory.title, kind: 'decision', sourceId: memory.id });
  }
  response.status(201).json(memory);
});
collaborationRouter.post('/threads/:threadId/subscribe', async (request, response) => {
  const id = conversationIdOf(request); const threadId = parseId(request.params.threadId); const uid = userOf(request).uid;
  const { subscribed } = z.object({ subscribed: z.boolean() }).strict().parse(request.body);
  if (!(await realtime.ref(`rooms/${id}/messages/${threadId}`).get()).exists()) throw new ApiError(404, 'Este tópico não existe.');
  await db.doc(`conversations/${id}/threadSubscriptions/${uid}_${threadId}`).set({ uid, threadId, subscribed, updatedAt: Date.now() });
  response.json({ subscribed });
});
collaborationRouter.delete('/memories/:memoryId', async (request, response) => {
  const conversationId = conversationIdOf(request);
  const ref = db.doc(`conversations/${conversationId}/memories/${parseId(request.params.memoryId)}`);
  const memory = memorySchema.parse((await ref.get()).data());
  const conversation = await requireMember(conversationId, userOf(request).uid);
  if (memory.authorId !== userOf(request).uid && conversation.ownerId !== userOf(request).uid) throw new ApiError(403, 'Você não pode remover esta memória.');
  await ref.delete();
  response.json({ deleted: true });
});
