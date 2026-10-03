import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as Y from 'yjs';
import { z } from 'zod';
import config from '../firebaseConfig.json';
import { conversationSchema, profileSchema, messageSchema, taskSchema, pollSchema, memorySchema, inviteSchema, notificationEventSchema } from '../shared/contracts';
import { encryptForDevices, decryptEnvelope, type DeviceIdentity } from '../shared/encryption';
import { db, closeFirebase } from '../server/src/firebase';
const base = process.env.TEST_API_URL ?? 'http://localhost:4000/api';
const { encodeBase64 } = naclUtil;
const fixtureSchema = z.array(z.object({ email: z.string(), password: z.string(), uid: z.string(), name: z.string() }));
type Fixture = z.infer<typeof fixtureSchema>[number];
const tokenSchema = z.object({ idToken: z.string(), localId: z.string() });
const fixtureFile = '.local/fixtures.json';
await mkdir('.local', { recursive: true });
let accounts: Fixture[];
try { accounts = fixtureSchema.parse(JSON.parse(await readFile(fixtureFile, 'utf8'))); }
catch {
  accounts = [];
  for (const name of ['Aurora QA', 'Bento QA', 'Clara QA', 'Davi QA']) {
    const email = `morrow-qa-${randomBytes(5).toString('hex')}@example.com`; const password = randomBytes(20).toString('base64url');
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    if (!response.ok) throw new Error(`Firebase signup: HTTP ${response.status}`);
    const result = tokenSchema.parse(await response.json()); accounts.push({ email, password, uid: result.localId, name });
  }
  await writeFile(fixtureFile, JSON.stringify(accounts), { mode: 0o600 });
}
const tokens = await Promise.all(accounts.map(async (account) => { const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }) }); if (!response.ok) throw new Error(`Firebase login: HTTP ${response.status}`); return tokenSchema.parse(await response.json()).idToken; }));
async function request(index: number, path: string, method = 'GET', body?: unknown) { const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${tokens[index]}`, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); const value: unknown = await response.json(); return { status: response.status, value }; }
async function call<T>(index: number, path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<T> { const response = await request(index, path, method, body); if (response.status >= 400) { const error = z.object({ error: z.string() }).safeParse(response.value); throw new Error(`${method} ${path}: HTTP ${response.status} ${error.success ? error.data.error : ''}`); } return schema.parse(response.value); }
const png = await readFile('assets/brand/icon.png');
async function upload(index: number, purpose: string, conversationId?: string) { const body = new FormData(); body.append('file', new Blob([png], { type: 'image/png' }), 'avatar.png'); body.append('purpose', purpose); if (conversationId) body.append('conversationId', conversationId); const response = await fetch(`${base}/media`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[index]}` }, body }); if (!response.ok) throw new Error(`Media upload: HTTP ${response.status}`); return z.object({ id: z.string(), url: z.string() }).parse(await response.json()); }
for (let index = 0; index < accounts.length; index++) {
  const profile = await request(index, '/users/me');
  if (profile.status === 404) { const photo = await upload(index, 'profile'); await call(index, '/users/me', profileSchema, 'PUT', { name: accounts[index].name, phoneNumber: `+551198888000${index}`, birthDate: '2001-03-15', photoUrl: photo.url }); }
}
console.log('PASS: real Firebase email/password signup/login and private photo upload.');
assert.equal((await request(3, `/users/${accounts[0].uid}`)).status, 403);
const [first, repeated] = await Promise.all([call(0, '/conversations/direct', conversationSchema, 'POST', { recipientId: accounts[1].uid }), call(1, '/conversations/direct', conversationSchema, 'POST', { recipientId: accounts[0].uid })]); assert.equal(first.id, repeated.id);
assert.equal((await request(0, '/conversations/direct', 'POST', { recipientId: accounts[0].uid })).status, 400);
await call(1, `/users/${accounts[0].uid}`, profileSchema);
console.log('PASS: deterministic concurrent direct chat and shared-profile authorization.');
if (first.encrypted) await call(0, `/conversations/${first.id}/encryption`, conversationSchema, 'POST', { enabled: false });
const messageId = `m_qa_${randomBytes(6).toString('hex')}`;
const message = await call(0, `/conversations/${first.id}/messages`, messageSchema, 'POST', { id: messageId, text: 'Decidimos entregar o protótipo na sexta. Bento revisa o canvas.' });
const replay = await call(0, `/conversations/${first.id}/messages`, messageSchema, 'POST', { id: messageId, text: 'This replay cannot replace the original.' }); assert.equal(replay.text, message.text); assert.equal(replay.createdAt, message.createdAt);
assert.equal((await request(3, `/conversations/${first.id}/messages`)).status, 403);
const push = await call(0, '/notifications', notificationEventSchema, 'POST', { conversationId: first.id, messageId }); const pushReplay = await call(0, '/notifications', notificationEventSchema, 'POST', { conversationId: first.id, messageId }); assert.equal(push.id, pushReplay.id); assert.equal(push.excluded[accounts[0].uid], 'Remetente da mensagem'); assert.equal((await request(1, '/notifications', 'POST', { conversationId: first.id, messageId })).status, 403);
console.log('PASS: realtime persistence, idempotent message/push and sender authorization.');
const photo = await upload(0, 'group');
assert.equal((await request(0, '/conversations/groups', 'POST', { name: 'Invalid photo QA', photoUrl: 'https://example.com/arbitrary.png', memberIds: [accounts[1].uid], memberLimit: 3, notificationPolicy: 'disabled' })).status, 400);
assert.equal((await request(1, '/conversations/groups', 'POST', { name: 'Foreign photo QA', photoUrl: photo.url, memberIds: [accounts[0].uid], memberLimit: 3, notificationPolicy: 'disabled' })).status, 400);
const group = await call(0, '/conversations/groups', conversationSchema, 'POST', { name: 'Ateliê QA', photoUrl: photo.url, memberIds: [accounts[1].uid], memberLimit: 3, notificationPolicy: 'mentioned_members' });
const invitation = await call(0, '/invitations', inviteSchema, 'POST', { conversationId: group.id, approvalRequired: false, hours: 1 });
const attempts = await Promise.all([request(2, `/invitations/${invitation.id}/join`, 'POST'), request(3, `/invitations/${invitation.id}/join`, 'POST')]); assert.equal(attempts.filter((result) => result.status === 200).length, 1); assert.ok(attempts.every((result) => [200, 409].includes(result.status)));
const current = await call(0, `/conversations/${group.id}`, conversationSchema); assert.equal(current.memberIds.length, 3);
const winner = current.memberIds.includes(accounts[2].uid) ? 2 : 3;
assert.equal((await request(0, `/conversations/${group.id}`, 'PATCH', { memberLimit: 2 })).status, 409);
await call(0, `/conversations/${group.id}`, conversationSchema, 'PATCH', { memberIds: [accounts[1].uid] }); assert.equal((await request(winner, `/conversations/${group.id}/messages`)).status, 403);
console.log('PASS: simultaneous final-slot admission, owner-inclusive capacity and revocation.');
const task = await call(0, `/conversations/${group.id}/tasks`, taskSchema, 'POST', { title: 'Revisar o protótipo', assigneeId: accounts[1].uid, dueAt: Date.now() - 1000 }); await call(1, `/conversations/${group.id}/tasks/${task.id}`, taskSchema, 'PATCH', { status: 'doing', checklist: [{ id: 'review', text: 'Conferir login', done: true }] });
const poll = await call(0, `/conversations/${group.id}/polls`, pollSchema, 'POST', { question: 'Qual horário funciona?', options: ['Segunda 18h', 'Terça 20h'], type: 'availability' }); await Promise.all([call(0, `/conversations/${group.id}/polls/${poll.id}/vote`, pollSchema, 'POST', { options: [0, 1] }), call(1, `/conversations/${group.id}/polls/${poll.id}/vote`, pollSchema, 'POST', { options: [1] })]); const savedPoll = pollSchema.parse((await db.doc(`conversations/${group.id}/polls/${poll.id}`).get()).data()); assert.equal(Object.keys(savedPoll.votes).length, 2);
await call(0, `/conversations/${group.id}/memories`, memorySchema, 'POST', { title: 'Escolhemos o caminho A', kind: 'decision', note: 'Motivo: menos dependências.' });
const ydoc = new Y.Doc(); const note = new Y.Map<unknown>(); Object.entries({ id: 'qa_note', text: 'shared', x: 20, y: 20, color: '#DBF581', authorId: accounts[0].uid }).forEach(([key, value]) => note.set(key, value)); ydoc.getMap('notes').set('qa_note', note); await call(0, `/conversations/${group.id}/board`, z.object({ accepted: z.boolean() }), 'POST', { updateId: `qa_${Date.now()}`, update: encodeBase64(Y.encodeStateAsUpdate(ydoc)) }); ydoc.destroy();
console.log('PASS: tasks, checklist, concurrent live votes, shared memory and CRDT update persistence.');
const identities = accounts.slice(0, 2).map((account, index): DeviceIdentity => { const keys = nacl.box.keyPair(); return { deviceId: `qa_device_${index}_${randomBytes(4).toString("hex")}`, publicKey: encodeBase64(keys.publicKey), secretKey: encodeBase64(keys.secretKey) }; });
for (let index = 0; index < 2; index++) await call(index, '/users/me/devices', z.unknown(), 'POST', { id: identities[index].deviceId, publicKey: identities[index].publicKey, token: null, platform: 'web', label: 'Cloud integration test', enabled: true });
await call(0, `/conversations/${first.id}/encryption`, conversationSchema, 'POST', { enabled: true });
const envelopes = encryptForDevices('Só nossos dispositivos leem esta frase.', identities[0], identities.map((identity, index) => ({ id: identity.deviceId, uid: accounts[index].uid, publicKey: identity.publicKey, enabled: true })));
const encrypted = await call(0, `/conversations/${first.id}/messages`, messageSchema, 'POST', { id: `m_enc_${Date.now()}`, text: '', envelopes }); assert.equal(encrypted.text, ''); assert.equal(decryptEnvelope(encrypted.envelopes.find((envelope) => envelope.recipientUid === accounts[1].uid)!, identities[1]), 'Só nossos dispositivos leem esta frase.');
await call(0, `/conversations/${first.id}/encryption`, conversationSchema, 'POST', { enabled: false });
console.log('PASS: actual NaCl device envelopes and server plaintext exclusion.');
await writeFile('.local/scenario.json', JSON.stringify({ directId: first.id, groupId: group.id, messageId }), { mode: 0o600 });
const ai = await request(0, `/conversations/${first.id}/ai/ask`, 'POST', { question: 'O que decidimos entregar e quem revisa o canvas?' });
if (ai.status === 200) { const answer = z.object({ answer: z.string(), citations: z.array(z.unknown()) }).parse(ai.value); assert.ok(answer.citations.length); console.log('PASS: real AI response with verified conversation citations.'); }
else { await closeFirebase(); throw new Error(`AI integration failed: HTTP ${ai.status}.`); }
console.log('Cloud smoke scenario complete. Fixture credentials remain in ignored .local only.');
await closeFirebase();
