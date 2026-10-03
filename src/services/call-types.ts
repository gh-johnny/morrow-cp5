import { z } from 'zod';
export const callConfigSchema = z.object({ iceServers: z.array(z.object({ urls: z.union([z.string(), z.array(z.string())]), username: z.string().optional(), credential: z.string().optional() })), turnConfigured: z.boolean(), maxParticipants: z.number() });
export type IceServer = z.infer<typeof callConfigSchema>['iceServers'][number];
export type SignalType = 'offer' | 'answer' | 'candidate';
export type MediaHandle = { id: string; hasVideo: boolean; mute: (muted: boolean) => void; video: (enabled: boolean) => void; close: () => void };
export type PeerHandle = { offer: () => Promise<void>; receive: (type: SignalType, payload: string) => Promise<void>; close: () => void };
export type PeerCallbacks = { signal: (type: SignalType, payload: string) => void; stream: (handle: MediaHandle) => void; state: (state: string) => void };
export const descriptionSchema = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string() });
export const candidateSchema = z.object({ candidate: z.string(), sdpMid: z.string().nullable().optional(), sdpMLineIndex: z.number().nullable().optional(), usernameFragment: z.string().nullable().optional() });
