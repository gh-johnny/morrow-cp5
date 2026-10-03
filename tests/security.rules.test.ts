import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { get, ref, set } from 'firebase/database';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_DATABASE_EMULATOR_HOST);
describe.skipIf(!enabled)('password authentication and membership security rules', () => {
  let environment: RulesTestEnvironment;
  const password = { firebase: { sign_in_provider: 'password' } };
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'demo-morrow',
      firestore: { rules: await readFile('firestore.rules', 'utf8') },
      database: { rules: await readFile('database.rules.json', 'utf8') },
    });
    await environment.withSecurityRulesDisabled(async (context) => {
      await Promise.all([
        setDoc(doc(context.firestore(), 'users/alice'), { name: 'Alice', phoneNumber: '+5511999999999' }),
        setDoc(doc(context.firestore(), 'users/alice/devices/phone'), { token: 'private-token' }),
        setDoc(doc(context.firestore(), 'directory/alice'), { uid: 'alice', name: 'Alice', photoUrl: 'https://example.com/photo' }),
        setDoc(doc(context.firestore(), 'conversations/team'), { memberIds: ['alice', 'bob'] }),
        setDoc(doc(context.firestore(), 'conversations/team/tasks/task'), { title: 'Shared task' }),
        setDoc(doc(context.firestore(), 'notificationEvents/private'), { recipients: ['bob'] }),
        set(ref(context.database(), 'rooms/team'), { access: { version: 1, members: { alice: true, bob: true } }, messages: { message: { text: 'Shared message', createdAt: 1 } }, board: { updates: { one: { update: 'data' } } }, focus: { goal: 'Shared focus' }, call: { participants: { alice: { joinedAt: 1, video: true } }, signals: { bob: { one: { payload: 'private' } } } } }),
      ]);
    });
  });
  afterAll(async () => { await environment?.cleanup(); });
  it('keeps full profiles, device tokens and notification jobs private', async () => {
    const alice = environment.authenticatedContext('alice', password).firestore();
    const bob = environment.authenticatedContext('bob', password).firestore();
    await assertSucceeds(getDoc(doc(alice, 'users/alice')));
    await assertSucceeds(getDoc(doc(bob, 'directory/alice')));
    await assertFails(getDoc(doc(bob, 'users/alice')));
    await assertFails(getDoc(doc(bob, 'users/alice/devices/phone')));
    await assertFails(getDoc(doc(alice, 'notificationEvents/private')));
    await assertFails(setDoc(doc(alice, 'users/alice'), { name: 'Forged profile' }));
  });
  it('allows shared collaboration reads and denies forged membership writes', async () => {
    const bob = environment.authenticatedContext('bob', password).firestore();
    const outsider = environment.authenticatedContext('eve', password).firestore();
    await assertSucceeds(getDoc(doc(bob, 'conversations/team/tasks/task')));
    await assertFails(getDoc(doc(outsider, 'conversations/team/tasks/task')));
    await assertFails(setDoc(doc(bob, 'conversations/team'), { memberIds: ['bob', 'eve'] }));
    await assertFails(setDoc(doc(bob, 'conversations/team/tasks/task'), { title: 'Forged task' }));
  });
  it('rejects unauthenticated and non-password providers', async () => {
    const unauthenticated = environment.unauthenticatedContext();
    const google = environment.authenticatedContext('alice', { firebase: { sign_in_provider: 'google.com' } });
    await assertFails(getDoc(doc(unauthenticated.firestore(), 'directory/alice')));
    await assertFails(getDoc(doc(google.firestore(), 'conversations/team')));
    for (const path of ['messages', 'board', 'focus', 'call/participants']) {
      await assertFails(get(ref(google.database(), `rooms/team/${path}`)));
      await assertFails(get(ref(unauthenticated.database(), `rooms/team/${path}`)));
    }
    await assertFails(set(ref(google.database(), 'presence/alice/device'), { online: true, at: Date.now() }));
    await assertFails(set(ref(google.database(), 'rooms/team/typing/alice'), { active: true, at: Date.now() }));
    const googleBob = environment.authenticatedContext('bob', { firebase: { sign_in_provider: 'google.com' } });
    await assertFails(get(ref(googleBob.database(), 'rooms/team/call/signals/bob')));
  });
  it('enforces realtime ACLs, server-only messages and private call signals', async () => {
    const alice = environment.authenticatedContext('alice', password).database();
    const bob = environment.authenticatedContext('bob', password).database();
    const eve = environment.authenticatedContext('eve', password).database();
    await assertSucceeds(get(ref(bob, 'rooms/team/messages')));
    await assertFails(get(ref(eve, 'rooms/team/messages')));
    await assertFails(set(ref(alice, 'rooms/team/messages/forged'), { senderId: 'bob', text: 'Forged' }));
    await assertFails(set(ref(eve, 'rooms/team/access/members/eve'), true));
    await assertSucceeds(get(ref(bob, 'rooms/team/call/signals/bob')));
    await assertFails(get(ref(alice, 'rooms/team/call/signals/bob')));
  });
  it('allows only your own validated canvas cursor and typing', async () => {
    const bob = environment.authenticatedContext('bob', password).database();
    await assertSucceeds(set(ref(bob, 'rooms/team/board/presence/bob/session'), { x: 10, y: 20, at: Date.now() }));
    await assertFails(set(ref(bob, 'rooms/team/board/presence/alice/session'), { x: 10, y: 20, at: Date.now() }));
    await assertFails(set(ref(bob, 'rooms/team/board/presence/bob/invalid'), { x: -1, y: 20, at: Date.now() }));
    await assertSucceeds(set(ref(bob, 'rooms/team/typing/bob'), { active: true, at: Date.now() }));
    await assertFails(set(ref(bob, 'rooms/team/typing/alice'), { active: true, at: Date.now() }));
  });
  it('immediately revokes reads and collaboration writes after removal', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), 'rooms/team/access/members/bob'), null);
      await setDoc(doc(context.firestore(), 'conversations/team'), { memberIds: ['alice'] });
    });
    const removed = environment.authenticatedContext('bob', password);
    await assertFails(get(ref(removed.database(), 'rooms/team/messages')));
    await assertFails(get(ref(removed.database(), 'rooms/team/board')));
    await assertFails(set(ref(removed.database(), 'rooms/team/typing/bob'), { active: true, at: Date.now() }));
    await assertFails(getDoc(doc(removed.firestore(), 'conversations/team/tasks/task')));
  });
});
