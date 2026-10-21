import { describe, expect, it } from 'vitest';
import { searchOpenings } from '../src/booking.js';
import { FakeGymGateway } from '../src/gym/fake.js';

describe('searchOpenings', () => {
  it('lists the requested time before a free court half an hour earlier', async () => {
    const startsAt = new Date('2026-10-26T16:00:00.000Z');
    const gateway = new FakeGymGateway();
    gateway.unavailable.add(`0|${startsAt.toISOString()}`);
    gateway.unavailable.add(`1|${startsAt.toISOString()}`);
    gateway.unavailable.add(`2|${startsAt.toISOString()}`);
    gateway.unavailable.add(`3|${startsAt.toISOString()}`);
    const earlier = new Date(startsAt.getTime() - 30 * 60_000);
    const later = new Date(startsAt.getTime() + 30 * 60_000);
    gateway.unavailable.add(`0|${earlier.toISOString()}`);
    for (let courtIndex = 0; courtIndex < 4; courtIndex += 1) gateway.unavailable.add(`${courtIndex}|${later.toISOString()}`);
    const session = await gateway.openSession({ username: 'nif', password: 'secret' });
    const found = await searchOpenings({
      gateway,
      session,
      zone: 'Europe/Madrid',
      now: new Date('2026-10-19T10:00:00.000Z'),
      maxCourts: 4,
      tryOffset: true,
      startsAt,
      durationMinutes: 60,
      clubCode: 'ROC',
    });
    expect(found.exact).toEqual([]);
    expect(found.alternatives.map((opening) => opening.courtIndex)).toEqual([1, 2, 3]);
    expect(found.alternatives[0]?.startsAt).toBe(earlier.toISOString());
    expect(gateway.bookings).toHaveLength(0);
  });
});