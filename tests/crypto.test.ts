import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/crypto.js';

describe('gym credentials', () => {
  it('round-trips with the user id and rejects a different id', () => {
    const key = randomBytes(32);
    const sealed = encryptSecret('court-secret', key, 'user-1');
    expect(sealed.ciphertext.includes('court-secret')).toBe(false);
    expect(decryptSecret(sealed.ciphertext, sealed.nonce, key, 'user-1')).toBe('court-secret');
    expect(() => decryptSecret(sealed.ciphertext, sealed.nonce, key, 'user-2')).toThrow();
  });
});

