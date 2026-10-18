import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { FakeGymGateway } from '../src/gym/fake.js';
import { MemoryMailer } from '../src/mail.js';
import { syncAccountBookings } from '../src/sync.js';
import { adminEmail, adminPassword, databaseUrl, resetDatabase, sessionCookie, testConfig } from './support.js';

const url = databaseUrl();
const mailer = new MemoryMailer();

let app: Awaited<ReturnType<typeof buildApp>>['app'];
let db: Awaited<ReturnType<typeof buildApp>>['db'];

beforeAll(async () => {
  await resetDatabase(url);
  const built = await buildApp(testConfig(url), { logger: false, mailer });
  app = built.app;
  db = built.db;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

test('an access request is approved into one invite email', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: adminEmail, password: adminPassword },
  });
  expect(login.statusCode).toBe(200);
  const cookies = sessionCookie(login.headers);
  const admin = login.json() as { id: string };

  const asked = await app.inject({
    method: 'POST',
    url: '/api/access-requests',
    payload: { email: 'ana@example.com' },
  });
  expect(asked.statusCode).toBe(204);
  const repeat = await app.inject({
    method: 'POST',
    url: '/api/access-requests',
    payload: { email: 'ana@example.com' },
  });
  expect(repeat.statusCode).toBe(204);

  const quiet = await app.inject({
    method: 'POST',
    url: '/api/access-requests',
    payload: { email: adminEmail },
  });
  expect(quiet.statusCode).toBe(204);

  const listed = await app.inject({ method: 'GET', url: '/api/admin/access-requests', cookies });
  const requests = listed.json() as { requests: { id: string; email: string; status: string }[] };
  const ana = requests.requests.filter((item) => item.email === 'ana@example.com');
  expect(ana).toHaveLength(1);
  expect(requests.requests.some((item) => item.email === adminEmail)).toBe(false);

  const approved = await app.inject({
    method: 'POST',
    url: `/api/admin/access-requests/${ana[0]?.id}/approve`,
    cookies,
  });
  expect(approved.statusCode).toBe(201);
  expect(approved.json()).toMatchObject({ email: 'ana@example.com', mailed: true });
  expect(mailer.sent).toHaveLength(1);
  expect(mailer.sent[0]?.to).toBe('ana@example.com');
  expect(mailer.sent[0]?.text).toContain('/invite/');

  const gateway = new FakeGymGateway();
  const startsAt = new Date('2026-10-20T18:00:00.000Z');
  gateway.listed = [{ externalRef: 'dir-1', startsAt, durationMinutes: 60, clubCode: 'ROC', courtIndex: 0 }];
  expect((await syncAccountBookings(db, gateway, { userId: admin.id, username: 'dir-user', password: 'dir-pass' })).imported).toBe(1);
  expect((await syncAccountBookings(db, gateway, { userId: admin.id, username: 'dir-user', password: 'dir-pass' })).imported).toBe(0);

  const removed = await app.inject({ method: 'DELETE', url: `/api/admin/users/${admin.id}`, cookies });
  expect(removed.statusCode).toBe(400);
});
