import { describe, expect, it } from 'vitest';
import {
  addGuest,
  balanceMinutes,
  groupCourtCounts,
  slotsToTry,
  assignOptedIn,
  buildCourts,
  alternateSlots,
  courtsToBook,
  occurrenceStarts,
  partyDivisor,
  windowDates,
  pickAccount,
  placeMember,
  redactInviteUrl,
  redactSecrets,
  horizonOpenAt,
  shouldCancel,
  type ShapedReservation,
} from '../src/domain.js';

describe('alternateSlots', () => {
  it('tries every court at the planned time before shifting by 30 minutes', () => {
    const slots = alternateSlots(4);
    expect(slots.slice(0, 4)).toEqual([
      { offsetMinutes: 0, courtIndex: 0 },
      { offsetMinutes: 0, courtIndex: 1 },
      { offsetMinutes: 0, courtIndex: 2 },
      { offsetMinutes: 0, courtIndex: 3 },
    ]);
    expect(slots[4]).toEqual({ offsetMinutes: -30, courtIndex: 0 });
    expect(slots[8]).toEqual({ offsetMinutes: 30, courtIndex: 0 });
  });
});

describe('courtsToBook', () => {
  it('books one court per three players and never more than four', () => {
    expect(courtsToBook(0, 4, 3)).toBe(0);
    expect(courtsToBook(1, 4, 3)).toBe(1);
    expect(courtsToBook(3, 4, 3)).toBe(1);
    expect(courtsToBook(4, 4, 3)).toBe(2);
    expect(courtsToBook(5, 4, 3)).toBe(2);
    expect(courtsToBook(12, 4, 3)).toBe(4);
    expect(courtsToBook(13, 4, 3)).toBe(4);
  });
});

describe('pickAccount', () => {
  const limits = { perDay: 2, simultaneous: 3 };

  it('chooses the lowest booked-minus-played account under quota', () => {
    const chosen = pickAccount(
      [
        { userId: 'a', bookedMinutes: 120, playedMinutes: 0, bookingsOnDay: 0, simultaneousHeld: 0 },
        { userId: 'b', bookedMinutes: 0, playedMinutes: 60, bookingsOnDay: 0, simultaneousHeld: 0 },
      ],
      limits,
    );
    expect(chosen?.userId).toBe('b');
  });

  it('skips accounts that are out of daily or simultaneous quota', () => {
    const chosen = pickAccount(
      [
        { userId: 'a', bookedMinutes: 0, playedMinutes: 60, bookingsOnDay: 2, simultaneousHeld: 0 },
        { userId: 'b', bookedMinutes: 0, playedMinutes: 0, bookingsOnDay: 0, simultaneousHeld: 3 },
        { userId: 'c', bookedMinutes: 60, playedMinutes: 0, bookingsOnDay: 1, simultaneousHeld: 1 },
      ],
      limits,
    );
    expect(chosen?.userId).toBe('c');
  });
});

describe('partyDivisor', () => {
  it('uses two when more players prefer pairs', () => {
    expect(partyDivisor([2, 2, 3])).toBe(2);
    expect(partyDivisor([3, 3, 2])).toBe(3);
    expect(partyDivisor([])).toBe(3);
  });
});

describe('horizon opening', () => {
  it('opens at midnight Madrid one week before the slot day', () => {
    const startsAt = new Date('2026-10-26T16:00:00.000Z');
    expect(horizonOpenAt(startsAt, 7, 'Europe/Madrid').toISOString()).toBe('2026-10-18T22:00:00.000Z');
  });
});

describe('shouldCancel', () => {
  const startsAt = new Date('2026-10-24T17:00:00.000Z');
  const zone = 'Europe/Madrid';

  it('cancels a single player from 23:55 the evening before, and not inside the penalty guard', () => {
    const missing = { frontLeft: true, frontRight: false, effective: false, startsAt, zone, penaltyGuardMinutes: 20 };
    expect(shouldCancel({ ...missing, now: new Date('2026-10-23T21:54:00.000Z') })).toBe(false);
    expect(shouldCancel({ ...missing, now: new Date('2026-10-23T21:55:00.000Z') })).toBe(true);
    expect(shouldCancel({ ...missing, now: new Date('2026-10-24T14:30:00.000Z') })).toBe(true);
    expect(shouldCancel({ ...missing, frontRight: true, now: new Date('2026-10-23T21:55:00.000Z') })).toBe(false);
    expect(shouldCancel({ ...missing, effective: true, now: new Date('2026-10-23T21:55:00.000Z') })).toBe(false);
    expect(shouldCancel({ ...missing, now: new Date('2026-10-24T16:50:00.000Z') })).toBe(false);
  });
});

function held(id: string, occupants: ShapedReservation['occupants']): ShapedReservation {
  return { id, status: 'held', hostUserId: null, occupants };
}

describe('balances and seats', () => {
  const now = new Date('2026-10-18T17:00:00.000Z');
  const past = new Date('2026-10-11T16:00:00.000Z');
  const reservations = [
    { chargedUserId: 'a', hostUserId: null, status: 'held', durationMinutes: 60, startsAt: past, effective: true, memberIds: ['a', 'b'], guestCount: 0 },
    { chargedUserId: 'b', hostUserId: null, status: 'cancelled', durationMinutes: 60, startsAt: past, effective: true, memberIds: ['a'], guestCount: 0 },
    { chargedUserId: 'a', hostUserId: 'b', status: 'held', durationMinutes: 60, startsAt: past, effective: true, memberIds: ['b'], guestCount: 1 },
  ];

  it('ignores cancelled reservations and charges the host for a guest court', () => {
    expect(balanceMinutes(reservations, now, 'Europe/Madrid', 'a')).toEqual({ bookedMinutes: 60, weekBookedMinutes: 0, nextWeekBookedMinutes: 0, playedMinutes: 60, differenceMinutes: 0 });
    expect(balanceMinutes(reservations, now, 'Europe/Madrid', 'b')).toEqual({ bookedMinutes: 60, weekBookedMinutes: 0, nextWeekBookedMinutes: 0, playedMinutes: 120, differenceMinutes: 60 });
    expect(balanceMinutes(reservations, now, 'Europe/Madrid')).toEqual({ bookedMinutes: 120, weekBookedMinutes: 0, nextWeekBookedMinutes: 0, playedMinutes: 180, differenceMinutes: 60 });
  });

  it('counts next week’s empty court as booked and leaves the difference unchanged', () => {
    const rows = [
      ...reservations,
      { chargedUserId: 'a', hostUserId: null, status: 'held', durationMinutes: 60, startsAt: new Date('2026-10-19T16:00:00.000Z'), effective: true, memberIds: ['a'], guestCount: 0 },
      { chargedUserId: 'a', hostUserId: null, status: 'held', durationMinutes: 60, startsAt: new Date('2026-10-21T16:00:00.000Z'), effective: true, memberIds: ['a'], guestCount: 0 },
      { chargedUserId: 'a', hostUserId: null, status: 'held', durationMinutes: 60, startsAt: new Date('2026-10-22T15:30:00.000Z'), effective: false, memberIds: [], guestCount: 0 },
    ];
    expect(balanceMinutes(rows, now, 'Europe/Madrid', 'a')).toEqual({ bookedMinutes: 240, weekBookedMinutes: 0, nextWeekBookedMinutes: 180, playedMinutes: 60, differenceMinutes: 0 });
  });

  it('counts group courts once, this week, next week, and already started', () => {
    const mondayMorning = new Date('2026-10-19T08:00:00.000Z');
    expect(groupCourtCounts([
      { status: 'held', startsAt: new Date('2026-10-19T16:00:00.000Z') },
      { status: 'held', startsAt: new Date('2026-10-26T16:00:00.000Z') },
      { status: 'held', startsAt: new Date('2026-10-12T16:00:00.000Z') },
      { status: 'cancelled', startsAt: new Date('2026-10-19T16:00:00.000Z') },
    ], mondayMorning, 'Europe/Madrid')).toEqual({ weekRemaining: 1, nextWeek: 1, played: 1 });
    expect(slotsToTry(4, false).every((slot) => slot.offsetMinutes === 0)).toBe(true);
    expect(slotsToTry(2, true)).toHaveLength(6);
  });

  it('counts this week’s future booking without changing the difference', () => {
    const mondayMorning = new Date('2026-10-19T08:00:00.000Z');
    const mondayEvening = new Date('2026-10-19T16:00:00.000Z');
    const rows = [
      { chargedUserId: 'a', hostUserId: null, status: 'held', durationMinutes: 60, startsAt: mondayEvening, effective: true, memberIds: ['a'], guestCount: 0 },
    ];
    expect(balanceMinutes(rows, mondayMorning, 'Europe/Madrid', 'a')).toEqual({ bookedMinutes: 60, weekBookedMinutes: 60, nextWeekBookedMinutes: 0, playedMinutes: 0, differenceMinutes: 0 });
  });

  it('moves a player onto an empty box and refuses a taken box', () => {
    const moved = placeMember({
      reservations: [
        held('r1', [{ id: 's1', position: 'front_left', userId: 'a', guestName: null }]),
        held('r2', []),
      ],
      actorId: 'a',
      actorActive: true,
      targetId: 'r2',
      position: 'front_right',
      join: true,
      now: new Date('2026-10-24T12:00:00.000Z'),
      startsAt: new Date('2026-10-24T17:00:00.000Z'),
      seatId: 's-new',
    });
    expect(moved.ok && moved.reservations.map((reservation) => reservation.occupants.map((occupant) => occupant.userId))).toEqual([[], ['a']]);

    const taken = placeMember({
      reservations: [held('r1', [{ id: 's1', position: 'front_left', userId: 'a', guestName: null }])],
      actorId: 'd',
      actorActive: true,
      targetId: 'r1',
      position: 'front_left',
      join: true,
      now: new Date('2026-10-24T12:00:00.000Z'),
      startsAt: new Date('2026-10-24T17:00:00.000Z'),
      seatId: 's-new',
    });
    expect(taken).toEqual({ ok: false, error: 'taken' });
  });

  it('lets a seated member add a guest and keeps the last member with that guest', () => {
    const court = held('r1', [{ id: 's1', position: 'front_left', userId: 'a', guestName: null }]);
    const refused = addGuest({ reservation: held('r1', []), actorId: 'a', name: 'Luis', position: 'back', seatId: 'g1' });
    expect(refused).toEqual({ ok: false, error: 'not_on_court' });
    const blank = addGuest({ reservation: court, actorId: 'a', name: '   ', position: 'front_right', seatId: 'g0' });
    expect(blank.ok && blank.reservation.occupants.find((occupant) => occupant.id === 'g0')?.guestName).toBe(null);
    const added = addGuest({ reservation: court, actorId: 'a', name: 'Luis', position: 'back', seatId: 'g1' });
    expect(added.ok && added.reservation.hostUserId).toBe('a');
    if (!added.ok) return;
    const leave = placeMember({
      reservations: [added.reservation],
      actorId: 'a',
      actorActive: true,
      targetId: 'r1',
      position: 'front_left',
      join: false,
      now: new Date('2026-10-24T12:00:00.000Z'),
      startsAt: new Date('2026-10-24T17:00:00.000Z'),
      seatId: 's-new',
    });
    expect(leave).toEqual({ ok: false, error: 'last_member' });
  });

  it('puts opted-in players on the courts that will be booked', () => {
    const courts = buildCourts({ maxCourts: 4, courtsTargeted: null, reservations: [] });
    const assigned = assignOptedIn({
      courts,
      courtsTargeted: null,
      players: [
        { id: 'a', displayName: 'Ana', partySize: 3 },
        { id: 'b', displayName: 'Bea', partySize: 3 },
      ],
    });
    expect(assigned[0]?.occupants.map((occupant) => occupant.displayName)).toEqual(['Ana', 'Bea']);
    expect(assigned[0]?.occupants.map((occupant) => occupant.position)).toEqual(['front_left', 'front_right']);
    expect(assigned[1]?.occupants).toEqual([]);
  });

  it('marks unbooked courts open before the freeze and skipped after it', () => {
    expect(buildCourts({ maxCourts: 4, courtsTargeted: null, reservations: [] }).map((court) => court.status)).toEqual([
      'open',
      'open',
      'open',
      'open',
    ]);
    expect(buildCourts({ maxCourts: 4, courtsTargeted: 1, reservations: [] }).map((court) => court.status)).toEqual([
      'pending',
      'skipped',
      'skipped',
      'skipped',
    ]);
  });

  it('keeps a booked court 11 from painting the player on court 04', () => {
    const courts = buildCourts({
      maxCourts: 4,
      courtsTargeted: 1,
      reservations: [{
        id: 'r',
        courtIndex: 3,
        status: 'held',
        startsAt: new Date('2026-10-19T16:00:00.000Z'),
        occupants: [{ id: 's', position: 'front_right', userId: 'jon', guestName: null, displayName: 'Jonatan' }],
      }],
    });
    expect(courts.map((court) => court.status)).toEqual(['skipped', 'skipped', 'skipped', 'held']);
    const assigned = assignOptedIn({
      courts,
      courtsTargeted: 1,
      players: [
        { id: 'jon', displayName: 'Jonatan', partySize: 3 },
        { id: 'ana', displayName: 'Ana', partySize: 3 },
      ],
    });
    expect(assigned[0]?.occupants).toEqual([]);
    expect(assigned[3]?.occupants.map((occupant) => occupant.displayName)).toEqual(['Jonatan', 'Ana']);
  });
});

describe('occurrenceStarts', () => {
  it('places Monday 19:00 Madrid on the matching UTC instant', () => {
    const rows = occurrenceStarts({
      now: new Date('2026-10-17T10:00:00.000Z'),
      zone: 'Europe/Madrid',
      horizonDays: 7,
      historyDays: 0,
      rules: [{ id: 'rule', weekday: 1, startTime: '19:00', durationMinutes: 60, clubCode: 'ROC', active: true }],
    });
    expect(rows.map((row) => row.startsAt.toISOString())).toContain('2026-10-19T17:00:00.000Z');
  });
});

describe('windowDates', () => {
  it('starts on the current Madrid day', () => {
    const dates = windowDates(new Date('2026-10-18T16:00:00.000Z'), 'Europe/Madrid', 0, 7);
    expect(dates[0]).toBe('2026-10-18');
    expect(dates.at(-1)).toBe('2026-10-25');
    expect(dates).not.toContain('2026-10-17');
  });
});

describe('redactSecrets', () => {
  it('strips gym secrets from error text', () => {
    expect(redactSecrets('login failed for secret-pass', ['secret-pass'])).toBe('login failed for [redacted]');
    expect(redactInviteUrl('/invite/abc.def?x=1')).toBe('/invite/[redacted]?x=1');
  });
});
