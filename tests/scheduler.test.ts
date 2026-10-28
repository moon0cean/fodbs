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

  it('books thirty minutes later on another court when the planned time is taken', async () => {
    const store = primedStore();
    store.optedIn.set('occ', ['p1']);
    store.emails.set('p1', 'p1@example.com');
    const gateway = new FakeGymGateway();
    const later = new Date(START.getTime() + 30 * 60_000);
    const earlier = new Date(START.getTime() - 30 * 60_000);
    for (const courtIndex of [0, 1, 2, 3]) {
      gateway.unavailable.add(`${courtIndex}|${START.toISOString()}`);
      gateway.unavailable.add(`${courtIndex}|${earlier.toISOString()}`);
    }
    for (const courtIndex of [0, 2, 3]) gateway.unavailable.add(`${courtIndex}|${later.toISOString()}`);
    const notices: string[][] = [];
    const sessions = new SessionPool(gateway);
    await runSchedulerTick({
      now: OPEN,
      store,
      gateway,
      sessions,
      config: testConfig(),
      log: () => undefined,
      notifyMiss: async ({ emails }) => {
        notices.push(emails);
      },
    });
    expect(gateway.bookings).toEqual([
      expect.objectContaining({ courtIndex: 1, startsAt: later.toISOString() }),
    ]);
    expect(store.reservations[0]?.startsAt.toISOString()).toBe(later.toISOString());
    expect(notices).toEqual([]);
    await sessions.closeAll();
  });

  it('emails once and stores no reservation when every nearby court is taken', async () => {
    const store = primedStore();
    store.optedIn.set('occ', ['p1']);
    store.emails.set('p1', 'p1@example.com');
    const gateway = new FakeGymGateway();
    for (const offset of [0, -30, 30]) {
      const startsAt = new Date(START.getTime() + offset * 60_000);
      for (const courtIndex of [0, 1, 2, 3]) gateway.unavailable.add(`${courtIndex}|${startsAt.toISOString()}`);
    }
    const notices: string[][] = [];
    const sessions = new SessionPool(gateway);
    const tick = (now: Date) => runSchedulerTick({
      now,
      store,
      gateway,
      sessions,
      config: testConfig(),
      log: () => undefined,
      notifyMiss: async ({ emails }) => {
        notices.push(emails);
      },
    });
    await tick(OPEN);
    await tick(new Date(OPEN.getTime() + 61_000));
    expect(gateway.bookings).toHaveLength(0);
    expect(store.reservations).toHaveLength(0);
    expect(notices).toEqual([['p1@example.com']]);
    await sessions.closeAll();
  });

  it('does not grab another court when that time is already booked', async () => {
    const store = primedStore();
    store.occurrences.get('occ')!.courtsTargeted = 1;
    store.occurrences.set('imported', {
      id: 'imported',
      startsAt: START,
      durationMinutes: 60,
      clubCode: 'ROC',
      courtsTargeted: 1,
    });
    store.reservations.push({
      id: 'already',
      occurrenceId: 'imported',
      courtIndex: 3,
      chargedUserId: 'a',
      externalRef: '126380',
      status: 'held',
      startsAt: START,
      durationMinutes: 60,
      occupants: 2,
      effective: true,
    });
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
      occupants: 0,
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

  it('stays on the planned time when the offset is switched off', async () => {
    const store = primedStore();
    store.settings = {
      horizonDays: 7,
      tickSeconds: 15,
      tryOffset: false,
      availabilityEnabled: false,
      availabilityAccountId: null,
      availabilityIntervalHours: 6,
      availabilityCheckedAt: null,
    };
    store.occurrences.set('occ', { id: 'occ', startsAt: START, durationMinutes: 60, clubCode: 'ROC', courtsTargeted: 1 });
    store.optedIn.set('occ', ['p1']);
    const gateway = new FakeGymGateway();
    for (let courtIndex = 0; courtIndex < 4; courtIndex += 1) {
      gateway.unavailable.add(`${courtIndex}|${START.toISOString()}`);
    }
    const sessions = new SessionPool(gateway);
    await runSchedulerTick({ now: OPEN, store, gateway, sessions, config: testConfig(), log: () => undefined });
    expect(gateway.bookings).toHaveLength(0);
    await sessions.closeAll();
  });

  it('records free and busy courts without booking them', async () => {
    const store = primedStore();
    store.settings = {
      horizonDays: 7,
      tickSeconds: 15,
      tryOffset: true,
      availabilityEnabled: true,
      availabilityAccountId: 'a',
      availabilityIntervalHours: 6,
      availabilityCheckedAt: null,
    };
    store.occurrences.set('occ', { id: 'occ', startsAt: START, durationMinutes: 60, clubCode: 'ROC', courtsTargeted: null });
    store.optedIn.set('occ', []);
    const gateway = new FakeGymGateway();
    gateway.unavailable.add(`0|${START.toISOString()}`);
    const sessions = new SessionPool(gateway);
    await runSchedulerTick({ now: OPEN, store, gateway, sessions, config: testConfig(), log: () => undefined });
    expect(gateway.bookings).toHaveLength(0);
    expect(store.checks.find((check) => check.courtIndex === 0)?.free).toBe(false);
    expect(store.checks.filter((check) => check.free)).toHaveLength(3);
    const seen = gateway.inspects;
    await runSchedulerTick({ now: new Date(OPEN.getTime() + 1000), store, gateway, sessions, config: testConfig(), log: () => undefined });
    expect(gateway.inspects).toBe(seen);
    await sessions.closeAll();
  });
});
