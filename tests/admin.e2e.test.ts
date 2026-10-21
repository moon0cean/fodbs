import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryMailer } from '../src/mail.js';
import { adminEmail, adminPassword, databaseUrl, resetDatabase, testConfig } from './support.js';

const url = databaseUrl();
const mailer = new MemoryMailer();

let browser: Browser;
let page: Page;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let db: Awaited<ReturnType<typeof buildApp>>['db'];

beforeAll(async () => {
  if (!existsSync('web/dist/index.html')) throw new Error('web/dist is missing; run npm run build first');
  await resetDatabase(url);
  const built = await buildApp(testConfig(url), { logger: false, mailer });
  app = built.app;
  db = built.db;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind a port');
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${address.port}`);
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
  await app?.close();
  await db?.close();
});

test('a visitor request is approved from the admin table', async () => {
  await page.getByRole('button', { name: 'Pedir acceso', exact: true }).click();
  const emails = page.getByLabel('Correo');
  await emails.nth(1).fill('bea@example.com');
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await page.getByText('Solicitud enviada').waitFor();

  await emails.nth(0).fill(adminEmail);
  await page.getByLabel('Contraseña').fill(adminPassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitudes', exact: true }).click();
  await page.getByRole('cell', { name: 'bea@example.com' }).waitFor();
  await page.getByRole('button', { name: 'Acciones', exact: true }).click();
  await page.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await page.getByText('Invitación enviada.').waitFor();
  expect(mailer.sent.some((message) => message.to === 'bea@example.com' && message.text.includes('/invite/'))).toBe(true);

  await page.getByRole('button', { name: 'Miembros', exact: true }).click();
  await page.getByRole('cell', { name: adminEmail }).waitFor();
  await page.getByRole('button', { name: 'Invitaciones', exact: true }).click();
  await page.getByRole('cell', { name: 'bea@example.com' }).waitFor();
  await page.getByRole('button', { name: 'Acciones', exact: true }).click();
  await page.getByRole('button', { name: 'Reenviar', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Revocar', exact: true }).waitFor();

  const sent = mailer.sent.find((message) => message.to === 'bea@example.com');
  const token = sent?.text.match(/\/invite\/(\S+)/)?.[1];
  if (!token) throw new Error('invite link missing');
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
  await page.goto(new URL(`/invite/${token}`, page.url()).href);
  await page.getByLabel('Nombre').fill('Bea');
  await page.getByLabel('Correo').fill('bea@example.com');
  await page.getByLabel('Contraseña').fill('bea-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await page.goto(new URL('/', page.url()).href);
  await page.getByLabel('Correo').fill(adminEmail);
  await page.getByLabel('Contraseña').fill(adminPassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await page.getByRole('cell', { name: 'Bea', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Acciones', exact: true }).click();
  await page.getByRole('button', { name: 'Desactivar', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  const shell = await page.locator('.section-shell').boundingBox();
  const nav = await page.locator('.section-nav').boundingBox();
  expect(shell).toBeTruthy();
  expect(nav).toBeTruthy();
  expect(nav!.width).toBeGreaterThan(shell!.width - 8);
  expect(nav!.y).toBeLessThanOrEqual(shell!.y + 1);
});
