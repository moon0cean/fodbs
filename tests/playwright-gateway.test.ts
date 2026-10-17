import { describe, expect, it } from 'vitest';
import { startFixture } from '../src/gym/fixture-site.js';
import { PlaywrightGymGateway } from '../src/gym/playwright.js';

describe('Playwright gateway', () => {
  it('books and cancels against the local fixture portal', async () => {
    const fixture = await startFixture([{ username: '12345678Z', password: 'court-secret' }]);
    const gateway = new PlaywrightGymGateway({ flow: fixture.flow, headless: true, noSandbox: true });
    const startsAt = new Date('2026-10-24T17:00:00.000Z');
    const session = await gateway.openSession({ username: '12345678Z', password: 'court-secret' });
    const booked = await gateway.book(session, { clubCode: 'ROC', courtIndex: 0, startsAt, durationMinutes: 60 });
    expect(booked.externalRef.startsWith('ref-')).toBe(true);
    expect(fixture.bookings.get(booked.externalRef)?.court).toBe('1');
    await gateway.cancel(session, booked.externalRef);
    expect(fixture.bookings.has(booked.externalRef)).toBe(false);
    await gateway.close(session);
    await fixture.close();
  });
});
