import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { db, closeFirebase } from '../server/src/firebase';

const accounts = z.array(z.object({ uid: z.string(), email: z.string(), name: z.string() })).parse(JSON.parse(await readFile('.local/fixtures.json', 'utf8')));
let revoked = 0;
for (const account of accounts) {
  if (!account.email.startsWith('morrow-qa-') || !account.name.endsWith(' QA')) throw new Error('Cleanup is restricted to generated QA fixtures.');
  const devices = await db.collection(`users/${account.uid}/devices`).get();
  for (const device of devices.docs) {
    if (device.data().enabled && device.data().platform === 'web') { await device.ref.update({ enabled: false, token: null }); revoked++; }
  }
}
console.log(`Revoked ${revoked} disposable browser identities belonging only to generated QA accounts.`);
await closeFirebase();
