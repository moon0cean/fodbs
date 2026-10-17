import type { SchedulerConfig, SchedulerStore, UpcomingOccurrence } from '../src/scheduler.js';
import { madridDate, type AccountCandidate } from '../src/domain.js';

export type MemoryReservation = {
  id: string;
  occurrenceId: string;
  courtIndex: number;
  chargedUserId: string;
  externalRef: string;
  status: 'held' | 'cancelled' | 'played';
  startsAt: Date;
  durationMinutes: number;
  frontLeft: boolean;
  frontRight: boolean;
  effective: boolean;
};

export class MemoryStore implements SchedulerStore {
  readonly occurrences = new Map<string, UpcomingOccurrence>();
  readonly optedIn = new Map<string, string[]>();
  readonly partySizes = new Map<string, 2 | 3>();
  readonly base: AccountCandidate[] = [];
  readonly creds = new Map<string, { username: string; password: string }>();
  readonly reservations: MemoryReservation[] = [];
  private readonly attempts = new Map<string, { status: 'pending' | 'succeeded' | 'failed'; updatedAt: Date }>();
  private seq = 1;

  constructor(private readonly backoffMs: number, private readonly zone = 'Europe/Madrid') {}

  async ensureOccurrences(): Promise<void> {}

  async markPlayed(now: Date): Promise<void> {
    for (const reservation of this.reservations) {
      if (reservation.status === 'held' && reservation.startsAt.getTime() <= now.getTime()) reservation.status = 'played';
    }
  }

  async listUpcoming(now: Date): Promise<UpcomingOccurrence[]> {
    return [...this.occurrences.values()].filter((occurrence) => occurrence.startsAt.getTime() > now.getTime());
  }

  async optedInPlayers(occurrenceId: string): Promise<{ userId: string; partySize: 2 | 3 }[]> {
    return (this.optedIn.get(occurrenceId) ?? []).map((userId) => ({
      userId,
      partySize: this.partySizes.get(userId) ?? 3,
    }));
  }

  async candidates(startsAt: Date, now: Date): Promise<AccountCandidate[]> {
    const day = madridDate(startsAt, this.zone);
    return this.base.filter((user) => this.creds.has(user.userId)).map((user) => {
      const added = this.reservations.filter((reservation) => reservation.chargedUserId === user.userId && reservation.status !== 'cancelled');
      return {
        userId: user.userId,
        bookedMinutes: user.bookedMinutes + added.reduce((sum, reservation) => sum + reservation.durationMinutes, 0),
        playedMinutes: user.playedMinutes,
        bookingsOnDay: user.bookingsOnDay + added.filter((reservation) => madridDate(reservation.startsAt, this.zone) === day).length,
        simultaneousHeld:
          user.simultaneousHeld +
          added.filter((reservation) => reservation.status === 'held' && reservation.startsAt.getTime() > now.getTime()).length,
      };
    });
  }

  async credentials(userId: string): Promise<{ username: string; password: string } | null> {
    return this.creds.get(userId) ?? null;
  }

  async freezeCourts(occurrenceId: string, courtsTargeted: number): Promise<number> {
    const occurrence = this.occurrences.get(occurrenceId);
    if (!occurrence) return courtsTargeted;
    if (occurrence.courtsTargeted === null) occurrence.courtsTargeted = courtsTargeted;
    return occurrence.courtsTargeted;
  }

  async reservationCourtIndexes(occurrenceId: string): Promise<Set<number>> {
    return new Set(this.reservations.filter((reservation) => reservation.occurrenceId === occurrenceId).map((reservation) => reservation.courtIndex));
  }

  async claimAttempt(key: string, _kind: 'grab' | 'cancel', now: Date): Promise<'claimed' | 'done' | 'busy'> {
    const row = this.attempts.get(key);
    if (!row) {
      this.attempts.set(key, { status: 'pending', updatedAt: now });
      return 'claimed';
    }
    if (row.status === 'succeeded') return 'done';
    if (now.getTime() - row.updatedAt.getTime() < this.backoffMs) return 'busy';
    row.status = 'pending';
    row.updatedAt = now;
    return 'claimed';
  }

  async finishAttempt(key: string, status: 'succeeded' | 'failed', _detail: string, now: Date): Promise<void> {
    const row = this.attempts.get(key);
    if (!row) return;
    row.status = status;
    row.updatedAt = now;
  }

  async createReservation(input: {
    occurrenceId: string;
    courtIndex: number;
    chargedUserId: string;
    externalRef: string;
    now: Date;
  }): Promise<void> {
    const occurrence = this.occurrences.get(input.occurrenceId);
    this.reservations.push({
      id: `res-${this.seq++}`,
      occurrenceId: input.occurrenceId,
      courtIndex: input.courtIndex,
      chargedUserId: input.chargedUserId,
      externalRef: input.externalRef,
      status: 'held',
      startsAt: occurrence?.startsAt ?? input.now,
      durationMinutes: occurrence?.durationMinutes ?? 60,
      frontLeft: false,
      frontRight: false,
      effective: false,
    });
  }

  async heldOpen(now: Date) {
    return this.reservations
      .filter((reservation) => reservation.status === 'held' && reservation.startsAt.getTime() > now.getTime())
      .map((reservation) => ({
        id: reservation.id,
        chargedUserId: reservation.chargedUserId,
        externalRef: reservation.externalRef,
        startsAt: reservation.startsAt,
        frontLeft: reservation.frontLeft,
        frontRight: reservation.frontRight,
        effective: reservation.effective,
      }));
  }

  async markEffective(id: string): Promise<void> {
    const reservation = this.reservations.find((item) => item.id === id);
    if (reservation) reservation.effective = true;
  }

  async markCancelled(id: string): Promise<void> {
    const reservation = this.reservations.find((item) => item.id === id);
    if (reservation && reservation.status !== 'played') reservation.status = 'cancelled';
  }
}

export function testConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    horizonDays: 7,
    zone: 'Europe/Madrid',
    cancelLeadMinutes: 180,
    penaltyGuardMinutes: 20,
    maxCourts: 4,
    maxPlayersPerCourt: 3,
    dirMaxPerDay: 2,
    dirMaxSimultaneous: 3,
    preLoginMinutes: 2,
    attemptBackoffMs: 60_000,
    ...overrides,
  };
}
