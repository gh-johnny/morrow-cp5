import { useLocalSearchParams } from 'expo-router';
import { profileSchema } from '../../../shared/contracts';
import { useApiQuery } from '../../hooks/data';
import { Avatar, Card, Copy, Screen, State, Title } from '../../ui/kit';
export default function ProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>(); const query = useApiQuery(`/users/${uid}`, profileSchema);
  return <Screen title="Uma pessoa, uma conexão." back eyebrow="PERFIL / CONVERSA EM COMUM">{query.loading ? <State loading /> : query.error ? <State error={query.error} /> : query.data ? <Card><Avatar name={query.data.name} url={query.data.photoUrl} size={100} /><Title>{query.data.name}</Title><Copy>{query.data.email}</Copy><Copy>{query.data.phoneNumber}</Copy><Copy>Nascimento: {new Date(`${query.data.birthDate}T12:00:00`).toLocaleDateString('pt-BR')}</Copy><Copy muted small>Você acessa esses dados porque possui uma conversa ou grupo em comum. O servidor valida essa relação a cada solicitação.</Copy></Card> : null}</Screen>;
}
