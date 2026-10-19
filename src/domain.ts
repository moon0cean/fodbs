import { DateTime } from 'luxon';

export type AccountCandidate = {
  userId: string;
  bookedMinutes: number;
  playedMinutes: number;
  bookingsOnDay: number;
  simultaneousHeld: number;
};

export type PickExtra = Map<string, { day: number; sim: number }>;

export const SPOTS = ['front_left', 'front_right', 'back'] as const;
export type Spot = (typeof SPOTS)[number];

export type Occupant = {
  id: string;
  position: Spot;
  userId: string | null;
  guestName: string | null;
};

export type ShapedReservation = {
  id: string;
  status: 'held' | 'cancelled' | 'played';
  hostUserId: string | null;
  occupants: Occupant[];
};

export type BalanceReservation = {
  chargedUserId: string;
  hostUserId: string | null;
  status: string;
  durationMinutes: number;
  startsAt: Date;
  effective: boolean;
  memberIds: string[];
  guestCount: number;
};

export type MinutesBalance = {
  bookedMinutes: number;
  weekBookedMinutes: number;
  nextWeekBookedMinutes: number;
  playedMinutes: number;
  differenceMinutes: number;
};

export type CourtSeat = {
  id: string;
  position: Spot;
  userId: string | null;
  guestName: string | null;
  displayName: string;
};

export type CourtView = {
  courtIndex: number;
  reservationId: string | null;
  status: 'open' | 'pending' | 'skipped' | 'held' | 'cancelled' | 'played';
  startsAt: string | null;
  occupants: CourtSeat[];
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function alternateSlots(maxCourts: number): { offsetMinutes: number; courtIndex: number }[] {
  const slots: { offsetMinutes: number; courtIndex: number }[] = [];
  for (const offsetMinutes of [0, -30, 30]) {
    for (let courtIndex = 0; courtIndex < maxCourts; courtIndex += 1) slots.push({ offsetMinutes, courtIndex });
  }
  return slots;
}

export function courtsToBook(optedIn: number, maxCourts: number, maxPerCourt: number): number {
  if (optedIn <= 0) return 0;
  return Math.min(maxCourts, Math.ceil(optedIn / maxPerCourt));
}

export function partyDivisor(partySizes: number[]): number {
  const twos = partySizes.filter((size) => size === 2).length;
  const threes = partySizes.filter((size) => size === 3).length;
  if (twos === 0 && threes === 0) return 3;
  return twos > threes ? 2 : 3;
}

export function courtPayer(reservation: BalanceReservation): string {
  if (reservation.guestCount > 0 && reservation.hostUserId) return reservation.hostUserId;
  return reservation.chargedUserId;
}

export function pickAccount(
  candidates: AccountCandidate[],
  limits: { perDay: number; simultaneous: number },
  extra: PickExtra = new Map(),
): AccountCandidate | null {
  const ranked = candidates
    .map((candidate) => {
      const added = extra.get(candidate.userId);
      return {
        candidate,
        bookingsOnDay: candidate.bookingsOnDay + (added?.day ?? 0),
        simultaneousHeld: candidate.simultaneousHeld + (added?.sim ?? 0),
        score: candidate.bookedMinutes - candidate.playedMinutes,
      };
    })
    .filter((row) => row.bookingsOnDay < limits.perDay && row.simultaneousHeld < limits.simultaneous)
    .sort((a, b) => a.score - b.score || a.candidate.userId.localeCompare(b.candidate.userId));
  return ranked[0]?.candidate ?? null;
}

export function frontDeadline(startsAt: Date, zone: string): Date {
  return DateTime.fromJSDate(startsAt, { zone }).startOf('day').minus({ days: 1 }).set({ hour: 23, minute: 55, second: 0, millisecond: 0 }).toJSDate();
}

export function shouldCancel(input: {
  frontLeft: boolean;
  frontRight: boolean;
  effective: boolean;
  now: Date;
  startsAt: Date;
  zone: string;
  penaltyGuardMinutes: number;
}): boolean {
  if (input.effective || (input.frontLeft && input.frontRight)) return false;
  if (input.now < frontDeadline(input.startsAt, input.zone)) return false;
  const shut = input.startsAt.getTime() - input.penaltyGuardMinutes * MINUTE;
  return input.now.getTime() < shut && input.now.getTime() < input.startsAt.getTime();
}

export function balanceMinutes(reservations: BalanceReservation[], now: Date, zone: string, userId?: string): MinutesBalance {
  const local = DateTime.fromJSDate(now, { zone });
  const weekStart = local.startOf('day').minus({ days: local.weekday - 1 });
  const weekEnd = weekStart.plus({ weeks: 1 });
  const nextWeekEnd = weekEnd.plus({ weeks: 1 });
  let bookedMinutes = 0;
  let weekBookedMinutes = 0;
  let nextWeekBookedMinutes = 0;
  let playedMinutes = 0;
  let settledBookedMinutes = 0;
  for (const reservation of reservations) {
    if (reservation.status === 'cancelled') continue;
    const payer = courtPayer(reservation);
    const chargedHere = !userId || payer === userId;
    const started = reservation.startsAt.getTime() <= now.getTime();
    const start = DateTime.fromJSDate(reservation.startsAt, { zone });
    if (chargedHere) {
      bookedMinutes += reservation.durationMinutes;
      if (started) settledBookedMinutes += reservation.durationMinutes;
      else if (start >= weekStart && start < weekEnd) weekBookedMinutes += reservation.durationMinutes;
      else if (start >= weekEnd && start < nextWeekEnd) nextWeekBookedMinutes += reservation.durationMinutes;
    }
    if (!started) continue;
    if (!userId) playedMinutes += reservation.durationMinutes * reservation.memberIds.length;
    else if (reservation.memberIds.includes(userId)) playedMinutes += reservation.durationMinutes;
  }
  return {
    bookedMinutes,
    weekBookedMinutes,
    nextWeekBookedMinutes,
    playedMinutes,
    differenceMinutes: playedMinutes - settledBookedMinutes,
  };
}

function cloneReservations(reservations: ShapedReservation[]): ShapedReservation[] {
  return reservations.map((reservation) => ({
    ...reservation,
    occupants: reservation.occupants.map((occupant) => ({ ...occupant })),
  }));
}

function membersOf(occupants: Occupant[]): Occupant[] {
  return occupants.filter((occupant) => occupant.userId);
}

export function placeMember(input: {
  reservations: ShapedReservation[];
  actorId: string;
  actorActive: boolean;
  targetId: string;
  position: Spot;
  join: boolean;
  now: Date;
  startsAt: Date;
  seatId: string;
}): { ok: true; reservations: ShapedReservation[] } | { ok: false; error: string } {
  if (!input.actorActive) return { ok: false, error: 'inactive' };
  if (input.now.getTime() >= input.startsAt.getTime()) return { ok: false, error: 'started' };
  const next = cloneReservations(input.reservations);
  const target = next.find((reservation) => reservation.id === input.targetId);
  if (!target) return { ok: false, error: 'missing' };
  if (target.status !== 'held') return { ok: false, error: 'not_held' };
  if (!input.join) {
    const guests = target.occupants.filter((occupant) => !occupant.userId);
    const staying = membersOf(target.occupants).filter((occupant) => occupant.userId !== input.actorId);
    if (guests.length > 0 && staying.length === 0 && membersOf(target.occupants).some((occupant) => occupant.userId === input.actorId)) {
      return { ok: false, error: 'last_member' };
    }
    target.occupants = target.occupants.filter((occupant) => occupant.userId !== input.actorId);
    if (target.hostUserId === input.actorId) target.hostUserId = staying[0]?.userId ?? null;
    return { ok: true, reservations: next };
  }
  const occupied = target.occupants.find((occupant) => occupant.position === input.position);
  if (occupied?.userId === input.actorId) return { ok: true, reservations: next };
  if (occupied) return { ok: false, error: 'taken' };
  let seatId = input.seatId;
  for (const reservation of next) {
    const mine = reservation.occupants.find((occupant) => occupant.userId === input.actorId);
    if (mine) seatId = mine.id;
    reservation.occupants = reservation.occupants.filter((occupant) => occupant.userId !== input.actorId);
    if (reservation.id !== target.id && reservation.hostUserId === input.actorId) {
      reservation.hostUserId = membersOf(reservation.occupants)[0]?.userId ?? null;
    }
  }
  target.occupants.push({ id: seatId, position: input.position, userId: input.actorId, guestName: null });
  return { ok: true, reservations: next };
}

export function addGuest(input: {
  reservation: ShapedReservation;
  actorId: string;
  name: string;
  position: Spot;
  seatId: string;
}): { ok: true; reservation: ShapedReservation } | { ok: false; error: string } {
  const name = input.name.trim();
  if (name.length > 40) return { ok: false, error: 'invalid_name' };
  if (input.reservation.status !== 'held') return { ok: false, error: 'not_held' };
  if (!input.reservation.occupants.some((occupant) => occupant.userId === input.actorId)) {
    return { ok: false, error: 'not_on_court' };
  }
  if (input.reservation.occupants.some((occupant) => occupant.position === input.position)) {
    return { ok: false, error: 'taken' };
  }
  const reservation = cloneReservations([input.reservation])[0];
  if (!reservation) return { ok: false, error: 'missing' };
  reservation.occupants.push({ id: input.seatId, position: input.position, userId: null, guestName: name || null });
  reservation.hostUserId = reservation.hostUserId ?? input.actorId;
  return { ok: true, reservation };
}

export function removeGuest(input: {
  reservation: ShapedReservation;
  actorId: string;
  seatId: string;
}): { ok: true; reservation: ShapedReservation } | { ok: false; error: string } {
  if (!input.reservation.occupants.some((occupant) => occupant.userId === input.actorId)) {
    return { ok: false, error: 'not_on_court' };
  }
  const guest = input.reservation.occupants.find((occupant) => occupant.id === input.seatId);
  if (!guest || guest.userId) return { ok: false, error: 'missing' };
  const reservation = cloneReservations([input.reservation])[0];
  if (!reservation) return { ok: false, error: 'missing' };
  reservation.occupants = reservation.occupants.filter((occupant) => occupant.id !== input.seatId);
  if (!reservation.occupants.some((occupant) => !occupant.userId)) reservation.hostUserId = null;
  return { ok: true, reservation };
}

export function buildCourts(input: {
  maxCourts: number;
  courtsTargeted: number | null;
  reservations: {
    id: string;
    courtIndex: number;
    status: 'held' | 'cancelled' | 'played';
    startsAt: Date;
    occupants: CourtSeat[];
  }[];
}): CourtView[] {
  const courts: CourtView[] = [];
  const booked = input.reservations.length;
  let pendingLeft = input.courtsTargeted === null ? 0 : Math.max(0, input.courtsTargeted - booked);
  for (let courtIndex = 0; courtIndex < input.maxCourts; courtIndex += 1) {
    const reservation = input.reservations.find((item) => item.courtIndex === courtIndex);
    if (reservation) {
      courts.push({
        courtIndex,
        reservationId: reservation.id,
        status: reservation.status,
        startsAt: reservation.startsAt.toISOString(),
        occupants: reservation.occupants,
      });
      continue;
    }
    let status: CourtView['status'] = 'open';
    if (input.courtsTargeted !== null) {
      status = pendingLeft > 0 ? 'pending' : 'skipped';
      if (status === 'pending') pendingLeft -= 1;
    }
    courts.push({ courtIndex, reservationId: null, status, startsAt: null, occupants: [] });
  }
  return courts;
}

export function assignOptedIn(input: {
  courts: CourtView[];
  players: { id: string; displayName: string; partySize: 2 | 3 }[];
  courtsTargeted: number | null;
}): CourtView[] {
  const divisor = partyDivisor(input.players.map((player) => player.partySize));
  const active = input.courtsTargeted ?? courtsToBook(input.players.length, input.courts.length, divisor);
  const spots: Spot[] = divisor === 2 ? ['front_left', 'front_right'] : ['front_left', 'front_right', 'back'];
  const seated = new Set(input.courts.flatMap((court) => court.occupants.flatMap((occupant) => (occupant.userId ? [occupant.userId] : []))));
  const waiting = input.players.filter((player) => !seated.has(player.id));
  return input.courts.map((court) => {
    const holdsBooking = Boolean(court.reservationId);
    if ((!holdsBooking && court.courtIndex >= active) || court.status === 'cancelled' || court.status === 'played' || court.status === 'skipped') return court;
    const occupants = [...court.occupants];
    for (const position of spots) {
      if (occupants.some((occupant) => occupant.position === position)) continue;
      const next = waiting.shift();
      if (!next) break;
      occupants.push({
        id: `optin:${next.id}`,
        position,
        userId: next.id,
        guestName: null,
        displayName: next.displayName,
      });
    }
    return { ...court, occupants };
  });
}

export type SlotRuleInput = {
  id: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  clubCode: string;
  active: boolean;
};

export function occurrenceStarts(input: {
  now: Date;
  zone: string;
  horizonDays: number;
  historyDays: number;
  rules: SlotRuleInput[];
}): { slotRuleId: string; startsAt: Date; durationMinutes: number; clubCode: string }[] {
  const start = DateTime.fromJSDate(input.now, { zone: input.zone }).startOf('day').minus({ days: input.historyDays });
  const end = DateTime.fromJSDate(input.now, { zone: input.zone }).startOf('day').plus({ days: input.horizonDays });
  const rows: { slotRuleId: string; startsAt: Date; durationMinutes: number; clubCode: string }[] = [];
  for (let day = start; day <= end; day = day.plus({ days: 1 })) {
    for (const rule of input.rules) {
      if (!rule.active || rule.weekday !== day.weekday) continue;
      const [hour, minute] = rule.startTime.split(':').map(Number);
      if (hour === undefined || minute === undefined) continue;
      const starts = day.set({ hour, minute, second: 0, millisecond: 0 });
      rows.push({
        slotRuleId: rule.id,
        startsAt: starts.toJSDate(),
        durationMinutes: rule.durationMinutes,
        clubCode: rule.clubCode,
      });
    }
  }
  return rows;
}

export function windowDates(now: Date, zone: string, historyDays: number, horizonDays: number): string[] {
  const start = DateTime.fromJSDate(now, { zone }).startOf('day').minus({ days: historyDays });
  const dates: string[] = [];
  for (let i = 0; i <= historyDays + horizonDays; i += 1) {
    const iso = start.plus({ days: i }).toISODate();
    if (iso) dates.push(iso);
  }
  return dates;
}

export function madridDate(value: Date, zone: string): string {
  return DateTime.fromJSDate(value, { zone }).toISODate() ?? '';
}

export function redactSecrets(message: string, secrets: string[]): string {
  let text = message;
  for (const secret of secrets) {
    if (secret.length < 1) continue;
    text = text.split(secret).join('[redacted]');
  }
  return text.slice(0, 300);
}

export function redactInviteUrl(url: string): string {
  return url.replace(/\/invite\/[^/?#]+/g, '/invite/[redacted]');
}

export function horizonOpenAt(startsAt: Date, horizonDays: number, zone: string): Date {
  return DateTime.fromJSDate(startsAt, { zone }).startOf('day').minus({ days: horizonDays }).toJSDate();
}

export function notePick(extra: PickExtra, userId: string): void {
  const current = extra.get(userId) ?? { day: 0, sim: 0 };
  current.day += 1;
  current.sim += 1;
  extra.set(userId, current);
}
