import { useState } from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { Camera, Check, Copy as CopyIcon, QrCode, X } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { z } from 'zod';
import { conversationSchema, inviteSchema, policyLabels, policySchema, type Conversation, type Invite, type NotificationPolicy } from '../../shared/contracts';
import { validateCapacity } from '../../shared/domain';
import { useCollection, useConversation, usePeople } from '../hooks/data';
import { useSession } from '../providers/session';
import { api, apiBase } from '../services/api';
import { pickPhoto, uploadFile, type SelectedFile } from '../services/media';
import { notify } from '../store/runtime';
import { Avatar, Button, Card, Chip, Copy, Field, Row, Screen, State, Title } from '../ui/kit';
const joinSchema = z.object({ uid: z.string(), status: z.string(), createdAt: z.number() });
export function GroupForm({ id = '' }: { id?: string }) {
  const { conversation, error } = useConversation(id);
  if (id && !conversation) return <Screen title="Sua equipe" back><State error={error} loading={!error} /></Screen>;
  return <GroupFormFields key={id} id={id} conversation={conversation} />;
}
function GroupFormFields({ id, conversation }: { id: string; conversation: Conversation | null }) {
  const { user } = useSession(); const people = usePeople();
  const joins = useCollection(id ? `conversations/${id}/joinRequests` : null, joinSchema);
  const [name, setName] = useState(conversation?.name ?? ''); const [photo, setPhoto] = useState<SelectedFile | null>(null); const [limit, setLimit] = useState(String(conversation?.memberLimit ?? 8));
  const [members, setMembers] = useState<string[]>(conversation?.memberIds ?? []); const [policy, setPolicy] = useState<NotificationPolicy>(conversation?.notificationPolicy ?? 'all_group_messages');
  const [invite, setInvite] = useState<Invite | null>(null); const [approval, setApproval] = useState(true); const [hours, setHours] = useState('24');
  const owner = !id || conversation?.ownerId === user?.uid;
  const count = new Set([conversation?.ownerId ?? user?.uid, ...members]).size;
  async function save() {
    if (!user) return;
    validateCapacity(members, Number(limit), user.uid);
    const photoUrl = photo ? (await uploadFile(photo, 'group', id || undefined)).url : conversation?.photoUrl;
    if (!photoUrl) throw new Error('Selecione uma foto para o grupo.');
    const next = await api(id ? `/conversations/${id}` : '/conversations/groups', conversationSchema, { method: id ? 'PATCH' : 'POST', body: { name, photoUrl, memberIds: members.filter((uid) => uid !== user.uid), memberLimit: Number(limit), notificationPolicy: policy } });
    notify(id ? 'Grupo atualizado.' : 'Seu grupo está aberto.');
    if (!id) router.replace({ pathname: '/chat/[id]', params: { id: next.id } });
  }
  const inviteUrl = invite ? `${apiBase.replace(/\/api$/, '')}/invite/${invite.id}` : '';
  return <Screen title={id ? 'Seu grupo, suas escolhas.' : 'Reúna sua próxima equipe.'} eyebrow="EQUIPES / CONFIGURAÇÕES" back subtitle={owner ? 'O proprietário conta no limite de integrantes. Toda admissão é validada no servidor.' : 'As configurações são gerenciadas pelo proprietário.'}>
    <Card><Row><Avatar name={name || 'Grupo'} url={conversation?.photoUrl} size={60} /><View style={{ flex: 1 }}><Title size={22}>{name || 'Um novo espaço'}</Title><Copy muted>{count} de {limit || '—'} integrantes</Copy></View></Row>{photo ? <Image source={{ uri: photo.uri }} style={{ width: 80, height: 80, borderRadius: 20 }} /> : null}{owner ? <><Button secondary label="Selecionar foto do grupo" icon={Camera} onPress={async () => { const selected = await pickPhoto(); if (selected) setPhoto(selected); }} /><Field label="Nome do grupo" value={name} onChangeText={setName} /><Field label="Limite de integrantes (2 a 50)" value={limit} onChangeText={setLimit} keyboardType="number-pad" /></> : null}</Card>
    <Card><Title size={20}>Quem faz parte</Title><Copy muted small>O proprietário sempre permanece no grupo. Selecione ao menos mais uma pessoa.</Copy>{people.items.map((person) => {
      const selected = person.uid === conversation?.ownerId || person.uid === user?.uid && !id || members.includes(person.uid);
      return <Row key={person.uid}><Avatar name={person.name} url={person.photoUrl} size={35} /><View style={{ flex: 1 }}><Copy>{person.name}</Copy>{person.uid === (conversation?.ownerId ?? user?.uid) ? <Copy muted small>Proprietário</Copy> : null}</View><Chip label={selected ? 'No grupo' : 'Adicionar'} selected={selected} onPress={owner && person.uid !== (conversation?.ownerId ?? user?.uid) ? () => setMembers(selected ? members.filter((uid) => uid !== person.uid) : [...members, person.uid]) : undefined} /></Row>;
    })}</Card>
    <Card><Title size={20}>Política de notificações</Title><Copy muted small>A mensagem continua visível para todos do grupo. Esta escolha controla somente quem recebe push.</Copy><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{policySchema.options.map((item) => <Chip key={item} label={policyLabels[item]} selected={policy === item} onPress={owner ? () => setPolicy(item) : undefined} />)}</View></Card>
    {owner ? <Button label={id ? 'Salvar configurações' : 'Criar meu grupo'} icon={Check} onPress={save} /> : null}
    {id && owner ? <Card><Title size={20}>Convite com prazo</Title><Field label="Validade em horas (1 a 168)" value={hours} onChangeText={setHours} keyboardType="number-pad" /><Chip label={approval ? 'Aprovação do proprietário: sim' : 'Entrada direta: respeita as vagas'} selected={approval} onPress={() => setApproval(!approval)} /><Button secondary label="Criar convite" icon={QrCode} onPress={async () => setInvite(await api('/invitations', inviteSchema, { method: 'POST', body: { conversationId: id, approvalRequired: approval, hours: Number(hours) } }))} />{invite ? <><View style={{ alignSelf: 'center', backgroundColor: 'white', padding: 14, borderRadius: 16 }}><QRCode value={inviteUrl} size={170} /></View><Copy muted small>Expira em {new Date(invite.expiresAt).toLocaleString('pt-BR')}</Copy><Button label="Copiar link do convite" secondary icon={CopyIcon} onPress={async () => { await Clipboard.setStringAsync(inviteUrl); notify('Link copiado.'); }} /><Button danger label="Revogar convite" icon={X} onPress={async () => { await api(`/invitations/${invite.id}`, z.object({ revoked: z.boolean() }), { method: 'DELETE' }); setInvite(null); }} /></> : null}</Card> : null}
    {owner && joins.items.some((join) => join.status === 'pending') ? <Card><Title size={20}>Pedidos de entrada</Title>{joins.items.filter((join) => join.status === 'pending').map((join) => <Row key={join.uid}><View style={{ flex: 1 }}><Copy>{people.byId[join.uid]?.name ?? 'Nova pessoa'}</Copy></View><Button compact label="Aprovar" onPress={() => api(`/conversations/${id}/join-requests/${join.uid}`, conversationSchema, { method: 'POST', body: { approved: true } })} /><Button compact secondary label="Recusar" onPress={() => api(`/conversations/${id}/join-requests/${join.uid}`, conversationSchema, { method: 'POST', body: { approved: false } })} /></Row>)}</Card> : null}
  </Screen>;
}
