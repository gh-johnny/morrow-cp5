import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, RTCView, mediaDevices, type MediaStream } from 'react-native-webrtc';
import { candidateSchema, descriptionSchema, type IceServer, type MediaHandle, type PeerCallbacks, type PeerHandle, type SignalType } from './call-types';
const streams = new Map<string, MediaStream>();
function handle(stream: MediaStream): MediaHandle { streams.set(stream.id, stream); return { id: stream.id, hasVideo: stream.getVideoTracks().length > 0, mute: (muted) => stream.getAudioTracks().forEach((track) => { track.enabled = !muted; }), video: (enabled) => stream.getVideoTracks().forEach((track) => { track.enabled = enabled; }), close: () => { stream.getTracks().forEach((track) => track.stop()); streams.delete(stream.id); } }; }
export async function openMedia(video: boolean): Promise<MediaHandle> { return handle(await mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user', width: 640, height: 480, frameRate: 24 } : false })); }
export function createPeer(local: MediaHandle, iceServers: IceServer[], callbacks: PeerCallbacks): PeerHandle {
  const stream = streams.get(local.id); if (!stream) throw new Error('Mídia local indisponível.'); const peer = new RTCPeerConnection({ iceServers });
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));
  const remoteStreams = new Map<string, MediaHandle>();
  peer.onicecandidate = (event: unknown) => { const candidate = (event as { candidate: RTCIceCandidate | null }).candidate; if (candidate) callbacks.signal('candidate', JSON.stringify(candidate.toJSON())); };
  peer.ontrack = (event: unknown) => { const remote = (event as { streams: MediaStream[] }).streams[0]; if (remote && !remoteStreams.has(remote.id)) { const media = handle(remote); remoteStreams.set(remote.id, media); callbacks.stream(media); } };
  peer.onconnectionstatechange = () => callbacks.state(peer.connectionState);
  const candidates: string[] = [];
  async function apply(type: SignalType, payload: string) {
    if (type === 'candidate') { if (!peer.remoteDescription) { candidates.push(payload); return; } await peer.addIceCandidate(new RTCIceCandidate(candidateSchema.parse(JSON.parse(payload)))); return; }
    await peer.setRemoteDescription(new RTCSessionDescription(descriptionSchema.parse(JSON.parse(payload))));
    if (type === 'offer') { const answer = descriptionSchema.parse(await peer.createAnswer()); await peer.setLocalDescription(answer); callbacks.signal('answer', JSON.stringify(peer.localDescription)); }
    for (const candidate of candidates.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(candidateSchema.parse(JSON.parse(candidate))));
  }
  let serial = Promise.resolve();
  return { offer: async () => { const offer = descriptionSchema.parse(await peer.createOffer({})); await peer.setLocalDescription(offer); callbacks.signal('offer', JSON.stringify(peer.localDescription)); },
    receive: (type, payload) => { const next = serial.then(() => apply(type, payload)); serial = next.catch(() => undefined); return next; }, close: () => { peer.close(); remoteStreams.forEach((media) => media.close()); remoteStreams.clear(); } };
}
export function VideoTile({ streamId, local }: { streamId: string; local?: boolean }) { const stream = streams.get(streamId); return stream ? <RTCView streamURL={stream.toURL()} objectFit="cover" mirror={local} style={{ width: '100%', height: 230, borderRadius: 16 }} /> : null; }
