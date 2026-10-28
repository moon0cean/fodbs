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
  occupants: number;
  effective: boolean;
};

export class MemoryStore implements SchedulerStore {
  readonly occurrences = new Map<string, UpcomingOccurrence>();
  readonly optedIn = new Map<string, string[]>();
  readonly partySizes = new Map<string, 2 | 3>();
  readonly base: AccountCandidate[] = [];
  readonly creds = new Map<string, { username: string; password: string }>();
  readonly emails = new Map<string, string>();
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

  async reservationsAt(startsAt: Date, clubCode: string): Promise<number> {
    const ids = new Set([...this.occurrences.values()].filter((item) => item.startsAt.getTime() === startsAt.getTime() && item.clubCode === clubCode).map((item) => item.id));
    return this.reservations.filter((reservation) => ids.has(reservation.occurrenceId) && reservation.status !== 'cancelled').length;
  }

  async reservationCourtIndexes(occurrenceId: string): Promise<Set<number>> {
    return new Set(this.reservations.filter((reservation) => reservation.occurrenceId === occurrenceId && reservation.status !== 'cancelled').map((reservation) => reservation.courtIndex));
  }

  async missRecipients(occurrenceId: string): Promise<string[]> {
    return (this.optedIn.get(occurrenceId) ?? []).flatMap((userId) => {
      const email = this.emails.get(userId);
      return email ? [email] : [];
    });
  }

  async claimMiss(occurrenceId: string): Promise<boolean> {
    const key = `miss:${occurrenceId}`;
    if (this.attempts.has(key)) return false;
    this.attempts.set(key, { status: 'succeeded', updatedAt: new Date() });
    return true;
  }

  async releaseMiss(occurrenceId: string): Promise<void> {
    this.attempts.delete(`miss:${occurrenceId}`);
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
    startsAt: Date;
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
      startsAt: input.startsAt,
      durationMinutes: occurrence?.durationMinutes ?? 60,
      occupants: 1,
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
        occupants: reservation.occupants,
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

  settings: {
    horizonDays: number;
    tickSeconds: number;
    tryOffset: boolean;
    availabilityEnabled: boolean;
    availabilityAccountId: string | null;
    availabilityIntervalHours: number;
    availabilityCheckedAt: Date | null;
  } | null = null;

  readonly checks: { occurrenceId: string; courtIndex: number; free: boolean }[] = [];

  async schedulerSettings() {
    return this.settings;
  }

  async saveCourtChecks(rows: { occurrenceId: string; courtIndex: number; free: boolean; checkedAt: Date }[]): Promise<void> {
    for (const row of rows) {
      const index = this.checks.findIndex((item) => item.occurrenceId === row.occurrenceId && item.courtIndex === row.courtIndex);
      const next = { occurrenceId: row.occurrenceId, courtIndex: row.courtIndex, free: row.free };
      if (index >= 0) this.checks[index] = next;
      else this.checks.push(next);
    }
  }

  async requestSync(): Promise<boolean> {
    return false;
  }

  async markAvailabilityChecked(now: Date): Promise<void> {
    if (this.settings) this.settings.availabilityCheckedAt = now;
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
