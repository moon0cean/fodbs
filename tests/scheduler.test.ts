import { describe, expect, it } from 'vitest';
import { FakeGymGateway } from '../src/gym/fake.js';
import { runSchedulerTick, SessionPool } from '../src/scheduler.js';
import { MemoryStore, testConfig } from './memory-store.js';

const START = new Date('2026-10-24T17:00:00.000Z');
const OPEN = new Date('2026-10-17T17:00:00.000Z');

function primedStore(): MemoryStore {
  const store = new MemoryStore(60_000);
  store.occurrences.set('occ', {
    id: 'occ',
    startsAt: START,
    durationMinutes: 60,
    clubCode: 'ROC',
    courtsTargeted: null,
  });
  store.optedIn.set('occ', ['p1', 'p2', 'p3', 'p4', 'p5']);
  store.base.push(
    { userId: 'a', bookedMinutes: 120, playedMinutes: 0, bookingsOnDay: 0, simultaneousHeld: 0 },
    { userId: 'b', bookedMinutes: 0, playedMinutes: 60, bookingsOnDay: 0, simultaneousHeld: 0 },
  );
  store.creds.set('a', { username: 'nif-a', password: 'pass-a' });
  store.creds.set('b', { username: 'nif-b', password: 'pass-b' });
  return store;
}

describe('scheduler', () => {
  it('books two courts on the lightest accounts and does not book them again', async () => {
    const store = primedStore();
    const gateway = new FakeGymGateway();
    const sessions = new SessionPool(gateway);
    await runSchedulerTick({ now: OPEN, store, gateway, sessions, config: testConfig({ dirMaxPerDay: 1 }), log: () => undefined });
    expect(gateway.bookings.map((booking) => booking.username)).toEqual(['nif-b', 'nif-a']);
    expect(store.occurrences.get('occ')?.courtsTargeted).toBe(2);
    await runSchedulerTick({ now: new Date(OPEN.getTime() + 1000), store, gateway, sessions, config: testConfig({ dirMaxPerDay: 1 }), log: () => undefined });
    expect(gateway.bookings).toHaveLength(2);
    await sessions.closeAll();
  });

  it('freezes an empty opt-in at zero courts', async () => {
    const store = primedStore();
    store.optedIn.set('occ', []);
    const gateway = new FakeGymGateway();
    await runSchedulerTick({
      now: OPEN,
      store,
      gateway,
      sessions: new SessionPool(gateway),
      config: testConfig(),
      log: () => undefined,
    });
    expect(gateway.bookings).toHaveLength(0);
    expect(store.occurrences.get('occ')?.courtsTargeted).toBe(0);
  });

  it('skips an account that is already at the daily cap', async () => {
    const store = primedStore();
    store.optedIn.set('occ', ['p1']);
    store.base[0]!.bookingsOnDay = 2;
    store.base[1]!.bookingsOnDay = 2;
    const gateway = new FakeGymGateway();
    await runSchedulerTick({
      now: OPEN,
      store,
      gateway,
      sessions: new SessionPool(gateway),
      config: testConfig(),
      log: () => undefined,
    });
    expect(gateway.bookings).toHaveLength(0);
  });

  it('retries a portal failure only after the backoff', async () => {
    const store = primedStore();
    store.optedIn.set('occ', ['p1']);
    const gateway = new FakeGymGateway();
    gateway.failBooks = true;
    const sessions = new SessionPool(gateway);
    const config = testConfig();
    await runSchedulerTick({ now: OPEN, store, gateway, sessions, config, log: () => undefined });
    expect(gateway.bookings).toHaveLength(0);
    await runSchedulerTick({ now: new Date(OPEN.getTime() + 1000), store, gateway, sessions, config, log: () => undefined });
    expect(gateway.bookings).toHaveLength(0);
    gateway.failBooks = false;
    await runSchedulerTick({ now: new Date(OPEN.getTime() + 61_000), store, gateway, sessions, config, log: () => undefined });
    expect(gateway.bookings).toHaveLength(1);
    await sessions.closeAll();
  });

  it('cancels an empty court inside the window and leaves it alone inside the penalty guard', async () => {
    const store = new MemoryStore(60_000);
    const startsAt = new Date('2026-10-24T17:00:00.000Z');
    store.occurrences.set('occ', {
      id: 'occ',
      startsAt,
      durationMinutes: 60,
      clubCode: 'ROC',
      courtsTargeted: 1,
    });
    store.creds.set('a', { username: 'nif-a', password: 'pass-a' });
    store.reservations.push({
      id: 'res-1',
      occurrenceId: 'occ',
      courtIndex: 0,
      chargedUserId: 'a',
      externalRef: 'fake-0',
      status: 'held',
      startsAt,
      durationMinutes: 60,
      frontLeft: false,
      frontRight: false,
      effective: false,
    });
    const gateway = new FakeGymGateway();
    gateway.bookings.push({ externalRef: 'fake-0', username: 'nif-a', courtIndex: 0, startsAt: startsAt.toISOString() });
    const sessions = new SessionPool(gateway);
    await runSchedulerTick({
      now: new Date('2026-10-24T16:50:00.000Z'),
      store,
      gateway,
      sessions,
      config: testConfig(),
      log: () => undefined,
    });
    expect(store.reservations[0]?.status).toBe('held');
    expect(gateway.bookings).toHaveLength(1);
    await runSchedulerTick({
      now: new Date('2026-10-24T14:30:00.000Z'),
      store,
      gateway,
      sessions,
      config: testConfig(),
      log: () => undefined,
    });
    expect(store.reservations[0]?.status).toBe('cancelled');
    expect(gateway.bookings).toHaveLength(0);
    await sessions.closeAll();
  });
});
