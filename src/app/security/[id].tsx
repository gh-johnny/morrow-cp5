import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Check, LockKeyhole, QrCode, Shield, Trash2 } from 'lucide-react-native';
import { z } from 'zod';
import { conversationSchema, deviceSchema } from '../../../shared/contracts';
import { useApiQuery, useConversation, usePeople } from '../../hooks/data';
import { useSession } from '../../providers/session';
import { api } from '../../services/api';
import { identityFor, keyFingerprint } from '../../services/device-identity';
import { readJournal, writeJournal } from '../../services/journal';
import { notify } from '../../store/runtime';
import { Button, Card, Chip, Copy, Row, Screen, State, Title } from '../../ui/kit';
const devicesSchema = z.array(deviceSchema.omit({ token: true }));
const verificationSchema = z.object({ kind: z.literal('morrow-key'), uid: z.string(), deviceId: z.string(), publicKey: z.string() });
export default function SecurityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { conversation, error } = useConversation(id); const devices = useApiQuery(conversation ? `/conversations/${id}/devices` : null, devicesSchema); const people = usePeople(); const { user } = useSession();
  const [selfId, setSelfId] = useState(''); const [fingerprints, setFingerprints] = useState<Record<string, string>>({}); const [verified, setVerified] = useState<string[]>([]); const [scanning, setScanning] = useState(false); const [permission, requestPermission] = useCameraPermissions();
  useEffect(() => { if (!user) return; void identityFor(user.uid).then((identity) => setSelfId(identity.deviceId)); void readJournal(user.uid, `verified-${id}`).then((value) => { if (value) setVerified(z.array(z.string()).parse(JSON.parse(value))); }); }, [user, id]);
  useEffect(() => { if (devices.data) void Promise.all(devices.data.map(async (device) => [device.id, await keyFingerprint(device.publicKey)] as const)).then((pairs) => setFingerprints(Object.fromEntries(pairs))); }, [devices.data]);
  async function verify(value: string) {
    setScanning(false); const parsed = verificationSchema.safeParse(JSON.parse(value)); if (!parsed.success) throw new Error('Este QR não é uma identidade Morrow.');
    const device = devices.data?.find((device) => device.uid === parsed.data.uid && device.id === parsed.data.deviceId && device.publicKey === parsed.data.publicKey && device.enabled);
    if (!device || !user) throw new Error('A chave do QR não corresponde a um dispositivo ativo desta conversa.');
    const next = [...new Set([...verified, device.publicKey])]; await writeJournal(user.uid, `verified-${id}`, JSON.stringify(next)); setVerified(next); notify('Identidade do dispositivo conferida pelo QR.');
  }
  if (!conversation) return <Screen title="Identidades e proteção" back><State loading={!error} error={error} /></Screen>;
  const self = devices.data?.find((device) => device.id === selfId);
  return <Screen title="Confiança entre dispositivos." back eyebrow="SEGURANÇA / IDENTIDADES VERIFICÁVEIS" subtitle="Texto cifrado para cada dispositivo participante. Chaves privadas permanecem no cofre local."><Card><Row><LockKeyhole size={34} color="#A8CBC2" /><View style={{ flex: 1 }}><Title size={22}>{conversation.encrypted ? 'Proteção de texto ativa' : 'Proteção de texto disponível'}</Title><Copy muted>NaCl · Curve25519 + XSalsa20-Poly1305</Copy></View></Row><Copy>Este modo protege novas mensagens de texto em conversas diretas. Arquivos, chamadas, metadados e mensagens anteriores possuem tratamento próprio.</Copy><Copy muted small>Os novos envelopes incluem somente os dispositivos ativos naquele envio. Um dispositivo novo não consegue abrir automaticamente o histórico protegido. A revogação impede novos envelopes e conserva cópias já recebidas.</Copy><Button icon={Shield} label={conversation.encrypted ? 'Desativar proteção de texto' : 'Ativar proteção de texto'} onPress={() => api(`/conversations/${id}/encryption`, conversationSchema, { method: 'POST', body: { enabled: !conversation.encrypted } })} /></Card>
    {self ? <Card><Title size={21}>Sua identidade neste dispositivo</Title><View style={{ alignSelf: 'center', backgroundColor: 'white', borderRadius: 14, padding: 15 }}><QRCode value={JSON.stringify({ kind: 'morrow-key', uid: self.uid, deviceId: self.id, publicKey: self.publicKey })} size={190} /></View><Copy small muted>{fingerprints[self.id]}</Copy><Copy muted small>Mostre este QR para a outra pessoa conferir a identidade registrada.</Copy></Card> : null}
    {Platform.OS !== 'web' ? <Button secondary icon={QrCode} label="Conferir QR de outro dispositivo" onPress={async () => { const result = permission?.granted ? permission : await requestPermission(); if (!result.granted) throw new Error('Permita a câmera para conferir a identidade.'); setScanning(true); }} /> : <Copy muted small>No navegador, compare o fingerprint por um canal confiável. A leitura de QR está disponível no app.</Copy>}
    {scanning ? <CameraView style={{ height: 280, borderRadius: 18 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(event) => { void verify(event.data).catch((error) => notify(error instanceof Error ? error.message : 'QR inválido.')); }} /> : null}
    {devices.error ? <State error={devices.error} /> : devices.loading ? <State loading /> : devices.data?.map((device) => <Card key={`${device.uid}-${device.id}`}><Row><Title size={18}>{people.byId[device.uid]?.name ?? 'Integrante'}</Title><Chip label={device.id === selfId ? 'Este dispositivo' : device.platform} /></Row><Copy>{device.label}</Copy><Copy muted small>{fingerprints[device.id]}</Copy><Chip label={verified.includes(device.publicKey) ? '✓ Verificado localmente' : 'Ainda não conferido'} selected={verified.includes(device.publicKey)} />{device.uid !== user?.uid ? <Button compact secondary icon={Check} label="Comparei o fingerprint por outro canal" onPress={async () => { if (!user) return; const next = [...new Set([...verified, device.publicKey])]; await writeJournal(user.uid, `verified-${id}`, JSON.stringify(next)); setVerified(next); }} /> : device.id !== selfId ? <Button compact danger icon={Trash2} label="Revogar meu dispositivo" onPress={async () => { await api(`/users/me/devices/${device.id}`, z.object({ revoked: z.boolean() }), { method: 'DELETE' }); await devices.refresh(); }} /> : null}</Card>)}
  </Screen>;
}
