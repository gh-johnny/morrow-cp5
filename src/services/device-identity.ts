import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import type { DeviceIdentity } from '../../shared/encryption';
import { readSecret, writeSecret } from './key-store';

nacl.setPRNG((bytes, length) => Crypto.getRandomValues(bytes.subarray(0, length)));
const identitySchema = z.object({ deviceId: z.string(), publicKey: z.string(), secretKey: z.string() });
const identities = new Map<string, Promise<DeviceIdentity>>();
export function identityFor(uid: string): Promise<DeviceIdentity> {
  let promise = identities.get(uid);
  if (!promise) {
    promise = (async () => {
      const stored = await readSecret(`morrow-identity-${uid}`);
      if (stored) return identitySchema.parse(JSON.parse(stored));
      const keys = nacl.box.keyPair();
      const identity = { deviceId: `d_${Crypto.randomUUID().replaceAll('-', '')}`,
        publicKey: encodeBase64(keys.publicKey), secretKey: encodeBase64(keys.secretKey) };
      await writeSecret(`morrow-identity-${uid}`, JSON.stringify(identity));
      return identity;
    })();
    identities.set(uid, promise);
    promise.catch(() => identities.delete(uid));
  }
  return promise;
}
export function clearIdentityCache() { identities.clear(); }
export async function renewIdentity(uid: string): Promise<DeviceIdentity> {
  const keys = nacl.box.keyPair();
  const identity = { deviceId: `d_${Crypto.randomUUID().replaceAll('-', '')}`, publicKey: encodeBase64(keys.publicKey), secretKey: encodeBase64(keys.secretKey) };
  await writeSecret(`morrow-identity-${uid}`, JSON.stringify(identity));
  identities.set(uid, Promise.resolve(identity));
  return identity;
}
export async function keyFingerprint(publicKey: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, publicKey);
  return digest.toUpperCase().match(/.{1,4}/g)?.join(' ') ?? digest;
}
