/** Uses existing Firebase CLI authentication. Never logs or versions administrative keys. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';

const projectId = process.env.MORROW_FIREBASE_PROJECT || 'morrow-cp5-555199';
const require = createRequire(import.meta.url);
const { getAccessToken } = require(process.env.FIREBASE_TOOLS_AUTH_MODULE || 'firebase-tools/lib/auth');
const config = JSON.parse(await readFile(`${homedir()}/.config/configstore/firebase-tools.json`, 'utf8'));
const token = await getAccessToken(config.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']);
async function request(path, method = 'GET', body) {
  const response = await fetch(path, {
    method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${new URL(path).pathname}: ${response.status} ${data.error?.message ?? 'request failed'}`);
  return data;
}
async function operation(url, initial) {
  let data = initial;
  for (let i = 0; !data.done && i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    data = await request(`${url}/${initial.name}`);
  }
  if (data.error) throw new Error(data.error.message);
  return data.response;
}

const project = await request(`https://firebase.googleapis.com/v1beta1/projects/${projectId}`);
console.log('Firebase enabled:', project.projectId);
const services = ['firestore.googleapis.com', 'firebasedatabase.googleapis.com', 'identitytoolkit.googleapis.com', 'iam.googleapis.com', 'fcm.googleapis.com', 'generativelanguage.googleapis.com', 'apikeys.googleapis.com'];
await operation('https://serviceusage.googleapis.com/v1', await request(`https://serviceusage.googleapis.com/v1/projects/${project.projectNumber}/services:batchEnable`, 'POST', { serviceIds: services }));
console.log('Required Google APIs enabled.');
try {
  await request(`https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=(default)`, 'POST', { locationId: 'southamerica-east1', type: 'FIRESTORE_NATIVE' });
  console.log('Firestore database created.');
} catch (error) { if (!String(error).includes('409')) throw error; }
let instances = await request(`https://firebasedatabase.googleapis.com/v1beta/projects/${project.projectNumber}/locations/us-central1/instances`);
let instance = instances.instances?.[0];
if (!instance) {
  instance = await request(`https://firebasedatabase.googleapis.com/v1beta/projects/${project.projectNumber}/locations/us-central1/instances?databaseId=${projectId}-default-rtdb`, 'POST', { type: 'DEFAULT_DATABASE' });
  console.log('Realtime Database created.');
}
try {
  await request(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`);
} catch (error) {
  if (!String(error).includes('404')) throw error;
  console.log('Firebase Auth requires the free Get Started action in Firebase Console. Continuing other provisioning.');
}
try {
  await request(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`, 'PATCH', { signIn: { email: { enabled: true, passwordRequired: true } } });
} catch (error) { if (!String(error).includes('CONFIGURATION_NOT_FOUND')) throw error; }
const apps = await request(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`);
let app = apps.apps?.[0];
if (!app) app = await operation('https://firebase.googleapis.com/v1beta1', await request(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, 'POST', { displayName: 'Morrow Client' }));
const clientConfig = await request(`https://firebase.googleapis.com/v1beta1/${app.name}/config`);
clientConfig.databaseURL = instance.databaseUrl;
await writeFile(new URL('../firebaseConfig.json', import.meta.url), `${JSON.stringify(clientConfig, null, 2)}\n`);
const email = `morrow-api@${projectId}.iam.gserviceaccount.com`;
try { await request(`https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`, 'POST', { accountId: 'morrow-api', serviceAccount: { displayName: 'Morrow dedicated API' } }); }
catch (error) { if (!String(error).includes('409')) throw error; }
const policy = await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`, 'POST', {});
for (const role of ['roles/datastore.user', 'roles/firebasedatabase.admin', 'roles/firebaseauth.viewer', 'roles/firebasecloudmessaging.admin']) {
  let binding = policy.bindings.find((item) => item.role === role);
  if (!binding) { binding = { role, members: [] }; policy.bindings.push(binding); }
  if (!binding.members.includes(`serviceAccount:${email}`)) binding.members.push(`serviceAccount:${email}`);
}
await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`, 'POST', { policy });
const envUrl = new URL('../server/.env', import.meta.url);
let previous = '';
try { previous = await readFile(envUrl, 'utf8'); } catch { /* first provisioning */ }
if (!previous.includes('FIREBASE_PRIVATE_KEY=')) {
  const key = await request(`https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${email}/keys`, 'POST', { privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE' });
  const credentials = JSON.parse(Buffer.from(key.privateKeyData, 'base64').toString());
  await mkdir(new URL('../server/', import.meta.url), { recursive: true });
  await writeFile(envUrl, `PORT=4000\nFIREBASE_PROJECT_ID=${projectId}\nFIREBASE_DATABASE_URL=${instance.databaseUrl}\nFIREBASE_CLIENT_EMAIL=${email}\nFIREBASE_PRIVATE_KEY=${JSON.stringify(credentials.private_key)}\nWEB_ORIGINS=http://localhost:8081,http://localhost:8082\nCRON_SECRET=${randomBytes(32).toString('hex')}\nGEMINI_MODEL=gemini-3.8-flash\n`, { mode: 0o600 });
}
console.log('Client config saved; administrative credential saved ONLY to ignored server/.env.');
try {
  const keys = await request(`https://apikeys.googleapis.com/v2/projects/${project.projectNumber}/locations/global/keys`);
  let key = keys.keys?.find((item) => item.displayName === 'Morrow AI server');
  if (!key) key = await operation('https://apikeys.googleapis.com/v2', await request(`https://apikeys.googleapis.com/v2/projects/${project.projectNumber}/locations/global/keys`, 'POST', { displayName: 'Morrow AI server', restrictions: { apiTargets: [{ service: 'generativelanguage.googleapis.com' }] } }));
  const secret = await request(`https://apikeys.googleapis.com/v2/${key.name}/keyString`);
  const env = await readFile(envUrl, 'utf8');
  if (!env.includes('GEMINI_API_KEY=')) await writeFile(envUrl, `${env}GEMINI_API_KEY=${secret.keyString}\n`, { mode: 0o600 });
  console.log('Restricted AI key configured in ignored server/.env.');
} catch (error) { console.log('AI provisioning requires follow-up:', error.message); }
