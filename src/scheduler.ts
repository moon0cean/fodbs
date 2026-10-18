import { DateTime } from 'luxon';
import {
  alternateSlots,
  courtsToBook,
  horizonOpenAt,
  madridDate,
  notePick,
  partyDivisor,
  pickAccount,
  redactSecrets,
  shouldCancel,
  type AccountCandidate,
  type PickExtra,
} from './domain.js';
import type { GymBookRequest, GymGateway, GymSession } from './gym/gateway.js';

export type UpcomingOccurrence = {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  clubCode: string;
  courtsTargeted: number | null;
};

export type SchedulerConfig = {
  horizonDays: number;
  zone: string;
  cancelLeadMinutes: number;
  penaltyGuardMinutes: number;
  maxCourts: number;
  maxPlayersPerCourt: number;
  dirMaxPerDay: number;
  dirMaxSimultaneous: number;
  preLoginMinutes: number;
  attemptBackoffMs: number;
};

export interface SchedulerStore {
  ensureOccurrences(now: Date): Promise<void>;
  markPlayed(now: Date): Promise<void>;
  listUpcoming(now: Date): Promise<UpcomingOccurrence[]>;
  optedInPlayers(occurrenceId: string): Promise<{ userId: string; partySize: 2 | 3 }[]>;
  candidates(startsAt: Date, now: Date): Promise<AccountCandidate[]>;
  credentials(userId: string): Promise<{ username: string; password: string } | null>;
  freezeCourts(occurrenceId: string, courtsTargeted: number, now: Date): Promise<number>;
  reservationCourtIndexes(occurrenceId: string): Promise<Set<number>>;
  missRecipients(occurrenceId: string): Promise<string[]>;
  claimMiss(occurrenceId: string): Promise<boolean>;
  releaseMiss(occurrenceId: string): Promise<void>;
  claimAttempt(key: string, kind: 'grab' | 'cancel', now: Date): Promise<'claimed' | 'done' | 'busy'>;
  finishAttempt(key: string, status: 'succeeded' | 'failed', detail: string, now: Date): Promise<void>;
  createReservation(input: {
    occurrenceId: string;
    courtIndex: number;
    chargedUserId: string;
    externalRef: string;
    startsAt: Date;
    now: Date;
  }): Promise<void>;
  heldOpen(now: Date): Promise<{
    id: string;
    chargedUserId: string;
    externalRef: string;
    startsAt: Date;
    frontLeft: boolean;
    frontRight: boolean;
    effective: boolean;
  }[]>;
  markEffective(id: string): Promise<void>;
  markCancelled(id: string, now: Date): Promise<void>;
}

export class SessionPool {
  private readonly open = new Map<string, GymSession>();

  constructor(private readonly gateway: GymGateway) {}

  async get(userId: string, login: { username: string; password: string }): Promise<GymSession> {
    const existing = this.open.get(userId);
    if (existing) return existing;
    const session = await this.gateway.openSession(login);
    this.open.set(userId, session);
    return session;
  }

  async retainOnly(userIds: Set<string>): Promise<void> {
    for (const [userId, session] of this.open) {
      if (userIds.has(userId)) continue;
      await this.gateway.close(session);
      this.open.delete(userId);
    }
  }

  async closeAll(): Promise<void> {
    for (const session of this.open.values()) await this.gateway.close(session);
    this.open.clear();
  }
}

const MINUTE = 60_000;
const UNAVAILABLE = new Set(['slot_unavailable', 'duration_unavailable', 'court_unavailable', 'bons_unavailable']);

export async function runSchedulerTick(input: {
  now: Date;
  store: SchedulerStore;
  gateway: GymGateway;
  sessions: SessionPool;
  config: SchedulerConfig;
  log: (event: Record<string, unknown>) => void;
  notifyMiss?: (input: { when: string; emails: string[] }) => Promise<void>;
}): Promise<void> {
  const { now, store, gateway, sessions, config, log, notifyMiss } = input;
  await store.markPlayed(now);
  await store.ensureOccurrences(now);
  if (!gateway.ready()) {
    log({ msg: 'gym_flow_unconfigured' });
    return;
  }

  const upcoming = await store.listUpcoming(now);
  const limits = { perDay: config.dirMaxPerDay, simultaneous: config.dirMaxSimultaneous };
  const keep = new Set<string>();
  const warmed: PickExtra = new Map();

  for (const occurrence of upcoming) {
    if (occurrence.courtsTargeted !== null) continue;
    const openAt = horizonOpenAt(occurrence.startsAt, config.horizonDays);
    const warmAt = new Date(openAt.getTime() - config.preLoginMinutes * MINUTE);
    if (now < warmAt || now >= openAt) continue;
    const optedIn = await store.optedInPlayers(occurrence.id);
    const count = courtsToBook(optedIn.length, config.maxCourts, partyDivisor(optedIn.map((player) => player.partySize)));
    const candidates = await store.candidates(occurrence.startsAt, now);
    for (let index = 0; index < count; index += 1) {
      const account = pickAccount(candidates, limits, warmed);
      if (!account) break;
      notePick(warmed, account.userId);
      keep.add(account.userId);
      const creds = await store.credentials(account.userId);
      if (!creds) continue;
      try {
        await sessions.get(account.userId, creds);
        log({ msg: 'prelogin', userId: account.userId, occurrenceId: occurrence.id });
      } catch (error) {
        log({
          msg: 'prelogin_failed',
          userId: account.userId,
          occurrenceId: occurrence.id,
          detail: redactSecrets(errorText(error), [creds.username, creds.password]),
        });
      }
    }
  }

  for (const occurrence of upcoming) {
    const openAt = horizonOpenAt(occurrence.startsAt, config.horizonDays);
    if (now < openAt) continue;
    let targeted = occurrence.courtsTargeted;
    if (targeted === null) {
      const optedIn = await store.optedInPlayers(occurrence.id);
      const frozen = courtsToBook(optedIn.length, config.maxCourts, partyDivisor(optedIn.map((player) => player.partySize)));
      targeted = await store.freezeCourts(occurrence.id, frozen, now);
    }
    if (targeted <= 0) continue;
    const taken = await store.reservationCourtIndexes(occurrence.id);
    let secured = taken.size;
    let hardMiss = false;
    let pendingRetry = false;
    let transient = false;
    const day = madridDate(occurrence.startsAt, config.zone);
    for (const slot of alternateSlots(config.maxCourts)) {
      if (secured >= targeted || transient) break;
      if (taken.has(slot.courtIndex)) continue;
      const startsAt = new Date(occurrence.startsAt.getTime() + slot.offsetMinutes * MINUTE);
      if (startsAt.getTime() <= now.getTime() || madridDate(startsAt, config.zone) !== day) continue;
      const account = pickAccount(await store.candidates(startsAt, now), limits);
      if (!account) {
        log({ msg: 'no_eligible_account', occurrenceId: occurrence.id, courtIndex: slot.courtIndex });
        break;
      }
      const key = `grab:${occurrence.id}:${slot.offsetMinutes}:${slot.courtIndex}`;
      const claim = await store.claimAttempt(key, 'grab', now);
      if (claim === 'busy') {
        pendingRetry = true;
        continue;
      }
      if (claim !== 'claimed') continue;
      const creds = await store.credentials(account.userId);
      if (!creds) {
        await store.finishAttempt(key, 'failed', 'missing_credentials', now);
        continue;
      }
      keep.add(account.userId);
      try {
        const session = await sessions.get(account.userId, creds);
        const request: GymBookRequest = {
          clubCode: occurrence.clubCode,
          courtIndex: slot.courtIndex,
          startsAt,
          durationMinutes: occurrence.durationMinutes,
        };
        const booked = await gateway.book(session, request);
        try {
          await store.createReservation({
            occurrenceId: occurrence.id,
            courtIndex: slot.courtIndex,
            chargedUserId: account.userId,
            externalRef: booked.externalRef,
            startsAt,
            now,
          });
        } catch (error) {
          await gateway.cancel(session, booked.externalRef).catch(() => undefined);
          throw error;
        }
        taken.add(slot.courtIndex);
        secured += 1;
        await store.finishAttempt(key, 'succeeded', booked.externalRef, now);
        log({
          msg: 'booked',
          occurrenceId: occurrence.id,
          courtIndex: slot.courtIndex,
          offsetMinutes: slot.offsetMinutes,
          userId: account.userId,
          externalRef: booked.externalRef,
        });
      } catch (error) {
        const detail = redactSecrets(errorText(error), [creds.username, creds.password]);
        await store.finishAttempt(key, 'failed', detail, now);
        if (UNAVAILABLE.has(detail)) hardMiss = true;
        else transient = true;
        log({ msg: 'book_failed', occurrenceId: occurrence.id, courtIndex: slot.courtIndex, offsetMinutes: slot.offsetMinutes, userId: account.userId, detail });
      }
    }
    if (secured === 0 && hardMiss && !pendingRetry && !transient) {
      const claimed = await store.claimMiss(occurrence.id);
      if (!claimed || !notifyMiss) continue;
      try {
        const emails = await store.missRecipients(occurrence.id);
        if (emails.length === 0) continue;
        const when = DateTime.fromJSDate(occurrence.startsAt, { zone: config.zone }).setLocale('es').toFormat("cccc d LLL 'a las' HH:mm");
        await notifyMiss({ when, emails });
        log({ msg: 'booking_missed', occurrenceId: occurrence.id, emails: emails.length });
      } catch (error) {
        await store.releaseMiss(occurrence.id);
        log({ msg: 'booking_miss_mail_failed', occurrenceId: occurrence.id, detail: error instanceof Error ? error.message : 'error' });
      }
    }
  }

  for (const reservation of await store.heldOpen(now)) {
    const slotDay = DateTime.fromJSDate(reservation.startsAt, { zone: config.zone }).startOf('day');
    const frontsFilled = reservation.frontLeft && reservation.frontRight;
    if (!reservation.effective && frontsFilled && DateTime.fromJSDate(now, { zone: config.zone }) >= slotDay) {
      await store.markEffective(reservation.id);
      reservation.effective = true;
    }
    const inWindow = shouldCancel({
      frontLeft: reservation.frontLeft,
      frontRight: reservation.frontRight,
      effective: reservation.effective,
      now,
      startsAt: reservation.startsAt,
      zone: config.zone,
      penaltyGuardMinutes: config.penaltyGuardMinutes,
    });
    if (!inWindow) {
      const guard = reservation.startsAt.getTime() - config.penaltyGuardMinutes * MINUTE;
      const missingFront = !reservation.frontLeft || !reservation.frontRight;
      if (!reservation.effective && missingFront && now.getTime() >= guard && now.getTime() < reservation.startsAt.getTime()) {
        log({ msg: 'cancel_skipped_penalty_guard', reservationId: reservation.id });
      }
      continue;
    }
    const key = `cancel:${reservation.id}`;
    const claim = await store.claimAttempt(key, 'cancel', now);
    if (claim !== 'claimed') continue;
    const creds = await store.credentials(reservation.chargedUserId);
    if (!creds) {
      await store.finishAttempt(key, 'failed', 'missing_credentials', now);
      continue;
    }
    keep.add(reservation.chargedUserId);
    try {
      const session = await sessions.get(reservation.chargedUserId, creds);
      await gateway.cancel(session, reservation.externalRef);
      await store.markCancelled(reservation.id, now);
      await store.finishAttempt(key, 'succeeded', reservation.externalRef, now);
      log({
        msg: 'cancelled',
        reservationId: reservation.id,
        userId: reservation.chargedUserId,
        externalRef: reservation.externalRef,
      });
    } catch (error) {
      const detail = redactSecrets(errorText(error), [creds.username, creds.password]);
      await store.finishAttempt(key, 'failed', detail, now);
      log({ msg: 'cancel_failed', reservationId: reservation.id, userId: reservation.chargedUserId, detail });
    }
  }

  await sessions.retainOnly(keep);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'error';
}
