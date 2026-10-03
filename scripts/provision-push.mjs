import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
const projectId = 'morrow-cp5-555199';
const require = createRequire(import.meta.url);
const { getAccessToken } = require(process.env.FIREBASE_TOOLS_AUTH_MODULE || 'firebase-tools/lib/auth');
const config = JSON.parse(await readFile(`${homedir()}/.config/configstore/firebase-tools.json`, 'utf8'));
const token = await getAccessToken(config.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
async function request(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status} ${result.error?.message ?? ''}`);
  return result;
}
const email = `morrow-push@${projectId}.iam.gserviceaccount.com`;
try { await request(`https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`, 'POST', { accountId: 'morrow-push', serviceAccount: { displayName: 'Morrow Expo FCM only' } }); }
catch (error) { if (!String(error).includes('409')) throw error; }
const policy = await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`, 'POST', {});
const role = 'roles/firebasecloudmessaging.admin'; let binding = policy.bindings.find((item) => item.role === role);
if (!binding) { binding = { role, members: [] }; policy.bindings.push(binding); }
if (!binding.members.includes(`serviceAccount:${email}`)) binding.members.push(`serviceAccount:${email}`);
await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`, 'POST', { policy });
await mkdir('.local/credentials', { recursive: true });
const filename = '.local/credentials/morrow-push.json';
let existing;
try { existing = JSON.parse(await readFile(filename, 'utf8')); } catch { /* Initial dedicated credential. */ }
if (!existing) { const key = await request(`https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${email}/keys`, 'POST', { privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE' }); await writeFile(filename, Buffer.from(key.privateKeyData, 'base64'), { mode: 0o600 }); }
console.log('Dedicated FCM credential saved only to ignored .local/credentials.');
