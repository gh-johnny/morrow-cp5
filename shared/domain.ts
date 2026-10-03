import type { Conversation, Message, Preferences, Task, NotificationPolicy } from './contracts';

export function directConversationId(first: string, second: string): string {
  if (first === second) throw new Error('Você não pode conversar consigo mesmo.');
  return `dm_${[first, second].sort().map((uid) => `${uid.length}_${uid}`).join('_')}`;
}

export function validateCapacity(memberIds: readonly string[], limit: number, ownerId: string): string[] {
  if (!Number.isInteger(limit) || limit < 2 || limit > 50) throw new Error('O limite deve ser um inteiro entre 2 e 50.');
  const unique = [...new Set([ownerId, ...memberIds])];
  if (unique.length < 2) throw new Error('O grupo precisa de pelo menos dois integrantes.');
  if (unique.length > limit) throw new Error('O grupo não possui vagas suficientes.');
  return unique;
}

export function resolveRecipients(policy: NotificationPolicy, members: readonly string[], senderId: string,
  mentionedUserIds: readonly string[], type: 'direct' | 'group'): string[] {
  if (policy === 'disabled') return [];
  const allowed = [...new Set(members)].filter((uid) => uid !== senderId);
  if (type === 'direct') return allowed;
  if (policy === 'direct_messages_only') return [];
  if (policy === 'mentioned_members') return allowed.filter((uid) => mentionedUserIds.includes(uid));
  return allowed;
}

export function isQuietTime(preferences: Preferences, now: number): boolean {
  if (!preferences.quietEnabled) return false;
  const local = new Date(now + preferences.utcOffsetMinutes * 60_000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const { quietStart: start, quietEnd: end } = preferences;
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function nextQuietEnd(preferences: Preferences, now: number): number {
  const local = new Date(now + preferences.utcOffsetMinutes * 60_000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const delta = (preferences.quietEnd - minute + 1440) % 1440 || 1440;
  return now + delta * 60_000;
}

export function retryDelay(attempt: number, random = Math.random()): number {
  return Math.round(Math.min(1000 * 2 ** Math.min(attempt, 8), 120_000) * (0.8 + random * 0.4));
}

export type RadarSignal = { id: string; title: string; explanation: string; severity: 'high' | 'medium' | 'low'; taskId?: string; messageId?: string };
export function radarSignals(tasks: readonly Task[], messages: readonly Message[], now: number): RadarSignal[] {
  const overdue = tasks.filter((task) => task.status !== 'done' && task.dueAt !== null && task.dueAt < now)
    .map((task): RadarSignal => ({ id: `late_${task.id}`, title: task.title, severity: 'high', taskId: task.id,
      explanation: `Prazo vencido há ${Math.max(1, Math.floor((now - (task.dueAt ?? now)) / 86_400_000))} dia(s).` }));
  const stalled = tasks.filter((task) => task.status === 'doing' && now - task.updatedAt > 2 * 86_400_000)
    .map((task): RadarSignal => ({ id: `stalled_${task.id}`, title: task.title, severity: 'medium', taskId: task.id,
      explanation: 'Em andamento há mais de dois dias sem atualização.' }));
  const unanswered = messages.filter((message) => message.text.includes('?') && !message.deletedAt &&
    now - message.createdAt > 3_600_000 && !messages.some((reply) => reply.replyToId === message.id || reply.threadId === message.id))
    .slice(-5).map((message): RadarSignal => ({ id: `question_${message.id}`, title: message.text.slice(0, 100),
      severity: 'low', messageId: message.id, explanation: 'Pergunta sem resposta vinculada há mais de uma hora.' }));
  return [...overdue, ...stalled, ...unanswered];
}

export function conversationTitle(conversation: Conversation, people: Readonly<Record<string, { name: string }>>, uid: string): string {
  return conversation.type === 'group' ? conversation.name : people[conversation.memberIds.find((id) => id !== uid) ?? '']?.name ?? 'Conversa direta';
}

export function focusRemaining(session: { durationSeconds: number; startedAt: number; state: string; remainingAtPause: number | null }, now: number): number {
  if (session.state === 'completed') return 0;
  if (session.state === 'paused') return session.remainingAtPause ?? session.durationSeconds;
  return Math.max(0, session.durationSeconds - Math.floor((now - session.startedAt) / 1000));
}
