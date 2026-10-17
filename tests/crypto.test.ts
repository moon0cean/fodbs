import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/crypto.js';
import { DIR_LOGIN } from '../src/gym/gateway.js';

describe('gym credentials', () => {
  it('round-trips with the user id and rejects a different id', () => {
    const key = randomBytes(32);
    const sealed = encryptSecret('court-secret', key, 'user-1');
    expect(sealed.ciphertext.includes('court-secret')).toBe(false);
    expect(decryptSecret(sealed.ciphertext, sealed.nonce, key, 'user-1')).toBe('court-secret');
    expect(() => decryptSecret(sealed.ciphertext, sealed.nonce, key, 'user-2')).toThrow();
  });
});

describe('DiR login selectors', () => {
  it('matches the live identificacio.aspx fields', () => {
    expect(DIR_LOGIN).toEqual({
      usernameSelector: '#ctl00_content_txtIdentificador',
      passwordSelector: '#ctl00_content_txtContrasenya',
      submitSelector: '#ctl00_content_imgbEnviar',
    });
  });
});
