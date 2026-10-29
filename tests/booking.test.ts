import { describe, expect, it } from 'vitest';
import { searchOpenings } from '../src/booking.js';
import { FakeGymGateway } from '../src/gym/fake.js';

describe('searchOpenings', () => {
  it('lists free courts at the requested hour and ignores the half-hour offset', async () => {
    const startsAt = new Date('2026-10-26T16:00:00.000Z');
    const gateway = new FakeGymGateway();
    gateway.unavailable.add(`0|${startsAt.toISOString()}`);
    gateway.unavailable.add(`2|${startsAt.toISOString()}`);
    const earlier = new Date(startsAt.getTime() - 30 * 60_000);
    const session = await gateway.openSession({ username: 'nif', password: 'secret' });
    const found = await searchOpenings({
      gateway,
      session,
      now: new Date('2026-10-19T10:00:00.000Z'),
      maxCourts: 4,
      startsAt,
      durationMinutes: 60,
      clubCode: 'ROC',
    });
    expect(found.exact.map((opening) => opening.courtIndex)).toEqual([1, 3]);
    expect(found.exact.every((opening) => opening.startsAt === startsAt.toISOString())).toBe(true);
    expect(gateway.inspects).toBe(4);
    expect(gateway.unavailable.has(`0|${earlier.toISOString()}`)).toBe(false);
    expect(gateway.bookings).toHaveLength(0);
  });
});