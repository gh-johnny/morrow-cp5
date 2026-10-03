import { readFile } from 'node:fs/promises';
import { db, realtime } from '../server/src/firebase';
const accounts = JSON.parse(await readFile('.local/fixtures.json', 'utf8')) as { uid: string }[];
const conversations = await db.collection('conversations').where('memberIds', 'array-contains', accounts[0].uid).get();
for (const doc of conversations.docs.filter((doc) => doc.data().type === 'direct')) {
  const ref = realtime.ref(`rooms/${doc.id}`);
  const snapshot = await ref.get();
  console.log({ stage: 'get', exists: snapshot.exists(), access: Boolean(snapshot.child(`access/members/${accounts[0].uid}`).val()), keys: Object.keys(snapshot.val() ?? {}) });
  let attempts = 0;
  const result = await ref.transaction((value: unknown) => {
    attempts++;
    console.log({ stage: 'transaction', attempts, null: value === null, keys: value && typeof value === 'object' ? Object.keys(value) : [] });
    return value;
  });
  console.log({ committed: result.committed, member: Boolean(result.snapshot.child(`access/members/${accounts[0].uid}`).val()) });
}
realtime.goOffline();
