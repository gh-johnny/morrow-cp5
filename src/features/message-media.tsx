import { useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, useAudioSampleListener } from 'expo-audio';
import { FileText, Pause, Play, Sparkles } from 'lucide-react-native';
import { z } from 'zod';
import type { Attachment } from '../../shared/contracts';
import { api } from '../services/api';
import { Button, Copy, Row, useSignedMedia } from '../ui/kit';
import { usePalette } from '../ui/theme';
export function MessageMedia({ attachment, conversationId, messageId }: { attachment: Attachment; conversationId: string; messageId: string }) {
  const signed = useSignedMedia(attachment.url); const colors = usePalette();
  if (attachment.kind === 'audio') return <AudioMessage attachment={attachment} signed={signed} conversationId={conversationId} messageId={messageId} />;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${attachment.name}`} onPress={() => { if (signed) void Linking.openURL(signed); }}>{attachment.kind === 'image' ? <Image source={signed ? { uri: signed } : undefined} style={{ width: 230, maxWidth: '100%', height: 170, borderRadius: 12, backgroundColor: colors.elevated }} resizeMode="cover" /> : <Row><FileText size={22} color={colors.secondary} /><View><Copy>{attachment.name}</Copy><Copy muted small>{Math.round(attachment.size / 1000)} KB · abrir arquivo</Copy></View></Row>}</Pressable>;
}
function AudioMessage({ attachment, signed, conversationId, messageId }: { attachment: Attachment; signed: string | null; conversationId: string; messageId: string }) {
  const player = useAudioPlayer(signed); const status = useAudioPlayerStatus(player); const colors = usePalette(); const [speed, setSpeed] = useState(1); const [samples, setSamples] = useState<number[]>([]);
  useAudioSampleListener(player, (sample) => { const frames = sample.channels[0]?.frames ?? []; const step = Math.max(1, Math.floor(frames.length / 28)); const amplitudes = Array.from({ length: 28 }, (_, index) => Math.min(1, Math.abs(frames[index * step] ?? 0) * 4)); setSamples(amplitudes); });
  return <View style={{ gap: 9, minWidth: 225 }}><Row><Button compact secondary label={status.playing ? 'Pausar áudio' : 'Ouvir áudio'} icon={status.playing ? Pause : Play} disabled={!signed} onPress={async () => { if (status.playing) player.pause(); else { if (status.didJustFinish) await player.seekTo(0); player.play(); } }} /><Button compact secondary label={`${speed}×`} onPress={() => { const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1; setSpeed(next); player.setPlaybackRate(next); }} /></Row>
    <Row style={{ gap: 3, height: 30 }}>{samples.length ? samples.map((level, index) => <View key={index} style={{ width: 4, height: Math.max(3, level * 28), backgroundColor: colors.secondary, borderRadius: 3 }} />) : <View style={{ height: 3, flex: 1, borderRadius: 3, backgroundColor: colors.border }} />}<Copy muted small>{Math.floor(status.currentTime)} / {Math.floor(status.duration || attachment.duration || 0)}s</Copy></Row>
    {attachment.transcript ? <><Copy small>{attachment.transcript}</Copy><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{attachment.segments?.map((segment, index) => <Pressable key={index} onPress={() => { void player.seekTo(segment.start); player.play(); }}><Copy small muted>{Math.floor(segment.start)}s · {segment.text.slice(0, 55)}</Copy></Pressable>)}</View></> : <Button compact secondary icon={Sparkles} label="Transcrever com Kite" onPress={() => api(`/conversations/${conversationId}/ai/transcribe`, z.object({ transcript: z.string(), segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })) }), { method: 'POST', body: { assetId: attachment.id, messageId } })} />}
  </View>;
}
