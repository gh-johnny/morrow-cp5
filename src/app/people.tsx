import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle, QrCode } from 'lucide-react-native';
import { usePeople } from '../hooks/data';
import { useSession } from '../providers/session';
import { api } from '../services/api';
import { conversationSchema } from '../../shared/contracts';
import { Avatar, Button, Card, Copy, Field, Row, Screen, State, Title } from '../ui/kit';
export default function PeopleScreen() {
  const people = usePeople(); const { user } = useSession(); const [search, setSearch] = useState('');
  const items = useMemo(() => people.items.filter((person) => person.uid !== user?.uid && person.name.toLowerCase().includes(search.toLowerCase())), [people.items, user?.uid, search]);
  return <Screen title="Encontre sua próxima conversa." eyebrow="PESSOAS / CONEXÕES" back subtitle="Aqui aparecem apenas nome e foto. Inicie uma conversa para acessar o perfil completo."><Button secondary icon={QrCode} label="Abrir convite de um grupo" onPress={() => router.push('/join')} /><Field label="Buscar pessoas" value={search} onChangeText={setSearch} placeholder="Nome da pessoa" />{people.loading ? <State loading /> : people.error ? <State error={people.error} /> : !items.length ? <State title="Ainda está tranquilo por aqui." detail="Convide sua equipe para criar uma conta no Morrow." /> : items.map((person) => <Card key={person.uid}><Row><Avatar name={person.name} url={person.photoUrl} /><View style={{ flex: 1 }}><Title size={18}>{person.name}</Title><Copy muted small>Disponível para uma nova conversa</Copy></View><Button compact icon={MessageCircle} label="Conversar" onPress={async () => { const conversation = await api('/conversations/direct', conversationSchema, { method: 'POST', body: { recipientId: person.uid } }); router.push({ pathname: '/chat/[id]', params: { id: conversation.id } }); }} /></Row></Card>)}</Screen>;
}
