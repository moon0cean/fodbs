import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DateTime } from 'luxon';
import postgres from 'postgres';
import type { AppConfig } from '../config.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import {
  addGuest,
  assignOptedIn,
  balanceMinutes,
  buildCourts,
  courtPayer,
  madridDate,
  occurrenceStarts,
  placeMember,
  removeGuest,
  windowDates,
  type AccountCandidate,
  type ShapedReservation,
  type Spot,
} from '../domain.js';
import type { GymListedBooking } from '../gym/gateway.js';
import type { SchedulerStore, UpcomingOccurrence } from '../scheduler.js';
import { schemaSql } from './migrate.js';
import * as schema from './schema.js';
import {
  availability,
  bookingAttempts,
  accessRequests,
  gymCredentials,
  invites,
  occurrences,
  playerPreferences,
  reservations,
  seats,
  sessions,
  slotRules,
  users,
} from './schema.js';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  active: boolean;
};

type Database = PostgresJsDatabase<typeof schema>;

export class AppDatabase implements SchedulerStore {
  private constructor(
    private readonly sql: postgres.Sql,
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  static async open(config: AppConfig): Promise<AppDatabase> {
    const sql = postgres(config.databaseUrl, { max: 5 });
    const db = drizzle(sql, { schema });
    const app = new AppDatabase(sql, db, config);
    await sql.unsafe(schemaSql);
    return app;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async bootstrapAdmin(email: string, passwordHash: string, displayName: string, now: Date): Promise<boolean> {
    const existing = await this.db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) return false;
    try {
      await this.db.insert(users).values({
        id: randomUUID(),
        email,
        passwordHash,
        displayName,
        role: 'admin',
        active: true,
        createdAt: now,
      });
      return true;
    } catch (error) {
      if (isUnique(error)) return false;
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<(SessionUser & { passwordHash: string }) | null> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...toUser(row), passwordHash: row.passwordHash };
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.insert(sessions).values({ tokenHash, userId, expiresAt });
  }

  async findSession(tokenHash: string, now: Date): Promise<SessionUser | null> {
    const rows = await this.db
      .select({ user: users, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
    return toUser(row.user);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async createInvite(input: {
    tokenHash: string;
    email: string | null;
    role: 'admin' | 'member';
    createdBy: string;
    expiresAt: Date;
  }): Promise<string> {
    const id = randomUUID();
    await this.db.insert(invites).values({ id, ...input });
    return id;
  }

  async listInvites(): Promise<{ id: string; role: string; email: string | null; expiresAt: Date; usedAt: Date | null }[]> {
    const rows = await this.db.select().from(invites);
    return rows
      .map((row) => ({
        id: row.id,
        role: row.role,
        email: row.email,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
      }))
      .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
  }

  async replaceInviteToken(id: string, tokenHash: string, expiresAt: Date): Promise<{ email: string } | null> {
    const rows = await this.db.select().from(invites).where(eq(invites.id, id)).limit(1);
    const invite = rows[0];
    if (!invite || invite.usedAt || !invite.email) return null;
    await this.db.update(invites).set({ tokenHash, expiresAt }).where(eq(invites.id, id));
    return { email: invite.email };
  }

  async deleteInvite(id: string): Promise<'missing' | 'used' | 'ok'> {
    const rows = await this.db.select().from(invites).where(eq(invites.id, id)).limit(1);
    const invite = rows[0];
    if (!invite) return 'missing';
    if (invite.usedAt) return 'used';
    await this.db.delete(invites).where(eq(invites.id, id));
    return 'ok';
  }

  async requestAccess(email: string, now: Date): Promise<void> {
    const existingUser = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) return;
    const pending = await this.db
      .select({ id: accessRequests.id })
      .from(accessRequests)
      .where(and(eq(accessRequests.email, email), eq(accessRequests.status, 'pending')))
      .limit(1);
    if (pending.length > 0) return;
    await this.db.insert(accessRequests).values({
      id: randomUUID(),
      email,
      status: 'pending',
      createdAt: now,
    });
  }

  async listAccessRequests(): Promise<{ id: string; email: string; status: string; createdAt: Date }[]> {
    const rows = await this.db.select().from(accessRequests);
    return rows
      .map((row) => ({ id: row.id, email: row.email, status: row.status, createdAt: row.createdAt }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async takeAccessRequest(id: string, status: 'approved' | 'rejected', actorId: string, now: Date): Promise<{ email: string } | null> {
    const rows = await this.db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
    const request = rows[0];
    if (!request || request.status !== 'pending') return null;
    await this.db.update(accessRequests).set({ status, resolvedAt: now, resolvedBy: actorId }).where(eq(accessRequests.id, id));
    return { email: request.email };
  }

  async acceptInvite(input: {
    tokenHash: string;
    email: string;
    passwordHash: string;
    displayName: string;
    now: Date;
  }): Promise<{ user: SessionUser } | { error: string }> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(invites).where(eq(invites.tokenHash, input.tokenHash)).for('update');
      const invite = rows[0];
      if (!invite || invite.usedAt || invite.expiresAt.getTime() <= input.now.getTime()) return { error: 'invalid_invite' };
      if (invite.email && invite.email !== input.email) return { error: 'email_mismatch' };
      const taken = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (taken.length > 0) return { error: 'email_taken' };
      const id = randomUUID();
      await tx.insert(users).values({
        id,
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        role: invite.role,
        active: true,
        createdAt: input.now,
      });
      await tx.update(invites).set({ usedAt: input.now, usedBy: id }).where(eq(invites.id, invite.id));
      return {
        user: {
          id,
          email: input.email,
          displayName: input.displayName,
          role: invite.role === 'admin' ? 'admin' : 'member',
          active: true,
        },
      };
    });
  }

  async listUsers(): Promise<(SessionUser & { hasGymCredentials: boolean })[]> {
    const people = await this.db.select().from(users);
    const creds = await this.db.select({ userId: gymCredentials.userId }).from(gymCredentials);
    const withCreds = new Set(creds.map((row) => row.userId));
    return people
      .map((person) => ({ ...toUser(person), hasGymCredentials: withCreds.has(person.id) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async setOwnActive(userId: string, active: boolean, now: Date): Promise<void> {
    const user = await this.requireUser(userId);
    if (!active) {
      await this.db.update(availability).set({ declined: true }).where(eq(availability.userId, userId));
      const mine = await this.db
        .select({ occurrenceId: reservations.occurrenceId, status: reservations.status })
        .from(seats)
        .innerJoin(reservations, eq(seats.reservationId, reservations.id))
        .where(eq(seats.userId, userId));
      const seen = new Set<string>();
      for (const seat of mine) {
        if (seat.status !== 'held' || seen.has(seat.occurrenceId)) continue;
        seen.add(seat.occurrenceId);
        await this.clearOptInSeat({ id: user.id, active: true }, seat.occurrenceId, now);
      }
    }
    await this.db.update(users).set({ active }).where(eq(users.id, userId));
  }

  async setUserActive(userId: string, active: boolean, actorId: string): Promise<'ok' | 'missing' | 'self'> {
    if (userId === actorId && !active) return 'self';
    const updated = await this.db.update(users).set({ active }).where(eq(users.id, userId)).returning({ id: users.id });
    return updated.length ? 'ok' : 'missing';
  }

  async removeUser(userId: string, actorId: string): Promise<'self' | 'missing' | 'last_admin' | 'has_bookings' | 'ok'> {
    if (userId === actorId) return 'self';
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) return 'missing';
    if (user.role === 'admin') {
      const admins = await this.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
      if (admins.length < 2) return 'last_admin';
    }
    const charged = await this.db.select({ id: reservations.id }).from(reservations).where(eq(reservations.chargedUserId, userId)).limit(1);
    if (charged.length > 0) return 'has_bookings';
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
    await this.db.delete(availability).where(eq(availability.userId, userId));
    await this.db.delete(seats).where(eq(seats.userId, userId));
    await this.db.delete(playerPreferences).where(eq(playerPreferences.userId, userId));
    await this.db.delete(gymCredentials).where(eq(gymCredentials.userId, userId));
    await this.db.delete(invites).where(and(eq(invites.createdBy, userId), isNull(invites.usedAt)));
    await this.db.update(invites).set({ createdBy: actorId }).where(eq(invites.createdBy, userId));
    await this.db.delete(users).where(eq(users.id, userId));
    return 'ok';
  }

  async pendingCredentialSync(): Promise<{ userId: string; username: string; password: string }[]> {
    const rows = await this.db.select().from(gymCredentials);
    return rows
      .filter((row) => !row.syncedAt || row.syncedAt.getTime() < row.updatedAt.getTime())
      .map((row) => ({
        userId: row.userId,
        username: decryptSecret(row.usernameCiphertext, row.usernameNonce, this.config.credentialsKey, row.userId),
        password: decryptSecret(row.passwordCiphertext, row.passwordNonce, this.config.credentialsKey, row.userId),
      }));
  }

  async markCredentialsSynced(userId: string, now: Date): Promise<void> {
    await this.db.update(gymCredentials).set({ syncedAt: now }).where(eq(gymCredentials.userId, userId));
  }

  async requestSync(userId: string): Promise<boolean> {
    const rows = await this.db.update(gymCredentials).set({ syncedAt: null }).where(eq(gymCredentials.userId, userId)).returning({ userId: gymCredentials.userId });
    return rows.length > 0;
  }

  async bonsContact(userId: string): Promise<{ email: string; notice: 'ok' | 'low' | 'empty' } | null> {
    const rows = await this.db
      .select({ email: users.email, notice: gymCredentials.bonsNotice })
      .from(gymCredentials)
      .innerJoin(users, eq(users.id, gymCredentials.userId))
      .where(eq(gymCredentials.userId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const notice = row.notice === 'low' || row.notice === 'empty' ? row.notice : 'ok';
    return { email: row.email, notice };
  }

  async saveBons(userId: string, remaining: number, notice: 'ok' | 'low' | 'empty', now: Date): Promise<void> {
    await this.db.update(gymCredentials).set({
      bonsRemaining: remaining,
      bonsCheckedAt: now,
      bonsNotice: notice,
    }).where(eq(gymCredentials.userId, userId));
  }

  async importBookings(userId: string, bookings: GymListedBooking[], now: Date): Promise<number> {
    let imported = 0;
    for (const booking of bookings) {
      const known = await this.db.select({ id: reservations.id }).from(reservations).where(eq(reservations.externalRef, booking.externalRef)).limit(1);
      if (known.length > 0) continue;
      const sameTime = await this.db.select().from(occurrences).where(eq(occurrences.startsAt, booking.startsAt));
      let occurrence = sameTime.find((row) => row.durationMinutes === booking.durationMinutes && row.clubCode === booking.clubCode);
      if (!occurrence) {
        const id = randomUUID();
        await this.db.insert(occurrences).values({
          id,
          slotRuleId: null,
          startsAt: booking.startsAt,
          durationMinutes: booking.durationMinutes,
          clubCode: booking.clubCode,
          courtsTargeted: null,
          grabbedAt: booking.startsAt,
        });
        occurrence = { id, slotRuleId: null, startsAt: booking.startsAt, durationMinutes: booking.durationMinutes, clubCode: booking.clubCode, courtsTargeted: null, grabbedAt: booking.startsAt };
      }
      const taken = await this.db.select({ courtIndex: reservations.courtIndex }).from(reservations).where(eq(reservations.occurrenceId, occurrence.id));
      const used = new Set(taken.map((row) => row.courtIndex));
      let courtIndex = booking.courtIndex;
      if (used.has(courtIndex)) {
        courtIndex = [0, 1, 2, 3].find((index) => !used.has(index)) ?? -1;
      }
      if (courtIndex < 0) continue;
      const endsAt = booking.startsAt.getTime() + booking.durationMinutes * 60_000;
      const reservationId = randomUUID();
      await this.db.insert(reservations).values({
        id: reservationId,
        occurrenceId: occurrence.id,
        courtIndex,
        chargedUserId: userId,
        externalRef: booking.externalRef,
        status: endsAt <= now.getTime() ? 'played' : 'held',
        bookedAt: now,
        hostUserId: userId,
        effective: true,
      });
      await this.db.insert(seats).values({
        id: randomUUID(),
        reservationId,
        userId,
        guestName: null,
        position: 'front_left',
        createdAt: now,
      });
      imported += 1;
    }
    return imported;
  }

  async saveCredentials(userId: string, username: string, password: string, now: Date): Promise<void> {
    const userCipher = encryptSecret(username, this.config.credentialsKey, userId);
    const passCipher = encryptSecret(password, this.config.credentialsKey, userId);
    await this.db
      .insert(gymCredentials)
      .values({
        userId,
        usernameCiphertext: userCipher.ciphertext,
        usernameNonce: userCipher.nonce,
        passwordCiphertext: passCipher.ciphertext,
        passwordNonce: passCipher.nonce,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: gymCredentials.userId,
        set: {
          usernameCiphertext: userCipher.ciphertext,
          usernameNonce: userCipher.nonce,
          passwordCiphertext: passCipher.ciphertext,
          passwordNonce: passCipher.nonce,
          updatedAt: now,
          syncedAt: null,
        },
      });
  }

  async accountView(userId: string): Promise<{
    gymUsername: string | null;
    hasGymCredentials: boolean;
    balance: { bookedMinutes: number; playedMinutes: number };
    preferences: { weekdays: number[]; preferredTime: string; partySize: 2 | 3 } | null;
    bonsRemaining: number | null;
    bonsCheckedAt: Date | null;
    syncedAt: Date | null;
    reservations: {
      id: string;
      startsAt: Date;
      courtIndex: number;
      status: string;
      durationMinutes: number;
      clubCode: string;
    }[];
  }> {
    const creds = await this.db.select().from(gymCredentials).where(eq(gymCredentials.userId, userId)).limit(1);
    const gymUsername = creds[0]
      ? decryptSecret(creds[0].usernameCiphertext, creds[0].usernameNonce, this.config.credentialsKey, userId)
      : null;
    const rows = await this.balanceRows();
    const charged = rows
      .filter((row) => courtPayer(row) === userId || row.chargedUserId === userId)
      .map((row) => ({
        id: row.id,
        startsAt: row.startsAt,
        courtIndex: row.courtIndex,
        status: row.status,
        durationMinutes: row.durationMinutes,
        clubCode: row.clubCode,
      }))
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
    return {
      gymUsername,
      hasGymCredentials: Boolean(creds[0]),
      balance: balanceMinutes(rows, userId),
      preferences: await this.readPreferences(userId),
      bonsRemaining: creds[0]?.bonsRemaining ?? null,
      bonsCheckedAt: creds[0]?.bonsCheckedAt ?? null,
      syncedAt: creds[0]?.syncedAt ?? null,
      reservations: charged,
    };
  }

  async dashboard(date: string, userId: string, now: Date) {
    await this.ensureOccurrences(now);
    const dates = windowDates(now, this.config.zone, 0, this.config.horizonDays);
    if (!dates.includes(date)) return { error: 'date_out_of_range' as const };
    const people = await this.db.select().from(users).where(eq(users.active, true));
    const rows = await this.balanceRows();
    const activeUsers = people
      .map((person) => ({
        id: person.id,
        displayName: person.displayName,
        ...balanceMinutes(rows, person.id),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const day = DateTime.fromISO(date, { zone: this.config.zone }).startOf('day');
    const next = day.plus({ days: 1 });
    const occs = await this.db.select().from(occurrences);
    const dayOccs = occs
      .filter((occ) => occ.startsAt >= day.toJSDate() && occ.startsAt < next.toJSDate())
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const avail = await this.db.select().from(availability);
    const names = new Map(people.map((person) => [person.id, person.displayName]));
    const allUsers = await this.db.select({ id: users.id, displayName: users.displayName }).from(users);
    for (const person of allUsers) names.set(person.id, person.displayName);
    const reservationRows = await this.db.select().from(reservations);
    const seatRows = await this.db.select().from(seats);
    const preferenceRows = await this.db.select().from(playerPreferences);
    const partySize = new Map(preferenceRows.map((row) => [row.userId, row.partySize === 2 ? 2 as const : 3 as const]));
    const me = people.find((person) => person.id === userId) ?? (await this.requireUser(userId));
    return {
      activeUsers,
      globalBalance: balanceMinutes(rows),
      me: {
        id: me.id,
        displayName: me.displayName,
        role: me.role as 'admin' | 'member',
        hasGymCredentials: (await this.db.select().from(gymCredentials).where(eq(gymCredentials.userId, userId)).limit(1)).length > 0,
      },
      dates,
      date,
      occurrences: dayOccs.map((occ) => {
        const activeIds = new Set(people.map((person) => person.id));
        const opted = avail
          .filter((row) => row.occurrenceId === occ.id && !row.declined && activeIds.has(row.userId))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const occReservations = reservationRows.filter((row) => row.occurrenceId === occ.id);
        return {
          id: occ.id,
          startsAt: occ.startsAt,
          durationMinutes: occ.durationMinutes,
          clubCode: occ.clubCode,
          courtsTargeted: occ.courtsTargeted,
          optedIn: opted.map((row) => ({ id: row.userId, displayName: names.get(row.userId) ?? 'Member' })),
          myOptIn: opted.some((row) => row.userId === userId),
          courts: assignOptedIn({
            courtsTargeted: occ.courtsTargeted,
            players: opted.map((row) => ({
              id: row.userId,
              displayName: names.get(row.userId) ?? 'Member',
              partySize: partySize.get(row.userId) ?? 3,
            })),
            courts: buildCourts({
              maxCourts: this.config.maxCourts,
              courtsTargeted: occ.courtsTargeted,
              reservations: occReservations.map((row) => ({
                id: row.id,
                courtIndex: row.courtIndex,
                status: row.status as 'held' | 'cancelled' | 'played',
                occupants: seatRows
                  .filter((seat) => seat.reservationId === row.id)
                  .map((seat) => ({
                    id: seat.id,
                    position: (seat.position as Spot) ?? 'front_left',
                    userId: seat.userId,
                    guestName: seat.guestName,
                    displayName: seat.userId ? (names.get(seat.userId) ?? 'Member') : (seat.guestName?.trim() ?? ''),
                  })),
              })),
            }),
          }),
        };
      }),
    };
  }

  async setAvailability(userId: string, occurrenceId: string, optedIn: boolean, now: Date): Promise<string | null> {
    const user = await this.requireUser(userId);
    if (!user.active) return 'inactive';
    const occ = await this.occurrence(occurrenceId);
    if (!occ) return 'missing';
    if (now.getTime() >= occ.startsAt.getTime()) return 'started';
    await this.db.insert(availability).values({
      occurrenceId,
      userId,
      createdAt: now,
      declined: !optedIn,
    }).onConflictDoUpdate({
      target: [availability.occurrenceId, availability.userId],
      set: { declined: !optedIn },
    });
    if (optedIn) {
      await this.seatOptIn(user, occurrenceId, now);
      return null;
    }
    const cleared = await this.clearOptInSeat(user, occurrenceId, now);
    if (cleared) {
      await this.db.update(availability).set({ declined: false }).where(and(
        eq(availability.occurrenceId, occurrenceId),
        eq(availability.userId, userId),
      ));
      return cleared;
    }
    return null;
  }

  async setSeat(userId: string, reservationId: string, join: boolean, position: Spot | null, now: Date): Promise<string | null> {
    const user = await this.requireUser(userId);
    const reservation = await this.db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
    const current = reservation[0];
    if (!current) return 'missing';
    if (join && !position) return 'invalid_body';
    const occ = await this.occurrence(current.occurrenceId);
    if (!occ) return 'missing';
    const group = await this.db.select().from(reservations).where(eq(reservations.occurrenceId, occ.id));
    const seatRows = await this.db.select().from(seats);
    const changed = placeMember({
      reservations: group.map((row) => this.shapeReservation(row, seatRows)),
      actorId: userId,
      actorActive: user.active,
      targetId: reservationId,
      position: position ?? 'front_left',
      join,
      now,
      startsAt: occ.startsAt,
      seatId: randomUUID(),
    });
    if (!changed.ok) return changed.error;
    await this.db.transaction(async (tx) => {
      await this.persistShapes(tx, changed.reservations, now);
    });
    return null;
  }

  private async seatOptIn(user: { id: string; active: boolean }, occurrenceId: string, now: Date): Promise<void> {
    const occ = await this.occurrence(occurrenceId);
    if (!occ) return;
    const group = await this.db.select().from(reservations).where(eq(reservations.occurrenceId, occurrenceId));
    const seatRows = await this.db.select().from(seats);
    const shaped = group.map((row) => this.shapeReservation(row, seatRows));
    if (shaped.some((reservation) => reservation.occupants.some((occupant) => occupant.userId === user.id))) return;
    const spots: Spot[] = ['front_left', 'front_right', 'back'];
    const held = group.filter((row) => row.status === 'held').sort((left, right) => left.courtIndex - right.courtIndex);
    for (const reservation of held) {
      const current = shaped.find((item) => item.id === reservation.id);
      const position = spots.find((spot) => !current?.occupants.some((occupant) => occupant.position === spot));
      if (!position) continue;
      const changed = placeMember({
        reservations: shaped,
        actorId: user.id,
        actorActive: user.active,
        targetId: reservation.id,
        position,
        join: true,
        now,
        startsAt: occ.startsAt,
        seatId: randomUUID(),
      });
      if (!changed.ok) return;
      await this.db.transaction(async (tx) => {
        await this.persistShapes(tx, changed.reservations, now);
      });
      return;
    }
  }

  private async clearOptInSeat(user: { id: string; active: boolean }, occurrenceId: string, now: Date): Promise<string | null> {
    const occ = await this.occurrence(occurrenceId);
    if (!occ) return null;
    const group = await this.db.select().from(reservations).where(eq(reservations.occurrenceId, occurrenceId));
    const seatRows = await this.db.select().from(seats);
    const shaped = group.map((row) => this.shapeReservation(row, seatRows));
    const current = shaped.find((reservation) => reservation.occupants.some((occupant) => occupant.userId === user.id));
    if (!current) return null;
    const changed = placeMember({
      reservations: shaped,
      actorId: user.id,
      actorActive: user.active,
      targetId: current.id,
      position: 'front_left',
      join: false,
      now,
      startsAt: occ.startsAt,
      seatId: randomUUID(),
    });
    if (!changed.ok) return changed.error;
    await this.db.transaction(async (tx) => {
      await this.persistShapes(tx, changed.reservations, now);
    });
    return null;
  }

  async addCourtGuest(userId: string, reservationId: string, name: string, position: Spot, now: Date): Promise<string | null> {
    const reservation = await this.db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
    const current = reservation[0];
    if (!current) return 'missing';
    const group = await this.db.select().from(reservations).where(eq(reservations.occurrenceId, current.occurrenceId));
    const seatRows = await this.db.select().from(seats);
    const trimmed = name.trim().toLowerCase();
    const duplicate = seatRows.some((seat) =>
      seat.guestName &&
      seat.guestName.toLowerCase() === trimmed &&
      group.some((row) => row.id === seat.reservationId),
    );
    if (duplicate) return 'guest_taken';
    const added = addGuest({
      reservation: this.shapeReservation(current, seatRows),
      actorId: userId,
      name,
      position,
      seatId: randomUUID(),
    });
    if (!added.ok) return added.error;
    await this.db.transaction(async (tx) => {
      await this.persistShapes(tx, [added.reservation], now);
    });
    return null;
  }

  async removeCourtGuest(userId: string, reservationId: string, seatId: string, now: Date): Promise<string | null> {
    const reservation = await this.db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
    const current = reservation[0];
    if (!current) return 'missing';
    const seatRows = await this.db.select().from(seats);
    const removed = removeGuest({
      reservation: this.shapeReservation(current, seatRows),
      actorId: userId,
      seatId,
    });
    if (!removed.ok) return removed.error;
    await this.db.transaction(async (tx) => {
      await this.persistShapes(tx, [removed.reservation], now);
    });
    return null;
  }

  async savePreferences(input: {
    userId: string;
    weekdays: number[];
    preferredTime: string;
    partySize: 2 | 3;
    now: Date;
  }): Promise<void> {
    const weekdays = [...new Set(input.weekdays)].sort((left, right) => left - right).join(',');
    await this.db.insert(playerPreferences).values({
      userId: input.userId,
      weekdays,
      preferredTime: input.preferredTime,
      partySize: input.partySize,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: playerPreferences.userId,
      set: {
        weekdays,
        preferredTime: input.preferredTime,
        partySize: input.partySize,
        updatedAt: input.now,
      },
    });
    await this.syncPreferences(input.now);
  }

  async listSlotRules() {
    const rows = await this.db.select().from(slotRules);
    return rows
      .map((row) => ({
        id: row.id,
        weekday: row.weekday,
        startTime: row.startTime,
        durationMinutes: row.durationMinutes,
        clubCode: row.clubCode,
        active: row.active,
      }))
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  }

  async createSlotRule(input: {
    weekday: number;
    startTime: string;
    durationMinutes: number;
    clubCode: string;
    now: Date;
  }): Promise<string> {
    const id = randomUUID();
    await this.db.insert(slotRules).values({
      id,
      weekday: input.weekday,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      clubCode: input.clubCode,
      active: true,
      createdAt: input.now,
    });
    return id;
  }

  async setSlotRuleActive(id: string, active: boolean): Promise<boolean> {
    const updated = await this.db.update(slotRules).set({ active }).where(eq(slotRules.id, id)).returning({ id: slotRules.id });
    return updated.length > 0;
  }

  async ensureOccurrences(now: Date): Promise<void> {
    const rules = await this.db.select().from(slotRules);
    const rows = occurrenceStarts({
      now,
      zone: this.config.zone,
      horizonDays: this.config.horizonDays,
      historyDays: this.config.historyDays,
      rules: rules.map((rule) => ({
        id: rule.id,
        weekday: rule.weekday,
        startTime: rule.startTime,
        durationMinutes: rule.durationMinutes,
        clubCode: rule.clubCode,
        active: rule.active,
      })),
    });
    for (const row of rows) {
      await this.db.insert(occurrences).values({ id: randomUUID(), ...row }).onConflictDoNothing();
    }
    await this.syncPreferences(now);
  }

  async markPlayed(now: Date): Promise<void> {
    const occs = await this.db.select({ id: occurrences.id, startsAt: occurrences.startsAt }).from(occurrences);
    const past = occs.filter((occ) => occ.startsAt.getTime() <= now.getTime()).map((occ) => occ.id);
    if (past.length === 0) return;
    const held = await this.db.select().from(reservations).where(eq(reservations.status, 'held'));
    for (const reservation of held) {
      if (!past.includes(reservation.occurrenceId)) continue;
      await this.db.update(reservations).set({ status: 'played' }).where(eq(reservations.id, reservation.id));
    }
  }

  async listUpcoming(now: Date): Promise<UpcomingOccurrence[]> {
    const rows = await this.db.select().from(occurrences).where(gt(occurrences.startsAt, now));
    return rows.map(toUpcoming);
  }

  async optedInPlayers(occurrenceId: string): Promise<{ userId: string; partySize: 2 | 3 }[]> {
    const rows = await this.db
      .select({ userId: availability.userId, partySize: playerPreferences.partySize })
      .from(availability)
      .innerJoin(users, eq(users.id, availability.userId))
      .leftJoin(playerPreferences, eq(playerPreferences.userId, availability.userId))
      .where(and(eq(availability.occurrenceId, occurrenceId), eq(availability.declined, false), eq(users.active, true)));
    return rows.map((row) => ({ userId: row.userId, partySize: row.partySize === 2 ? 2 : 3 }));
  }

  async candidates(startsAt: Date, now: Date): Promise<AccountCandidate[]> {
    const day = madridDate(startsAt, this.config.zone);
    const credUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(gymCredentials, eq(gymCredentials.userId, users.id))
      .where(eq(users.active, true));
    const rows = await this.balanceRows();
    return credUsers.map((user) => {
      let bookedMinutes = 0;
      let playedMinutes = 0;
      let bookingsOnDay = 0;
      let simultaneousHeld = 0;
      for (const row of rows) {
        if (row.status === 'cancelled') continue;
        if (row.chargedUserId === user.id) {
          bookedMinutes += row.durationMinutes;
          if (madridDate(row.startsAt, this.config.zone) === day) bookingsOnDay += 1;
          if (row.status === 'held' && row.startsAt.getTime() > now.getTime()) simultaneousHeld += 1;
        }
        if (row.memberIds.includes(user.id)) playedMinutes += row.durationMinutes;
      }
      return { userId: user.id, bookedMinutes, playedMinutes, bookingsOnDay, simultaneousHeld };
    });
  }

  async credentials(userId: string): Promise<{ username: string; password: string } | null> {
    const rows = await this.db.select().from(gymCredentials).where(eq(gymCredentials.userId, userId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      username: decryptSecret(row.usernameCiphertext, row.usernameNonce, this.config.credentialsKey, userId),
      password: decryptSecret(row.passwordCiphertext, row.passwordNonce, this.config.credentialsKey, userId),
    };
  }

  async freezeCourts(occurrenceId: string, courtsTargeted: number, now: Date): Promise<number> {
    const updated = await this.db
      .update(occurrences)
      .set({ courtsTargeted, grabbedAt: now })
      .where(and(eq(occurrences.id, occurrenceId), isNull(occurrences.courtsTargeted)))
      .returning({ courtsTargeted: occurrences.courtsTargeted });
    if (updated[0]?.courtsTargeted !== null && updated[0]?.courtsTargeted !== undefined) return updated[0].courtsTargeted;
    const current = await this.occurrence(occurrenceId);
    return current?.courtsTargeted ?? courtsTargeted;
  }

  async reservationCourtIndexes(occurrenceId: string): Promise<Set<number>> {
    const rows = await this.db.select({ courtIndex: reservations.courtIndex }).from(reservations).where(eq(reservations.occurrenceId, occurrenceId));
    return new Set(rows.map((row) => row.courtIndex));
  }

  async claimAttempt(key: string, kind: 'grab' | 'cancel', now: Date): Promise<'claimed' | 'done' | 'busy'> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(bookingAttempts).where(eq(bookingAttempts.idempotencyKey, key)).for('update');
      const row = rows[0];
      if (!row) {
        await tx.insert(bookingAttempts).values({
          idempotencyKey: key,
          kind,
          status: 'pending',
          detail: '',
          updatedAt: now,
        });
        return 'claimed';
      }
      if (row.status === 'succeeded') return 'done';
      if (now.getTime() - row.updatedAt.getTime() < this.config.attemptBackoffMs) return 'busy';
      await tx.update(bookingAttempts).set({ status: 'pending', detail: '', updatedAt: now }).where(eq(bookingAttempts.idempotencyKey, key));
      return 'claimed';
    });
  }

  async finishAttempt(key: string, status: 'succeeded' | 'failed', detail: string, now: Date): Promise<void> {
    await this.db.update(bookingAttempts).set({ status, detail, updatedAt: now }).where(eq(bookingAttempts.idempotencyKey, key));
  }

  async createReservation(input: {
    occurrenceId: string;
    courtIndex: number;
    chargedUserId: string;
    externalRef: string;
    now: Date;
  }): Promise<void> {
    await this.db.insert(reservations).values({
      id: randomUUID(),
      occurrenceId: input.occurrenceId,
      courtIndex: input.courtIndex,
      chargedUserId: input.chargedUserId,
      externalRef: input.externalRef,
      status: 'held',
      bookedAt: input.now,
    });
  }

  async heldOpen(now: Date): Promise<{
    id: string;
    chargedUserId: string;
    externalRef: string;
    startsAt: Date;
    frontLeft: boolean;
    frontRight: boolean;
    effective: boolean;
  }[]> {
    const held = await this.db
      .select({
        id: reservations.id,
        chargedUserId: reservations.chargedUserId,
        externalRef: reservations.externalRef,
        startsAt: occurrences.startsAt,
        effective: reservations.effective,
      })
      .from(reservations)
      .innerJoin(occurrences, eq(occurrences.id, reservations.occurrenceId))
      .where(and(eq(reservations.status, 'held'), gt(occurrences.startsAt, now)));
    const seatRows = await this.db.select().from(seats);
    return held.map((row) => {
      const positions = new Set(seatRows.filter((seat) => seat.reservationId === row.id).map((seat) => seat.position));
      return {
        id: row.id,
        chargedUserId: row.chargedUserId,
        externalRef: row.externalRef,
        startsAt: row.startsAt,
        frontLeft: positions.has('front_left'),
        frontRight: positions.has('front_right'),
        effective: row.effective,
      };
    });
  }

  async markEffective(id: string): Promise<void> {
    await this.db.update(reservations).set({ effective: true }).where(eq(reservations.id, id));
  }

  async markCancelled(id: string, now: Date): Promise<void> {
    await this.db.update(reservations).set({ status: 'cancelled', cancelledAt: now }).where(and(eq(reservations.id, id), ne(reservations.status, 'played')));
  }

  private async occurrence(id: string) {
    const rows = await this.db.select().from(occurrences).where(eq(occurrences.id, id)).limit(1);
    return rows[0] ?? null;
  }

  private async requireUser(id: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    const row = rows[0];
    if (!row) throw new Error('missing_user');
    return row;
  }

  private async balanceRows() {
    const reservationRows = await this.db
      .select({
        id: reservations.id,
        chargedUserId: reservations.chargedUserId,
        hostUserId: reservations.hostUserId,
        status: reservations.status,
        courtIndex: reservations.courtIndex,
        startsAt: occurrences.startsAt,
        durationMinutes: occurrences.durationMinutes,
        clubCode: occurrences.clubCode,
      })
      .from(reservations)
      .innerJoin(occurrences, eq(occurrences.id, reservations.occurrenceId));
    const seatRows = await this.db.select().from(seats);
    return reservationRows.map((row) => {
      const onCourt = seatRows.filter((seat) => seat.reservationId === row.id);
      return {
        ...row,
        memberIds: onCourt.flatMap((seat) => (seat.userId ? [seat.userId] : [])),
        guestCount: onCourt.filter((seat) => !seat.userId).length,
      };
    });
  }

  private async readPreferences(userId: string): Promise<{ weekdays: number[]; preferredTime: string; partySize: 2 | 3 } | null> {
    const rows = await this.db.select().from(playerPreferences).where(eq(playerPreferences.userId, userId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      weekdays: row.weekdays.split(',').filter(Boolean).map(Number),
      preferredTime: row.preferredTime,
      partySize: row.partySize === 2 ? 2 : 3,
    };
  }

  private async syncPreferences(now: Date): Promise<void> {
    const prefs = await this.db.select().from(playerPreferences);
    const occs = await this.db.select().from(occurrences).where(gt(occurrences.startsAt, now));
    for (const pref of prefs) {
      const days = new Set(pref.weekdays.split(',').filter(Boolean));
      for (const occ of occs) {
        const local = DateTime.fromJSDate(occ.startsAt, { zone: this.config.zone });
        if (!days.has(String(local.weekday)) || local.toFormat('HH:mm') !== pref.preferredTime) continue;
        await this.db.insert(availability).values({
          occurrenceId: occ.id,
          userId: pref.userId,
          createdAt: now,
          declined: false,
        }).onConflictDoNothing();
      }
    }
  }

  private shapeReservation(
    row: { id: string; status: string; hostUserId: string | null },
    seatRows: { id: string; reservationId: string; userId: string | null; guestName: string | null; position: string | null }[],
  ): ShapedReservation {
    return {
      id: row.id,
      status: row.status as ShapedReservation['status'],
      hostUserId: row.hostUserId,
      occupants: seatRows
        .filter((seat) => seat.reservationId === row.id)
        .map((seat) => ({
          id: seat.id,
          position: (seat.position as Spot) || 'front_left',
          userId: seat.userId,
          guestName: seat.guestName,
        })),
    };
  }

  private async persistShapes(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    items: ShapedReservation[],
    now: Date,
  ): Promise<void> {
    for (const item of items) {
      await tx.delete(seats).where(eq(seats.reservationId, item.id));
      if (item.occupants.length > 0) {
        await tx.insert(seats).values(item.occupants.map((occupant) => ({
          id: occupant.id,
          reservationId: item.id,
          userId: occupant.userId,
          guestName: occupant.guestName,
          position: occupant.position,
          createdAt: now,
        })));
      }
      await tx.update(reservations).set({ hostUserId: item.hostUserId }).where(eq(reservations.id, item.id));
    }
  }
}

function toUser(row: { id: string; email: string; displayName: string; role: string; active: boolean }): SessionUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role === 'admin' ? 'admin' : 'member',
    active: row.active,
  };
}

function toUpcoming(row: {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  clubCode: string;
  courtsTargeted: number | null;
}): UpcomingOccurrence {
  return {
    id: row.id,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    clubCode: row.clubCode,
    courtsTargeted: row.courtsTargeted,
  };
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
}
