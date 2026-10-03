import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { onChildAdded, onDisconnect, onValue, ref, remove } from 'firebase/database';
import * as Crypto from 'expo-crypto';
import { Mic, MicOff, PhoneOff, Video } from 'lucide-react-native';
import { z } from 'zod';
import { useConversation, usePeople } from '../../hooks/data';
import { useSession } from '../../providers/session';
import { api, friendlyError } from '../../services/api';
import { realtime } from '../../services/firebase';
import { createPeer, openMedia, VideoTile } from '../../services/call-media';
import { callConfigSchema, type MediaHandle, type PeerHandle } from '../../services/call-types';
import { Button, Card, Chip, Copy, Row, Screen, State, Title } from '../../ui/kit';
const participantsSchema = z.record(z.string(), z.object({ joinedAt: z.number(), video: z.boolean() }));
const signalSchema = z.object({ senderId: z.string(), type: z.enum(['offer', 'answer', 'candidate']), payload: z.string(), createdAt: z.number() });
export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { conversation, error: accessError } = useConversation(id); const { user } = useSession(); const people = usePeople();
  const [joined, setJoined] = useState(false); const [video, setVideo] = useState(true); const [muted, setMuted] = useState(false); const [turn, setTurn] = useState(false); const [error, setError] = useState<string | null>(null); const [local, setLocal] = useState<MediaHandle | null>(null); const [remote, setRemote] = useState<Record<string, MediaHandle>>({}); const [states, setStates] = useState<Record<string, string>>({});
  const teardown = useRef<() => void>(() => {});
  useEffect(() => { return () => teardown.current(); }, []);
  useEffect(() => { if (!conversation && joined) teardown.current(); }, [conversation, joined]);
  async function join() {
    if (!user || !conversation) return;
    setError(null);
    const config = await api(`/conversations/${id}/call/config`, callConfigSchema); const media = await openMedia(video); const peers = new Map<string, PeerHandle>(); const startedAt = Date.now(); let active = true;
    try { await api(`/conversations/${id}/call/join`, z.object({ joined: z.boolean() }), { method: 'POST', body: { video } }); }
    catch (error) { media.close(); throw error; }
    setTurn(config.turnConfigured); setLocal(media); setJoined(true);
    const ensurePeer = (uid: string) => {
      let peer = peers.get(uid); if (peer) return peer;
      peer = createPeer(media, config.iceServers, { signal: (type, payload) => { if (active) void api(`/conversations/${id}/call/signal`, z.object({ sent: z.boolean() }), { method: 'POST', body: { recipientId: uid, type, payload, signalId: `s_${Crypto.randomUUID().replaceAll('-', '')}` } }).catch((error) => setError(friendlyError(error))); }, stream: (handle) => { if (active) setRemote((current) => ({ ...current, [uid]: handle })); }, state: (state) => { if (active) setStates((current) => ({ ...current, [uid]: state })); } }); peers.set(uid, peer); return peer;
    };
    const signalsRef = ref(realtime, `rooms/${id}/call/signals/${user.uid}`);
    const unsubscribeSignals = onChildAdded(signalsRef, (snapshot) => { const result = signalSchema.safeParse(snapshot.val()); if (!result.success || result.data.createdAt < startedAt - 3000) return; const signal = result.data; void ensurePeer(signal.senderId).receive(signal.type, signal.payload).then(() => remove(snapshot.ref)).catch((error) => setError(friendlyError(error))); }, (error) => setError(friendlyError(error)));
    const unsubscribeParticipants = onValue(ref(realtime, `rooms/${id}/call/participants`), (snapshot) => {
      const participants = participantsSchema.parse(snapshot.val() ?? {});
      for (const [uid, participant] of Object.entries(participants)) if (uid !== user.uid && Date.now() - participant.joinedAt < 120_000 && !peers.has(uid)) { const peer = ensurePeer(uid); if (user.uid < uid) void peer.offer().catch((error) => setError(friendlyError(error))); }
      for (const [uid, peer] of peers) if (!participants[uid]) { peer.close(); peers.delete(uid); setRemote((current) => { const next = { ...current }; delete next[uid]; return next; }); setStates((current) => { const next = { ...current }; delete next[uid]; return next; }); }
    }, (error) => { setError(friendlyError(error)); teardown.current(); setJoined(false); });
    void onDisconnect(ref(realtime, `rooms/${id}/call/participants/${user.uid}`)).remove(); void onDisconnect(signalsRef).remove();
    const heartbeat = setInterval(() => { void api(`/conversations/${id}/call/join`, z.object({ joined: z.boolean() }), { method: 'POST', body: { video } }).catch((error) => setError(friendlyError(error))); }, 30_000);
    teardown.current = () => { if (!active) return; active = false; clearInterval(heartbeat); unsubscribeSignals(); unsubscribeParticipants(); media.close(); peers.forEach((peer) => peer.close()); peers.clear(); void api(`/conversations/${id}/call/leave`, z.object({ left: z.boolean() }), { method: 'POST' }).catch(() => undefined); };
  }
  if (!conversation) return <Screen title="Chamada em equipe" back><State error={accessError} loading={!accessError} /></Screen>;
  return <Screen title="Mais perto, por um momento." back eyebrow="CHAMADA / VOZ E VÍDEO" subtitle="Até quatro integrantes. O sinal encontra vocês; áudio e vídeo seguem entre os participantes.">{joined ? <><Card><Row><Chip label="Na sala" selected /><Copy muted>{turn ? 'Rede com retransmissão disponível' : 'Conexão direta disponível'} · {Object.keys(remote).length + 1} pessoa(s)</Copy></Row><View style={{ gap: 16 }}>{local ? <View><VideoTile streamId={local.id} local /><Copy muted small>Você · {muted ? 'microfone desligado' : 'microfone ligado'}</Copy></View> : null}{Object.entries(remote).map(([uid, stream]) => <View key={uid}><VideoTile streamId={stream.id} /><Title size={18}>{people.byId[uid]?.name ?? 'Integrante'}</Title><Copy muted small>{states[uid] ?? 'Conectando'}</Copy></View>)}</View><Row style={{ flexWrap: 'wrap' }}><Button secondary label={muted ? 'Ligar microfone' : 'Silenciar'} icon={muted ? MicOff : Mic} onPress={() => { local?.mute(!muted); setMuted(!muted); }} /><Button secondary icon={Video} disabled={!local?.hasVideo} label={!local?.hasVideo ? 'Chamada somente voz' : video ? 'Desligar câmera' : 'Ligar câmera'} onPress={() => { local?.video(!video); setVideo(!video); }} /><Button danger label="Sair da chamada" icon={PhoneOff} onPress={() => { teardown.current(); setJoined(false); setLocal(null); setRemote({}); setStates({}); }} /></Row>{!Object.keys(remote).length ? <Copy muted>Seu espaço está aberto. Outra pessoa da conversa pode entrar nesta mesma sala.</Copy> : null}</Card>{Object.entries(states).map(([uid, state]) => <Copy key={uid} small muted>{people.byId[uid]?.name ?? 'Integrante'} · {state}</Copy>)}</> : <Card><Title size={24}>Vamos nos encontrar?</Title><Copy muted>Autorize câmera e microfone para participar. Você pode começar somente com áudio.</Copy><Row><Chip label="Voz + vídeo" selected={video} onPress={() => setVideo(true)} /><Chip label="Somente voz" selected={!video} onPress={() => setVideo(false)} /></Row><Button label="Entrar na sala" icon={Video} onPress={join} /></Card>}{error ? <Copy>{error}</Copy> : null}{joined && !turn ? <Copy muted small>Esta sala usa conexão direta. Redes que bloqueiam essa comunicação exigem um servidor de retransmissão configurado.</Copy> : null}</Screen>;
}
