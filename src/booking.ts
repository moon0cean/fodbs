import { DateTime } from 'luxon';
import { slotsToTry } from './domain.js';
import type { GymBookRequest, GymGateway, GymSession } from './gym/gateway.js';

export type Opening = { courtIndex: number; startsAt: string; offsetMinutes: number };

export async function searchOpenings(input: {
  gateway: GymGateway;
  session: GymSession;
  zone: string;
  now: Date;
  maxCourts: number;
  tryOffset: boolean;
  startsAt: Date;
  durationMinutes: number;
  clubCode: string;
}): Promise<{ exact: Opening[]; alternatives: Opening[] }> {
  const day = DateTime.fromJSDate(input.startsAt, { zone: input.zone }).toISODate();
  const exact: Opening[] = [];
  const alternatives: Opening[] = [];
  for (const slot of slotsToTry(input.maxCourts, input.tryOffset)) {
    const startsAt = new Date(input.startsAt.getTime() + slot.offsetMinutes * 60_000);
    if (startsAt.getTime() <= input.now.getTime()) continue;
    if (DateTime.fromJSDate(startsAt, { zone: input.zone }).toISODate() !== day) continue;
    const request: GymBookRequest = {
      clubCode: input.clubCode,
      courtIndex: slot.courtIndex,
      startsAt,
      durationMinutes: input.durationMinutes,
    };
    if (await input.gateway.inspect(input.session, request) !== 'free') continue;
    const opening = { courtIndex: slot.courtIndex, startsAt: startsAt.toISOString(), offsetMinutes: slot.offsetMinutes };
    if (slot.offsetMinutes === 0) exact.push(opening);
    else alternatives.push(opening);
  }
  return { exact, alternatives };
}
