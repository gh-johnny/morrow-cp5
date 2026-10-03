import { useEffect, useRef } from 'react';
import { candidateSchema, descriptionSchema, type IceServer, type MediaHandle, type PeerCallbacks, type PeerHandle, type SignalType } from './call-types';
const streams = new Map<string, MediaStream>();
function handle(stream: MediaStream): MediaHandle { streams.set(stream.id, stream); return { id: stream.id, hasVideo: stream.getVideoTracks().length > 0, mute: (muted) => stream.getAudioTracks().forEach((track) => { track.enabled = !muted; }), video: (enabled) => stream.getVideoTracks().forEach((track) => { track.enabled = enabled; }), close: () => { stream.getTracks().forEach((track) => track.stop()); streams.delete(stream.id); } }; }
export async function openMedia(video: boolean): Promise<MediaHandle> { if (!navigator.mediaDevices) throw new Error('Abra a chamada em HTTPS ou localhost para usar câmera e microfone.'); return handle(await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: 640, height: 480, frameRate: 24 } : false })); }
export function createPeer(local: MediaHandle, iceServers: IceServer[], callbacks: PeerCallbacks): PeerHandle {
  const stream = streams.get(local.id); if (!stream) throw new Error('Mídia local indisponível.'); const peer = new RTCPeerConnection({ iceServers });
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));
  const remoteStreams = new Map<string, MediaHandle>();
  peer.onicecandidate = (event) => { if (event.candidate) callbacks.signal('candidate', JSON.stringify(event.candidate.toJSON())); };
  peer.ontrack = (event) => { const remote = event.streams[0]; if (remote && !remoteStreams.has(remote.id)) { const media = handle(remote); remoteStreams.set(remote.id, media); callbacks.stream(media); } };
  peer.onconnectionstatechange = () => callbacks.state(peer.connectionState);
  const candidates: string[] = [];
  async function apply(type: SignalType, payload: string) {
    if (type === 'candidate') { if (!peer.remoteDescription) { candidates.push(payload); return; } await peer.addIceCandidate(candidateSchema.parse(JSON.parse(payload))); return; }
    await peer.setRemoteDescription(descriptionSchema.parse(JSON.parse(payload)));
    if (type === 'offer') { await peer.setLocalDescription(await peer.createAnswer()); callbacks.signal('answer', JSON.stringify(peer.localDescription)); }
    for (const candidate of candidates.splice(0)) await peer.addIceCandidate(candidateSchema.parse(JSON.parse(candidate)));
  }
  let serial = Promise.resolve();
  return { offer: async () => { await peer.setLocalDescription(await peer.createOffer()); callbacks.signal('offer', JSON.stringify(peer.localDescription)); },
    receive: (type, payload) => { const next = serial.then(() => apply(type, payload)); serial = next.catch(() => undefined); return next; }, close: () => { peer.close(); remoteStreams.forEach((media) => media.close()); remoteStreams.clear(); } };
}
export function VideoTile({ streamId, local }: { streamId: string; local?: boolean }) { const video = useRef<HTMLVideoElement>(null); useEffect(() => { if (video.current) video.current.srcObject = streams.get(streamId) ?? null; }, [streamId]); return <video ref={video} autoPlay playsInline muted={local} style={{ width: '100%', height: 230, objectFit: 'cover', borderRadius: 16 }} />; }
