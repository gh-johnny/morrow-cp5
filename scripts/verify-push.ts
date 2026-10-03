import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import config from '../firebaseConfig.json';
import { conversationSchema, deviceSchema, messageSchema, notificationEventSchema, preferenceSchema, type NotificationEvent, type NotificationPolicy } from '../shared/contracts';

const base = process.env.TEST_API_URL || 'https://morrow-cp5.vercel.app/api';
const accounts = z.array(z.object({ email: z.string(), password: z.string(), uid: z.string() })).parse(JSON.parse(await readFile('.local/fixtures.json', 'utf8')));
const tokens: string[] = [];
for (const account of accounts.slice(0, 3)) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }) });
  assert.equal(response.status, 200);
  tokens.push(z.object({ idToken: z.string() }).parse(await response.json()).idToken);
}
async function call<T>(index: number, path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${tokens[index]}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(55_000) });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return schema.parse(await response.json());
}
const devicesSchema = z.array(deviceSchema.omit({ token: true }).extend({ pushRegistered: z.boolean() }));
const devices = await call(1, '/users/me/devices', devicesSchema);
assert.ok(devices.some((device) => device.platform === 'android' && device.enabled && device.pushRegistered), 'Register an actual Android device before this verification.');
const previousPreferences = await call(1, '/users/me/preferences', preferenceSchema);
const activePreferences = { ...previousPreferences, pushEnabled: true, quietEnabled: false, mutedConversationIds: [] };
const form = new FormData();
form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'push-qa.png');
form.append('purpose', 'group');
const uploaded = await fetch(`${base}/media`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}` }, body: form });
assert.equal(uploaded.status, 201);
const { url } = z.object({ url: z.string() }).parse(await uploaded.json());
const group = await call(0, '/conversations/groups', conversationSchema, 'POST', { name: 'Push Android QA', photoUrl: url, memberIds: [accounts[1].uid, accounts[2].uid], memberLimit: 3, notificationPolicy: 'all_group_messages' });
const evidence: { check: string; status: string; accepted: number; rejected: number }[] = [];
async function dispatch(conversationId: string, mentionedUserIds: string[] = [], text = 'Verificação de política Android') {
  const message = await call(0, `/conversations/${conversationId}/messages`, messageSchema, 'POST', { id: `m_push_${randomUUID().replaceAll('-', '')}`, text, mentionedUserIds });
  const event = await call(0, '/notifications', notificationEventSchema, 'POST', { conversationId, messageId: message.id });
  assert.ok(!event.recipients.includes(accounts[0].uid), 'Sender must never be a recipient.');
  return event;
}
function record(check: string, event: NotificationEvent) { evidence.push({ check, status: event.status, accepted: event.providerAccepted, rejected: event.providerRejected }); console.log(`PASS: ${check}`); }
try {
  await call(1, '/users/me/preferences', preferenceSchema, 'PUT', activePreferences);
  for (const policy of ['all_group_messages', 'mentioned_members', 'direct_messages_only', 'disabled'] satisfies NotificationPolicy[]) {
    await call(0, `/conversations/${group.id}`, conversationSchema, 'PATCH', { notificationPolicy: policy });
    const event = await dispatch(group.id);
    assert.equal(event.providerAccepted > 0, policy === 'all_group_messages');
    record(policy, event);
    const replay = await call(0, '/notifications', notificationEventSchema, 'POST', { conversationId: group.id, messageId: event.messageId });
    assert.equal(replay.id, event.id); assert.equal(replay.providerAccepted, event.providerAccepted);
  }
  await call(0, `/conversations/${group.id}`, conversationSchema, 'PATCH', { notificationPolicy: 'mentioned_members' });
  const mention = await dispatch(group.id, [accounts[1].uid], 'Bento, a menção chegou pelo Android.');
  assert.ok(mention.providerAccepted > 0); record('explicit mention reaches the active Android device', mention);
  await call(0, `/conversations/${group.id}`, conversationSchema, 'PATCH', { notificationPolicy: 'all_group_messages' });
  await call(1, '/users/me/preferences', preferenceSchema, 'PUT', { ...activePreferences, mutedConversationIds: [group.id] });
  const muted = await dispatch(group.id); assert.equal(muted.providerAccepted, 0); record('personal conversation mute', muted);
  const utcMinute = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  await call(1, '/users/me/preferences', preferenceSchema, 'PUT', { ...activePreferences, quietEnabled: true, quietStart: (utcMinute + 1439) % 1440, quietEnd: (utcMinute + 10) % 1440, utcOffsetMinutes: 0 });
  const quiet = await dispatch(group.id); assert.equal(quiet.providerAccepted, 0); assert.equal(quiet.status, 'deferred'); assert.ok(quiet.nextAttemptAt && quiet.nextAttemptAt > Date.now()); record('quiet hours defer delivery', quiet);
  await call(1, '/users/me/preferences', preferenceSchema, 'PUT', activePreferences);
  await call(0, `/conversations/${group.id}`, conversationSchema, 'PATCH', { memberIds: [accounts[2].uid] });
  const removed = await dispatch(group.id); assert.equal(removed.providerAccepted, 0); assert.ok(!removed.recipients.includes(accounts[1].uid)); record('removed member is excluded', removed);
  const direct = await call(0, '/conversations/direct', conversationSchema, 'POST', { recipientId: accounts[1].uid });
  assert.equal(direct.encrypted, false, 'Run this separately from the E2E protection test.');
  const final = await dispatch(direct.id, [], `Push Android confirmado ${new Date().toISOString()}`);
  assert.ok(final.providerAccepted > 0); record('direct message accepted by Expo and sender excluded', final);
  await writeFile('.local/push-scenario.json', JSON.stringify({ conversationId: direct.id, eventId: final.id, messageId: final.messageId, recipientUid: accounts[1].uid }, null, 2), { mode: 0o600 });
  await writeFile('docs/evidence/push-policies.json', JSON.stringify({ checkedAt: new Date().toISOString(), api: base, platform: 'Android', checks: evidence, pending: 'Confirm provider receipt and Android notification tap separately.' }, null, 2));
} finally {
  await call(1, '/users/me/preferences', preferenceSchema, 'PUT', previousPreferences);
}
