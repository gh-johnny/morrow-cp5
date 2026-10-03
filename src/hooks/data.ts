import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { limitToLast, onValue, orderByChild, query as realtimeQuery, ref, set, serverTimestamp } from 'firebase/database';
import { z, type ZodType } from 'zod';
import { conversationSchema, personSchema, messageSchema, type Conversation, type LocalMessage } from '../../shared/contracts';
import { decryptEnvelope } from '../../shared/encryption';
import { firestore, realtime } from '../services/firebase';
import { api, friendlyError } from '../services/api';
import { identityFor } from '../services/device-identity';
import { localMessages, outboxSnapshot, subscribeOutbox } from '../services/outbox';
import { readJournal, writeJournal } from '../services/journal';
import { useSession } from '../providers/session';
import { useRuntime } from '../store/runtime';

type ListState<T> = { key: string; items: T[]; loading: boolean; error: string | null };
export function useCollection<T>(path: string | null, schema: ZodType<T>, memberUid?: string) {
  const { user } = useSession(); const uid = user?.uid; const blackout = useRuntime((state) => state.blackout);
  const key = `${uid ?? ''}/${path ?? ''}`;
  const [state, setState] = useState<ListState<T>>({ key: '', items: [], loading: true, error: null });
  useEffect(() => {
    if (!path || !uid) return;
    let active = true; let received = false;
    const cacheName = `collection-${path.replaceAll('/', '-')}`;
    void readJournal(uid, cacheName).then((cached) => { if (active && !received && cached) setState({ key, items: z.array(schema).parse(JSON.parse(cached)), loading: false, error: null }); }).catch(() => undefined);
    if (blackout) return () => { active = false; };
    const source = memberUid ? query(collection(firestore, path), where('memberIds', 'array-contains', memberUid)) : collection(firestore, path);
    const unsubscribe = onSnapshot(source, (snapshot) => {
      received = true;
      try { const items = snapshot.docs.map((document) => schema.parse(document.data())); setState({ key, items, loading: false, error: null }); void writeJournal(uid, cacheName, JSON.stringify(items)); }
      catch (error) { setState({ key, items: [], loading: false, error: friendlyError(error) }); }
    }, (error) => { received = true; setState({ key, items: [], loading: false, error: friendlyError(error) }); });
    return () => { active = false; unsubscribe(); };
  }, [path, schema, memberUid, uid, blackout, key]);
  return state.key === key ? state : { items: [] as T[], loading: Boolean(path && uid), error: null };
}
export function useConversations() {
  const { user } = useSession(); const data = useCollection(user ? 'conversations' : null, conversationSchema, user?.uid);
  const items = useMemo(() => [...data.items].sort((a, b) => b.lastMessageAt - a.lastMessageAt), [data.items]);
  return { ...data, items };
}
export function usePeople() {
  const data = useCollection('directory', personSchema);
  const byId = useMemo(() => Object.fromEntries(data.items.map((person) => [person.uid, person])), [data.items]);
  return { ...data, byId };
}
export function useConversation(id: string) {
  const { user } = useSession(); const uid = user?.uid; const key = `${uid ?? ''}/${id}`;
  const [state, setState] = useState<{ key: string; conversation: Conversation | null; error: string | null }>({ key: '', conversation: null, error: null });
  useEffect(() => {
    if (!uid || !id) return;
    let active = true; let received = false;
    void (async () => {
      const cached = await readJournal(uid, `conversation-${id}`);
      const list = cached ? null : await readJournal(uid, 'collection-conversations');
      const result = conversationSchema.safeParse(cached ? JSON.parse(cached) : list ? z.array(conversationSchema).parse(JSON.parse(list)).find((conversation) => conversation.id === id) : null);
      if (active && !received && result.success && result.data.memberIds.includes(uid)) setState({ key, conversation: result.data, error: null });
    })().catch(() => undefined);
    const unsubscribe = onSnapshot(doc(firestore, 'conversations', id), (snapshot) => {
      if (!snapshot.exists() && snapshot.metadata.fromCache) return;
      received = true;
      if (!snapshot.exists()) { setState({ key, conversation: null, error: 'Conversa não encontrada.' }); return; }
      const result = conversationSchema.safeParse(snapshot.data());
      setState({ key, conversation: result.success ? result.data : null, error: result.success ? null : 'Os dados da conversa são inválidos.' });
      if (result.success) void writeJournal(uid, `conversation-${id}`, JSON.stringify(result.data));
    }, (error) => { received = true; setState({ key, conversation: null, error: friendlyError(error) }); });
    return () => { active = false; unsubscribe(); };
  }, [id, uid, key]);
  return state.key === key ? state : { conversation: null, error: null };
}
export function useMessages(conversation: Conversation | null) {
  const { user } = useSession(); const uid = user?.uid; const id = conversation?.id; const key = `${uid ?? ''}/${id ?? ''}`;
  const [state, setState] = useState<ListState<LocalMessage>>({ key: '', items: [], loading: true, error: null });
  const entries = useSyncExternalStore(subscribeOutbox, outboxSnapshot, outboxSnapshot); const blackout = useRuntime((state) => state.blackout);
  useEffect(() => {
    if (!id || !uid) return;
    let active = true; let sequence = 0; let received = false;
    const name = `messages-${id}`;
    async function decode(values: unknown[]) {
      const identity = await identityFor(uid!);
      return values.map((value): LocalMessage => {
        const message = messageSchema.parse(value); const envelope = message.envelopes.find((envelope) => envelope.recipientDeviceId === identity.deviceId);
        if (!message.envelopes.length) return message;
        if (!envelope) return { ...message, text: 'Mensagem protegida · este dispositivo não recebeu uma cópia.' };
        try { return { ...message, text: decryptEnvelope(envelope, identity), decrypted: true }; }
        catch { return { ...message, text: 'Não foi possível verificar esta mensagem protegida.' }; }
      });
    }
    void readJournal(uid, name).then(async (cached) => { if (cached) { const items = await decode(JSON.parse(cached) as unknown[]); if (active && !received) setState({ key, items, loading: false, error: null }); } else if (active && blackout) setState({ key, items: [], loading: false, error: null }); }).catch(() => undefined);
    if (blackout) return () => { active = false; };
    const unsubscribe = onValue(realtimeQuery(ref(realtime, `rooms/${id}/messages`), orderByChild('createdAt'), limitToLast(200)), (snapshot) => {
      received = true; const revision = ++sequence; const values: unknown[] = Object.values(snapshot.val() ?? {});
      void decode(values).then((items) => { if (!active || revision !== sequence) return; setState({ key, items, loading: false, error: null }); void writeJournal(uid, name, JSON.stringify(values)); }).catch((error) => { if (active) setState({ key, items: [], loading: false, error: friendlyError(error) }); });
    }, (error) => { received = true; setState({ key, items: [], loading: false, error: friendlyError(error) }); });
    return () => { active = false; unsubscribe(); };
  }, [id, uid, blackout, key]);
  const items = useMemo(() => {
    const remote = state.key === key ? state.items : []; const local = conversation ? localMessages(conversation, entries) : [];
    return [...remote, ...local.filter((message) => !remote.some((saved) => saved.id === message.id))].sort((a, b) => a.createdAt - b.createdAt);
  }, [state, key, conversation, entries]);
  return { items, loading: Boolean(id && uid) && (state.key !== key || state.loading), error: state.key === key ? state.error : null };
}
export function useRealtime<T>(path: string | null, schema: ZodType<T>) {
  const [state, setState] = useState<{ path: string; value: T | null; error: string | null }>({ path: '', value: null, error: null });
  useEffect(() => {
    if (!path) return;
    return onValue(ref(realtime, path), (snapshot) => {
      if (!snapshot.exists()) { setState({ path, value: null, error: null }); return; }
      const result = schema.safeParse(snapshot.val()); setState({ path, value: result.success ? result.data : null, error: result.success ? null : 'Dados compartilhados inválidos.' });
    }, (error) => setState({ path, value: null, error: friendlyError(error) }));
  }, [path, schema]);
  return state.path === path ? state : { value: null, error: null };
}
export function useTyping(id: string) {
  const { user } = useSession(); const uid = user?.uid; const [typing, setTyping] = useState<string[]>([]);
  useEffect(() => {
    if (!id || !uid) return;
    const unsubscribe = onValue(ref(realtime, `rooms/${id}/typing`), (snapshot) => {
      const values = z.record(z.string(), z.object({ active: z.boolean(), at: z.number() })).parse(snapshot.val() ?? {});
      setTyping(Object.entries(values).filter(([otherUid, value]) => otherUid !== uid && value.active && Date.now() - value.at < 10_000).map(([otherUid]) => otherUid));
    });
    return () => { unsubscribe(); void set(ref(realtime, `rooms/${id}/typing/${uid}`), { active: false, at: serverTimestamp() }).catch(() => undefined); };
  }, [id, uid]);
  const update = useCallback((active: boolean) => { if (id && uid && !useRuntime.getState().blackout) void set(ref(realtime, `rooms/${id}/typing/${uid}`), { active, at: serverTimestamp() }).catch(() => undefined); }, [id, uid]);
  return { typing, update };
}
export function useApiQuery<T>(path: string | null, schema: ZodType<T>) {
  const { user } = useSession(); const uid = user?.uid; const key = `${uid ?? ''}/${path ?? ''}`;
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null; loading: boolean }>({ key: '', data: null, error: null, loading: true });
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!path || !uid) return;
    try { const data = await api(path, schema, { signal }); if (!signal?.aborted) setState({ key, data, error: null, loading: false }); }
    catch (error) { if (!signal?.aborted) setState((previous) => ({ key, data: previous.key === key ? previous.data : null, error: friendlyError(error), loading: false })); }
  }, [path, schema, uid, key]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  return { ...(state.key === key ? state : { data: null, error: null, loading: Boolean(path && uid) }), refresh: useCallback(() => refresh(), [refresh]) };
}
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(timer); }, [intervalMs]);
  return now;
}
