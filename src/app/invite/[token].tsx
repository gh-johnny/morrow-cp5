import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { inviteSchema } from '../../../shared/contracts';
import { useApiQuery } from '../../hooks/data';
import { api } from '../../services/api';
import { Avatar, Button, Card, Copy, Screen, State, Title } from '../../ui/kit';
import { notify } from '../../store/runtime';
const schema = inviteSchema.extend({ photoUrl: z.string(), vacancies: z.number() });
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>(); const query = useApiQuery(`/invitations/${token}`, schema);
  return <Screen title="Uma equipe espera por você." back eyebrow="CONVITE / NOVAS CONEXÕES">{query.loading ? <State loading /> : query.error ? <State error={query.error} /> : query.data ? <Card><Avatar name={query.data.name} url={query.data.photoUrl} size={80} /><Title>{query.data.name}</Title><Copy>{query.data.vacancies} vaga(s) disponível(is).</Copy><Copy muted>{query.data.approvalRequired ? 'O proprietário vai analisar seu pedido. Uma solicitação não reserva vaga.' : 'Sua entrada respeita o limite atual do grupo.'}</Copy><Button label={query.data.approvalRequired ? 'Pedir para entrar' : 'Entrar no grupo'} onPress={async () => { const result = await api(`/invitations/${token}/join`, z.object({ conversationId: z.string(), pending: z.boolean() }), { method: 'POST' }); if (result.pending) { notify('Pedido enviado ao proprietário.'); router.replace('/'); } else router.replace({ pathname: '/chat/[id]', params: { id: result.conversationId } }); }} /></Card> : null}</Screen>;
}
