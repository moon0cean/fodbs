import { DateTime } from 'luxon';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { adminEmail, adminPassword, databaseUrl, resetDatabase, sessionCookie, testConfig } from './support.js';

const url = databaseUrl();
const target = DateTime.now().setZone('Europe/Madrid').plus({ days: 2 }).set({ hour: 20, minute: 0, second: 0, millisecond: 0 });

let app: Awaited<ReturnType<typeof buildApp>>['app'];
let db: Awaited<ReturnType<typeof buildApp>>['db'];

beforeAll(async () => {
  await resetDatabase(url);
  const built = await buildApp(testConfig(url), { logger: false });
  app = built.app;
  db = built.db;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

test('a member can pause and restore their own account', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: adminEmail, password: adminPassword },
  });
  expect(login.statusCode).toBe(200);
  const cookies = sessionCookie(login.headers);

  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/slot-rules',
    cookies,
    payload: { weekday: target.weekday, startTime: '20:00', durationMinutes: 60, clubCode: 'ROC' },
  });
  expect(created.statusCode).toBe(201);

  const date = target.toISODate();
  const board = await app.inject({ method: 'GET', url: `/api/dashboard?date=${date}`, cookies });
  expect(board.statusCode).toBe(200);
  const dashboard = board.json() as { occurrences: { id: string }[] };
  expect(dashboard.occurrences.length).toBeGreaterThan(0);
  const occurrenceId = dashboard.occurrences[0]?.id;
  expect(occurrenceId).toBeTruthy();

  const paused = await app.inject({
    method: 'PATCH',
    url: '/api/account/active',
    cookies,
    payload: { active: false },
  });
  expect(paused.statusCode).toBe(200);
  expect(paused.json()).toMatchObject({ active: false, email: adminEmail });

  const account = await app.inject({ method: 'GET', url: '/api/account', cookies });
  expect(account.statusCode).toBe(200);
  expect(account.json()).toMatchObject({ active: false });

  const blocked = await app.inject({
    method: 'POST',
    url: `/api/occurrences/${occurrenceId}/availability`,
    cookies,
    payload: { in: true },
  });
  expect(blocked.statusCode).toBe(400);
  expect(blocked.json()).toMatchObject({ error: 'inactive' });

  const again = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: adminEmail, password: adminPassword },
  });
  expect(again.statusCode).toBe(200);

  const restored = await app.inject({
    method: 'PATCH',
    url: '/api/account/active',
    cookies,
    payload: { active: true },
  });
  expect(restored.statusCode).toBe(200);
  expect(restored.json()).toMatchObject({ active: true });

  const linked = await app.inject({
    method: 'PUT',
    url: '/api/account/credentials',
    cookies,
    payload: { username: 'member', password: 'club-password' },
  });
  expect(linked.statusCode).toBe(204);

  const joined = await app.inject({
    method: 'POST',
    url: `/api/occurrences/${occurrenceId}/availability`,
    cookies,
    payload: { in: true },
  });
  expect(joined.statusCode).toBe(204);
});

test('auto-cancel stays off until the member turns it on', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: adminEmail, password: adminPassword },
  });
  const cookies = sessionCookie(login.headers);
  const before = await app.inject({ method: 'GET', url: '/api/account', cookies });
  expect(before.json()).toMatchObject({ autoCancel: false });
  const saved = await app.inject({
    method: 'PUT',
    url: '/api/account/auto-cancel',
    cookies,
    payload: { enabled: true },
  });
  expect(saved.statusCode).toBe(204);
  const after = await app.inject({ method: 'GET', url: '/api/account', cookies });
  expect(after.json()).toMatchObject({ autoCancel: true });
  const missing = await app.inject({
    method: 'PUT',
    url: '/api/account/auto-cancel',
    cookies,
    payload: {},
  });
  expect(missing.statusCode).toBe(400);
  expect(missing.json()).toMatchObject({ error: 'invalid_body' });
  await app.inject({
    method: 'PUT',
    url: '/api/account/auto-cancel',
    cookies,
    payload: { enabled: false },
  });
});

test('an empty spot seats a member, a guest, or the signed-in player', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: adminEmail, password: adminPassword },
  });
  const admin = login.json() as { id: string };
  const cookies = sessionCookie(login.headers);
  await app.inject({
    method: 'PUT',
    url: '/api/account/credentials',
    cookies,
    payload: { username: 'member', password: 'club-password' },
  });

  async function accept(email: string, displayName: string) {
    const invite = await app.inject({
      method: 'POST',
      url: '/api/admin/invites',
      cookies,
      payload: { email, role: 'member' },
    });
    expect(invite.statusCode).toBe(201);
    const token = (invite.json() as { token: string }).token;
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      payload: { token, email, password: 'player-pass-1', displayName },
    });
    expect(accepted.statusCode).toBe(201);
    return { user: accepted.json() as { id: string }, cookies: sessionCookie(accepted.headers) };
  }

  const rafa = await accept('rafa@example.com', 'Rafa');
  await app.inject({
    method: 'PUT',
    url: '/api/account/credentials',
    cookies: rafa.cookies,
    payload: { username: 'rafa', password: 'club-password' },
  });
  const bea = await accept('bea@example.com', 'Bea');
  const startsAt = target.plus({ days: 1 }).toJSDate();
  const later = target.plus({ days: 1, hours: 1 }).toJSDate();
  expect(await db.bookManual({
    userId: admin.id,
    courtIndex: 0,
    startsAt,
    durationMinutes: 60,
    externalRef: 'party-0',
    now: new Date(),
  })).toBeNull();
  expect(await db.bookManual({
    userId: admin.id,
    courtIndex: 1,
    startsAt: later,
    durationMinutes: 60,
    externalRef: 'party-1',
    now: new Date(),
  })).toBeNull();
  const account = await app.inject({ method: 'GET', url: '/api/account', cookies });
  const reservations = (account.json() as { reservations: { id: string; courtIndex: number; startsAt: string }[] }).reservations;
  const first = reservations.find((reservation) => reservation.startsAt === startsAt.toISOString())?.id;
  const second = reservations.find((reservation) => reservation.startsAt === later.toISOString())?.id;
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();

  const guest = await app.inject({
    method: 'POST',
    url: `/api/reservations/${first}/occupants`,
    cookies,
    payload: { position: 'front_right', kind: 'guest', name: '' },
  });
  expect(guest.statusCode).toBe(204);
  const taken = await app.inject({
    method: 'POST',
    url: `/api/reservations/${first}/occupants`,
    cookies,
    payload: { position: 'front_right', kind: 'guest', name: 'Luis' },
  });
  expect(taken.statusCode).toBe(400);
  expect(taken.json()).toMatchObject({ error: 'spot_taken' });
  const already = await app.inject({
    method: 'POST',
    url: `/api/reservations/${first}/occupants`,
    cookies,
    payload: { position: 'back', kind: 'self' },
  });
  expect(already.statusCode).toBe(400);
  expect(already.json()).toMatchObject({ error: 'already_seated' });
  const sat = await app.inject({
    method: 'POST',
    url: `/api/reservations/${first}/occupants`,
    cookies: rafa.cookies,
    payload: { position: 'back', kind: 'self' },
  });
  expect(sat.statusCode).toBe(204);

  const requested = await app.inject({
    method: 'POST',
    url: `/api/reservations/${second}/occupants`,
    cookies,
    payload: { position: 'front_right', kind: 'member', userId: bea.user.id },
  });
  expect(requested.statusCode).toBe(202);
  expect(requested.json()).toMatchObject({ requested: true });
  const paused = await app.inject({
    method: 'PATCH',
    url: `/api/admin/users/${bea.user.id}`,
    cookies,
    payload: { active: false },
  });
  expect(paused.statusCode).toBe(204);
  const inactive = await app.inject({
    method: 'POST',
    url: `/api/reservations/${second}/occupants`,
    cookies,
    payload: { position: 'back', kind: 'member', userId: bea.user.id },
  });
  expect(inactive.statusCode).toBe(400);
  expect(inactive.json()).toMatchObject({ error: 'inactive' });
  await db.markCancelled(second ?? '', new Date());
  const dropped = await app.inject({
    method: 'POST',
    url: `/api/reservations/${second}/occupants`,
    cookies,
    payload: { position: 'back', kind: 'guest', name: 'Luis' },
  });
  expect(dropped.statusCode).toBe(400);
  expect(dropped.json()).toMatchObject({ error: 'not_held' });
  const missing = await app.inject({
    method: 'POST',
    url: '/api/reservations/missing-reservation/occupants',
    cookies,
    payload: { position: 'back', kind: 'guest', name: 'Luis' },
  });
  expect(missing.statusCode).toBe(404);
  expect(missing.json()).toMatchObject({ error: 'missing' });
});

test('the holder can hand the court to another member instead of cancelling', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: adminEmail, password: adminPassword },
  });
  const admin = login.json() as { id: string };
  const cookies = sessionCookie(login.headers);
  await app.inject({
    method: 'PUT',
    url: '/api/account/credentials',
    cookies,
    payload: { username: 'member', password: 'club-password' },
  });
  const invite = await app.inject({
    method: 'POST',
    url: '/api/admin/invites',
    cookies,
    payload: { email: 'mate@example.com', role: 'member' },
  });
  const token = (invite.json() as { token: string }).token;
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/auth/accept-invite',
    payload: { token, email: 'mate@example.com', password: 'player-pass-1', displayName: 'Mate' },
  });
  const mate = accepted.json() as { id: string };
  const mateCookies = sessionCookie(accepted.headers);
  await app.inject({
    method: 'PUT',
    url: '/api/account/credentials',
    cookies: mateCookies,
    payload: { username: 'mate', password: 'club-password' },
  });
  const startsAt = target.plus({ days: 2 }).toJSDate();
  expect(await db.bookManual({
    userId: admin.id,
    courtIndex: 2,
    startsAt,
    durationMinutes: 60,
    externalRef: 'transfer-1',
    now: new Date(),
  })).toBeNull();
  const account = await app.inject({ method: 'GET', url: '/api/account', cookies });
  const reservationId = (account.json() as { reservations: { id: string; startsAt: string }[] }).reservations
    .find((reservation) => reservation.startsAt === startsAt.toISOString())?.id;
  const seated = await app.inject({
    method: 'POST',
    url: `/api/reservations/${reservationId}/occupants`,
    cookies,
    payload: { position: 'front_right', kind: 'member', userId: mate.id },
  });
  expect(seated.statusCode).toBe(204);
  const handed = await app.inject({
    method: 'POST',
    url: `/api/reservations/${reservationId}/transfer`,
    cookies,
    payload: { userId: mate.id },
  });
  expect(handed.statusCode).toBe(204);
  const after = await app.inject({ method: 'GET', url: '/api/account', cookies });
  expect((after.json() as { reservations: { id: string }[] }).reservations.some((reservation) => reservation.id === reservationId)).toBe(false);
  const mateAccount = await app.inject({ method: 'GET', url: '/api/account', cookies: mateCookies });
  const moved = (mateAccount.json() as { reservations: { id: string; players: string[] }[] }).reservations
    .find((reservation) => reservation.id === reservationId);
  expect(moved?.players).toEqual(['Mate']);
  const refused = await app.inject({
    method: 'POST',
    url: `/api/reservations/${reservationId}/transfer`,
    cookies,
    payload: { userId: mate.id },
  });
  expect(refused.statusCode).toBe(400);
  expect(refused.json()).toMatchObject({ error: 'not_owner' });
});
