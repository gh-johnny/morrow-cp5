import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import { describe, expect, it } from 'vitest';
import { decryptEnvelope, encryptForDevices, type DeviceIdentity } from '../shared/encryption';

function identity(deviceId: string): DeviceIdentity {
  const keys = nacl.box.keyPair();
  return { deviceId, publicKey: encodeBase64(keys.publicKey), secretKey: encodeBase64(keys.secretKey) };
}
describe('authenticated device encryption', () => {
  it('preserves Unicode and creates a distinct envelope for each recipient device', () => {
    const alice = identity('alice'); const bob = identity('bob'); const bobTablet = identity('tablet');
    const envelopes = encryptForDevices('Olá, equipe! 🌱', alice, [
      { id: bob.deviceId, uid: 'b', publicKey: bob.publicKey, enabled: true },
      { id: bobTablet.deviceId, uid: 'b', publicKey: bobTablet.publicKey, enabled: true },
    ]);
    expect(decryptEnvelope(envelopes[0], bob)).toBe('Olá, equipe! 🌱');
    expect(decryptEnvelope(envelopes[1], bobTablet)).toBe('Olá, equipe! 🌱');
    expect(envelopes[0].nonce).not.toBe(envelopes[1].nonce);
  });
  it('rejects another device, ciphertext tampering and a forged sender key', () => {
    const alice = identity('alice'); const bob = identity('bob'); const stranger = identity('stranger');
    const [envelope] = encryptForDevices('Secret', alice, [{ id: bob.deviceId, uid: 'b', publicKey: bob.publicKey, enabled: true }]);
    expect(() => decryptEnvelope(envelope, stranger)).toThrow();
    expect(() => decryptEnvelope({ ...envelope, ciphertext: `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}` }, bob)).toThrow();
    expect(() => decryptEnvelope({ ...envelope, senderPublicKey: stranger.publicKey }, bob)).toThrow();
  });
  it('excludes disabled devices', () => {
    const alice = identity('alice');
    expect(encryptForDevices('Secret', alice, [{ id: 'revoked', uid: 'b', publicKey: alice.publicKey, enabled: false }])).toEqual([]);
  });
});
