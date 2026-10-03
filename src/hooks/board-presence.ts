import { useCallback, useEffect, useRef } from 'react';
import { onDisconnect, ref, remove, serverTimestamp, set } from 'firebase/database';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { useSession } from '../providers/session';
import { realtime } from '../services/firebase';
import { useRuntime } from '../store/runtime';
import { useNow, useRealtime } from './data';

const cursorSchema = z.object({ x: z.number(), y: z.number(), at: z.number() });
const presenceSchema = z.record(z.string(), z.record(z.string(), cursorSchema));

export function useBoardPresence(id: string | null) {
  const { user } = useSession(); const uid = user?.uid;
  const blackout = useRuntime((state) => state.blackout);
  const now = useNow(10_000);
  const state = useRealtime(id ? `rooms/${id}/board/presence` : null, presenceSchema);
  const position = useRef({ x: 20, y: 20 });
  const publish = useRef<() => void>(() => {});
  useEffect(() => {
    if (!id || !uid || blackout) return;
    const cursor = ref(realtime, `rooms/${id}/board/presence/${uid}/${Crypto.randomUUID()}`);
    let active = true; let lastSent = 0;
    const send = () => {
      if (!active || !useRuntime.getState().online || Date.now() - lastSent < 300) return;
      lastSent = Date.now();
      void set(cursor, { ...position.current, at: serverTimestamp() }).catch(() => undefined);
    };
    publish.current = send;
    void onDisconnect(cursor).remove().then(send).catch(() => undefined);
    const heartbeat = setInterval(send, 15_000);
    return () => { active = false; publish.current = () => {}; clearInterval(heartbeat); void remove(cursor).catch(() => undefined); };
  }, [id, uid, blackout]);
  const move = useCallback((x: number, y: number) => {
    position.current = { x: Math.max(0, Math.min(900, x)), y: Math.max(0, Math.min(10_000, y)) };
    publish.current();
  }, []);
  const cursors = Object.entries(state.value ?? {}).flatMap(([memberId, sessions]) => {
    const latest = Object.values(sessions).sort((a, b) => b.at - a.at)[0];
    return latest && now - latest.at < 45_000 ? [{ uid: memberId, ...latest }] : [];
  });
  return { cursors, move };
}
