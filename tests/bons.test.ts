import { describe, expect, it } from 'vitest';
import { recordBons } from '../src/bons.js';
import { MemoryMailer, UnconfiguredMailer } from '../src/mail.js';

describe('bons notices', () => {
  it('emails once when bons cannot cover an hour, and once when they are gone', async () => {
    const mailer = new MemoryMailer();
    const email = 'member@example.com';
    expect(await recordBons({ remaining: 18, previous: 'ok', email, mailer })).toBe('ok');
    expect(mailer.sent).toHaveLength(0);
    expect(await recordBons({ remaining: 3, previous: 'ok', email, mailer })).toBe('low');
    expect(mailer.sent[0]?.subject).toBe('Te quedan pocos bons');
    expect(await recordBons({ remaining: 2, previous: 'low', email, mailer })).toBe('low');
    expect(mailer.sent).toHaveLength(1);
    expect(await recordBons({ remaining: 0, previous: 'low', email, mailer })).toBe('empty');
    expect(mailer.sent).toHaveLength(2);
    expect(await recordBons({ remaining: 0, previous: 'empty', email, mailer })).toBe('empty');
    expect(mailer.sent).toHaveLength(2);
  });

  it('keeps the previous notice when mail is not configured', async () => {
    expect(await recordBons({
      remaining: 0,
      previous: 'ok',
      email: 'member@example.com',
      mailer: new UnconfiguredMailer(),
    })).toBe('ok');
  });
});