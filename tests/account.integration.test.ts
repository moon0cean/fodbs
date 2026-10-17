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

  const joined = await app.inject({
    method: 'POST',
    url: `/api/occurrences/${occurrenceId}/availability`,
    cookies,
    payload: { in: true },
  });
  expect(joined.statusCode).toBe(204);
});
