import { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight, LockKeyhole, Plus, Users, FlaskConical } from 'lucide-react-native';
import { readMarkerSchema } from '../../shared/read-state';
import { useConversations, usePeople, useCollection } from '../hooks/data';
import { useSession } from '../providers/session';
import { conversationTitle } from '../../shared/domain';
import { Avatar, Button, Card, Chip, Copy, Eyebrow, Field, IconButton, Kite, Row, Screen, State, Title } from '../ui/kit';
import { usePalette } from '../ui/theme';
export default function ConversationsScreen() {
  const { user, profile } = useSession(); const conversations = useConversations(); const people = usePeople(); const colors = usePalette(); const { width } = useWindowDimensions();
  const markers = useCollection(user ? `users/${user.uid}/readMarkers` : null, readMarkerSchema);
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState<'all' | 'group' | 'direct'>('all');
  const items = useMemo(() => conversations.items.filter((conversation) => (filter === 'all' || filter === conversation.type) && conversationTitle(conversation, people.byId, user?.uid ?? '').toLowerCase().includes(search.toLowerCase())), [conversations.items, filter, people.byId, user?.uid, search]);
  const unread = conversations.items.filter((conversation) => conversation.lastSenderId !== user?.uid && conversation.lastMessageAt > (markers.items.find((marker) => marker.conversationId === conversation.id && !marker.threadId)?.lastReadAt ?? 0)).length;
  return <Screen title={`Olá, ${profile?.name.split(' ')[0] ?? 'você'}.`} subtitle="Boas ideias precisam de um lugar para continuar." tabs action={<IconButton icon={Plus} label="Nova conversa" onPress={() => router.push('/people')} />}>
    <Card style={{ backgroundColor: colors.elevated, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: width > 700 ? 30 : 22 }}><View style={{ gap: 10, flex: 1 }}><Eyebrow>SEU ESPAÇO ESTÁ ABERTO</Eyebrow><Title size={width > 700 ? 30 : 24}>Da conversa ao{'\n'}próximo movimento.</Title><Copy muted>{unread ? `${unread} conversa(s) com novidades.` : 'Pessoas, ideias e próximos passos. Tudo conectado.'}</Copy><Row><Button label="Encontrar pessoas" icon={ArrowUpRight} compact onPress={() => router.push('/people')} />{width > 650 ? <Button secondary compact label="Criar grupo" icon={Users} onPress={() => router.push('/group/new')} /> : null}</Row></View><Kite size={width > 700 ? 110 : 75} happy /></Card>
    <Row style={{ justifyContent: 'space-between' }}><Title size={22}>Conversas</Title><Button secondary compact label="Novo grupo" icon={Plus} onPress={() => router.push('/group/new')} /></Row><Field label="Buscar conversas" placeholder="Um nome, uma equipe, uma ideia…" value={search} onChangeText={setSearch} /><Row><Chip label="Todas" selected={filter === 'all'} onPress={() => setFilter('all')} /><Chip label="Equipes" selected={filter === 'group'} onPress={() => setFilter('group')} /><Chip label="Diretas" selected={filter === 'direct'} onPress={() => setFilter('direct')} /></Row>
    {conversations.loading ? <State loading /> : conversations.error ? <State error={conversations.error} /> : !items.length ? <State title="Sua próxima conversa começa aqui." detail="Encontre alguém ou reúna uma equipe em um novo grupo." /> : <View style={{ gap: 10 }}>{items.map((conversation) => {
      const other = people.byId[conversation.memberIds.find((id) => id !== user?.uid) ?? '']; const title = conversationTitle(conversation, people.byId, user?.uid ?? '');
      const isUnread = conversation.lastSenderId !== user?.uid && conversation.lastMessageAt > (markers.items.find((marker) => marker.conversationId === conversation.id && !marker.threadId)?.lastReadAt ?? 0);
      return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${title}`} key={conversation.id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conversation.id } })}><Card style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}><Avatar name={title} url={conversation.type === 'group' ? conversation.photoUrl : other?.photoUrl} size={53} /><View style={{ flex: 1, gap: 3 }}><Row><Title size={17}>{title}</Title>{conversation.encrypted ? <LockKeyhole size={13} color={colors.secondary} /> : null}</Row><Copy muted small>{conversation.lastMessage || 'Um novo espaço para conversar.'}</Copy></View><View style={{ alignItems: 'flex-end', gap: 8 }}><Copy muted small>{conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'novo'}</Copy>{isUnread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}</View></Card></Pressable>;
    })}</View>}<Button secondary label="Explorar o Blackout Lab" icon={FlaskConical} onPress={() => router.push('/sync')} />
  </Screen>;
}
