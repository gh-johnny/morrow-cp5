import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import * as Crypto from 'expo-crypto';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import { onChildAdded, ref } from 'firebase/database';
import { z } from 'zod';
import type { BoardNote, BoardStroke } from '../../shared/contracts';
import { api, friendlyError } from '../services/api';
import { realtime } from '../services/firebase';
import { readJournal, writeJournal } from '../services/journal';
import { useSession } from '../providers/session';
import { useRuntime } from '../store/runtime';
type Change = { updateId: string; update: string };
const queueSchema = z.array(z.object({ updateId: z.string(), update: z.string() }));
const updateSchema = z.object({ update: z.string(), senderId: z.string(), createdAt: z.number() });
const noteSchema = z.object({ id: z.string(), x: z.number(), y: z.number(), text: z.string(), color: z.string(), authorId: z.string() });
const strokeSchema = z.object({ id: z.string(), points: z.array(z.object({ x: z.number(), y: z.number() })), color: z.string(), authorId: z.string() });
export function useBoard(conversationId: string | null) {
  const { user } = useSession(); const document = useRef<Y.Doc | null>(null); const [notes, setNotes] = useState<BoardNote[]>([]); const [strokes, setStrokes] = useState<BoardStroke[]>([]); const [pending, setPending] = useState(0); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!conversationId || !user) return;
    const id = conversationId; const uid = user.uid; const doc = new Y.Doc(); document.current = doc;
    let queue: Change[] = []; let buffered: Uint8Array[] = []; let bufferId = ''; let active = true; let busy = false; let writes = Promise.resolve();
    const refresh = () => {
      setNotes(Array.from(doc.getMap<unknown>('notes').values()).flatMap((note) => { const result = noteSchema.safeParse(note instanceof Y.Map ? note.toJSON() : note); return result.success ? [result.data] : []; }));
      setStrokes(Array.from(doc.getMap<unknown>('strokes').values()).flatMap((stroke) => { const result = strokeSchema.safeParse(stroke); return result.success ? [result.data] : []; }));
    };
    const persist = () => { const pending = buffered.length ? [...queue, { updateId: bufferId, update: encodeBase64(Y.mergeUpdates(buffered)) }] : queue; const value = JSON.stringify(pending); const state = encodeBase64(Y.encodeStateAsUpdate(doc)); writes = writes.then(async () => { await writeJournal(uid, `board-queue-${id}`, value); await writeJournal(uid, `board-state-${id}`, state); }).catch((error) => { if (active) setError(friendlyError(error)); }); };
    const flush = async () => {
      if (!active || busy || useRuntime.getState().blackout || !useRuntime.getState().online) return;
      if (buffered.length) { queue.push({ updateId: bufferId, update: encodeBase64(Y.mergeUpdates(buffered)) }); buffered = []; bufferId = ''; persist(); }
      busy = true;
      try { for (const change of [...queue]) { await api(`/conversations/${id}/board`, z.object({ accepted: z.boolean() }), { method: 'POST', body: change }); queue = queue.filter((entry) => entry.updateId !== change.updateId); persist(); if (active) { setPending(queue.length); setError(null); } } }
      catch (error) { if (active) setError(friendlyError(error)); }
      finally { busy = false; }
    };
    const changes = (update: Uint8Array, origin: unknown) => { refresh(); if (origin !== 'remote') { if (!buffered.length) bufferId = `y_${Crypto.randomUUID().replaceAll('-', '')}`; buffered.push(update); persist(); setPending(queue.length + 1); } };
    doc.on('update', changes);
    let unsubscribe = () => {};
    void (async () => {
      try {
        const [state, storedQueue] = await Promise.all([readJournal(uid, `board-state-${id}`), readJournal(uid, `board-queue-${id}`)]);
        if (!active) return;
        if (state) Y.applyUpdate(doc, decodeBase64(state), 'remote'); queue = queueSchema.parse(JSON.parse(storedQueue ?? '[]')); setPending(queue.length);
        unsubscribe = onChildAdded(ref(realtime, `rooms/${id}/board/updates`), (snapshot) => { try { const change = updateSchema.parse(snapshot.val()); Y.applyUpdate(doc, decodeBase64(change.update), 'remote'); persist(); } catch (error) { setError(friendlyError(error)); } }, (error) => setError(friendlyError(error)));
        await flush();
      } catch (error) { if (active) setError(friendlyError(error)); }
    })();
    const interval = setInterval(() => { void flush(); }, 800);
    return () => { persist(); active = false; unsubscribe(); clearInterval(interval); doc.off('update', changes); doc.destroy(); document.current = null; };
  }, [conversationId, user]);
  function addNote(text: string) {
    const doc = document.current; if (!doc || !user) return;
    const id = `n_${Crypto.randomUUID().replaceAll('-', '')}`;
    doc.transact(() => { const note = new Y.Map<unknown>(); Object.entries({ id, text, x: 30 + notes.length % 4 * 200, y: 30 + Math.floor(notes.length / 4) * 160, color: '#DBF581', authorId: user.uid }).forEach(([key, value]) => note.set(key, value)); doc.getMap<Y.Map<unknown>>('notes').set(id, note); });
  }
  function updateNote(id: string, fields: Partial<BoardNote>) { const doc = document.current; const note = doc?.getMap<Y.Map<unknown>>('notes').get(id); if (!doc || !note) return; doc.transact(() => Object.entries(fields).forEach(([key, value]) => note.set(key, value))); }
  function removeNote(id: string) { document.current?.getMap('notes').delete(id); }
  function addStroke(points: BoardStroke['points'], color: string) { if (!user || points.length < 2) return; const id = `s_${Crypto.randomUUID().replaceAll('-', '')}`; document.current?.getMap<BoardStroke>('strokes').set(id, { id, points, color, authorId: user.uid }); }
  return { notes, strokes, pending, error, addNote, updateNote, removeNote, addStroke };
}
