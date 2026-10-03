import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { z } from 'zod';
import { useCollection } from '../hooks/data';
import { useSession } from '../providers/session';
import { Card, Chip, Copy, Row, Screen, State, Title } from '../ui/kit';
const attentionSchema = z.object({ id: z.string(), conversationId: z.string(), title: z.string(), kind: z.string(), sourceId: z.string(), read: z.boolean(), createdAt: z.number() });
const labels: Record<string, string> = { mention: 'Menção', task: 'Sua tarefa', thread: 'Tópico', decision: 'Decisão' };
export default function AttentionScreen() {
  const { user } = useSession(); const data = useCollection(user ? `users/${user.uid}/attention` : null, attentionSchema);
  return <Screen title="O que pede sua atenção." tabs eyebrow="ATENÇÃO / SEU PRÓXIMO PASSO" subtitle="Menções, tarefas e conversas que você acompanha, reunidas num só lugar.">{data.loading ? <State loading /> : data.error ? <State error={data.error} /> : !data.items.length ? <State title="Um pouco de espaço para respirar." detail="Quando alguém mencionar você ou atribuir uma tarefa, ela aparece aqui." /> : [...data.items].sort((a, b) => b.createdAt - a.createdAt).map((item) => <Pressable key={item.id} onPress={() => router.push(item.kind === 'task' || item.kind === 'decision' ? { pathname: '/workspace/[id]', params: { id: item.conversationId, tab: item.kind === 'task' ? 'tasks' : 'memory' } } : { pathname: '/chat/[id]', params: { id: item.conversationId, ...(item.kind === 'thread' ? { thread: item.sourceId } : { message: item.sourceId }) } })}><Card><Row style={{ justifyContent: 'space-between' }}><Chip label={labels[item.kind] ?? item.kind} selected={!item.read} /><Copy muted small>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</Copy></Row><Title size={19}>{item.title}</Title><Copy muted small>{item.read ? 'Você já abriu esta conversa.' : 'Uma novidade espera por você.'}</Copy></Card></Pressable>)}</Screen>;
}
