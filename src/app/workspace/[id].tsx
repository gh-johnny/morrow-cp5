import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Clock, Layers, Video } from 'lucide-react-native';
import { conversationTitle } from '../../../shared/domain';
import { useConversation, usePeople } from '../../hooks/data';
import { useSession } from '../../providers/session';
import { TasksPanel } from '../../features/tasks';
import { PollsPanel } from '../../features/polls';
import { MemoriesPanel } from '../../features/memories';
import { CopilotPanel } from '../../features/copilot';
import { PushObservatory } from '../../features/push-observatory';
import { Button, Card, Chip, Copy, Row, Screen, State, Title } from '../../ui/kit';
const tabs = { tasks: 'Próximos passos', polls: 'Votações', memory: 'Memória', kite: 'Kite', push: 'Push' };
type Tab = keyof typeof tabs;
export default function WorkspaceScreen() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: string }>(); const [tab, setTab] = useState<Tab>(initialTab && initialTab in tabs ? initialTab as Tab : 'tasks');
  const { conversation, error } = useConversation(id); const people = usePeople(); const { user } = useSession();
  if (!conversation) return <Screen title="Seu espaço de equipe" back><State loading={!error} error={error} /></Screen>;
  return <Screen title="Continuem construindo." eyebrow={`ESPAÇO / ${conversationTitle(conversation, people.byId, user?.uid ?? '')}`} back subtitle="Uma conversa pode virar uma decisão, um encontro ou algo que vocês constroem juntos."><Card><Title size={21}>Um lugar para agir em equipe.</Title><Copy muted>Escolha um espaço compartilhado e continue a conversa.</Copy><Row style={{ flexWrap: 'wrap' }}><Button compact secondary icon={Layers} label="Canvas ao vivo" onPress={() => router.push({ pathname: '/board/[id]', params: { id } })} /><Button compact secondary icon={Clock} label="Foco em equipe" onPress={() => router.push({ pathname: '/focus/[id]', params: { id } })} /><Button compact secondary icon={Video} label="Chamada" onPress={() => router.push({ pathname: '/call/[id]', params: { id } })} /></Row></Card><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{Object.entries(tabs).map(([key, label]) => <Chip key={key} label={label} selected={tab === key} onPress={() => setTab(key as Tab)} />)}</View>{tab === 'tasks' ? <TasksPanel conversation={conversation} /> : tab === 'polls' ? <PollsPanel conversation={conversation} /> : tab === 'memory' ? <MemoriesPanel conversation={conversation} /> : tab === 'kite' ? <CopilotPanel conversation={conversation} /> : <PushObservatory conversation={conversation} />}</Screen>;
}
