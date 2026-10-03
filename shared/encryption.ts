import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import type { Envelope } from './contracts';
const { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } = naclUtil;

export type DeviceIdentity = { deviceId: string; publicKey: string; secretKey: string };
export type PublicDevice = { id: string; uid: string; publicKey: string; enabled: boolean };

export function encryptForDevices(text: string, sender: DeviceIdentity, recipients: readonly PublicDevice[]): Envelope[] {
  return recipients.filter((device) => device.enabled).map((recipient) => {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const ciphertext = nacl.box(decodeUTF8(text), nonce, decodeBase64(recipient.publicKey), decodeBase64(sender.secretKey));
    return { recipientUid: recipient.uid, recipientDeviceId: recipient.id, senderDeviceId: sender.deviceId,
      senderPublicKey: sender.publicKey, nonce: encodeBase64(nonce), ciphertext: encodeBase64(ciphertext) };
  });
}

export function decryptEnvelope(envelope: Envelope, identity: DeviceIdentity): string {
  if (envelope.recipientDeviceId !== identity.deviceId) throw new Error('Este envelope pertence a outro dispositivo.');
  const plaintext = nacl.box.open(decodeBase64(envelope.ciphertext), decodeBase64(envelope.nonce),
    decodeBase64(envelope.senderPublicKey), decodeBase64(identity.secretKey));
  if (!plaintext) throw new Error('A autenticidade da mensagem não pôde ser verificada.');
  return encodeUTF8(plaintext);
}
