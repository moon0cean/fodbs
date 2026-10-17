import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encryptSecret(plain: string, key: Buffer, aad: string): { ciphertext: string; nonce: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    nonce: nonce.toString('base64'),
    ciphertext: Buffer.concat([body, tag]).toString('base64'),
  };
}

export function decryptSecret(ciphertext: string, nonce: string, key: Buffer, aad: string): string {
  const raw = Buffer.from(ciphertext, 'base64');
  if (raw.length < 16) throw new Error('ciphertext_too_short');
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(0, raw.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
