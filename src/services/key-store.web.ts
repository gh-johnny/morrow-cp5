/** Browser secrets are encrypted by a non-extractable AES key persisted in IndexedDB. */
type VaultRecord = { key: CryptoKey; nonce: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('morrow-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('secrets');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Não foi possível abrir o cofre deste navegador.'));
  });
}
async function getRecord(name: string): Promise<VaultRecord | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('secrets', 'readonly');
    const request = transaction.objectStore('secrets').get(name);
    request.onsuccess = () => resolve(request.result as VaultRecord | undefined);
    request.onerror = () => reject(new Error('Falha ao ler o cofre.'));
    transaction.oncomplete = () => db.close();
  });
}
export async function readSecret(name: string): Promise<string | null> {
  const record = await getRecord(name);
  if (!record) return null;
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.nonce }, record.key, record.ciphertext);
  return new TextDecoder().decode(plain);
}
export async function writeSecret(name: string, value: string): Promise<void> {
  const previous = await getRecord(name);
  const key = previous?.key ?? await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(value));
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('secrets', 'readwrite');
    transaction.objectStore('secrets').put({ key, nonce, ciphertext } satisfies VaultRecord, name);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(new Error('Falha ao salvar no cofre.')); };
  });
}
