import { View } from 'react-native';
import { router } from 'expo-router';
import { type Conversation, taskSchema } from '../../shared/contracts';
import { conversationTitle, radarSignals } from '../../shared/domain';
import { useCollection, useConversations, useMessages, useNow, usePeople } from '../hooks/data';
import { useSession } from '../providers/session';
import { Button, Card, Chip, Copy, Screen, State, Title } from '../ui/kit';
export default function RadarScreen() {
  const conversations = useConversations();
  return <Screen title="Perspectiva para seguir." eyebrow="RADAR / SINAIS COM CONTEXTO" tabs subtitle="Prazos vencidos, tarefas paradas e perguntas sem resposta vinculada. Cada sinal explica seu motivo."><Card><Title size={23}>Observe. Converse. Decida.</Title><Copy muted>Radar usa regras visíveis sobre dados reais da equipe. Não atribui produtividade nem inventa pontuações pessoais.</Copy></Card>{conversations.loading ? <State loading /> : conversations.error ? <State error={conversations.error} /> : !conversations.items.length ? <State title="Seu radar começa numa conversa." detail="Entre em uma equipe para acompanhar seus próximos passos." /> : conversations.items.map((conversation) => <TeamRadar key={conversation.id} conversation={conversation} />)}</Screen>;
}
function TeamRadar({ conversation }: { conversation: Conversation }) {
  const tasks = useCollection(`conversations/${conversation.id}/tasks`, taskSchema); const messages = useMessages(conversation); const people = usePeople(); const { user } = useSession();
  const now = useNow(); const signals = radarSignals(tasks.items, messages.items, now);
  return <Card><Title size={22}>{conversationTitle(conversation, people.byId, user?.uid ?? '')}</Title><Copy muted small>{tasks.items.filter((task) => task.status !== 'done').length} tarefa(s) aberta(s) · {signals.length} sinal(is)</Copy>{signals.length ? signals.map((signal) => <View key={signal.id} style={{ gap: 7, paddingVertical: 9 }}><Chip label={{ high: 'Prazo', medium: 'Sem atualização', low: 'Pergunta aberta' }[signal.severity]} /><Title size={17}>{signal.title}</Title><Copy muted small>{signal.explanation}</Copy><Button compact secondary label="Abrir contexto" onPress={() => router.push(signal.messageId ? { pathname: '/chat/[id]', params: { id: conversation.id, message: signal.messageId } } : { pathname: '/workspace/[id]', params: { id: conversation.id, tab: 'tasks' } })} /></View>) : <Copy muted>Sem sinais pelas regras atuais. Há espaço para continuar.</Copy>}</Card>;
}
