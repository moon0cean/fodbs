import type { GymBookRequest, GymGateway, GymSession } from './gym/gateway.js';

export type Opening = { courtIndex: number; startsAt: string; offsetMinutes: number };

export async function searchOpenings(input: {
  gateway: GymGateway;
  session: GymSession;
  now: Date;
  maxCourts: number;
  startsAt: Date;
  durationMinutes: number;
  clubCode: string;
}): Promise<{ exact: Opening[] }> {
  const exact: Opening[] = [];
  if (input.startsAt.getTime() <= input.now.getTime()) return { exact };
  for (let courtIndex = 0; courtIndex < input.maxCourts; courtIndex += 1) {
    const request: GymBookRequest = {
      clubCode: input.clubCode,
      courtIndex,
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
    };
    if (await input.gateway.inspect(input.session, request) !== 'free') continue;
    exact.push({ courtIndex, startsAt: input.startsAt.toISOString(), offsetMinutes: 0 });
  }
  return { exact };
}
