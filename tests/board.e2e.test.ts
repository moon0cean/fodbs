import { existsSync } from 'node:fs';
import { DateTime } from 'luxon';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { adminEmail, adminPassword, databaseUrl, resetDatabase, testConfig } from './support.js';

const url = databaseUrl();
const target = DateTime.now().setZone('Europe/Madrid').plus({ days: 3 }).set({ hour: 20, minute: 0, second: 0, millisecond: 0 });

let browser: Browser;
let page: Page;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let db: Awaited<ReturnType<typeof buildApp>>['db'];
let base: string;

beforeAll(async () => {
  if (!existsSync('web/dist/index.html')) throw new Error('web/dist is missing; run npm run build first');
  await resetDatabase(url);
  const built = await buildApp(testConfig(url), { logger: false });
  app = built.app;
  db = built.db;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind a port');
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
  await app?.close();
  await db?.close();
});

test('opting in keeps the court pair centered', async () => {
  await page.goto(base);
  await page.getByLabel('Correo').fill(adminEmail);
  await page.getByLabel('Contraseña').fill('not-the-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.locator('.banner').waitFor();
  expect(await page.locator('.banner').textContent()).toBe('Correo o contraseña incorrectos.');
  await page.getByLabel('Contraseña').fill(adminPassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Tablero', exact: true }).waitFor();
  expect(await page.locator('.sub').textContent()).toBe('Fuck-off DiR booking system');

  const created = await page.request.post(`${base}/api/admin/slot-rules`, {
    data: { weekday: target.weekday, startTime: '20:00', durationMinutes: 60, clubCode: 'ROC' },
  });
  expect(created.ok()).toBe(true);
  const later = await page.request.post(`${base}/api/admin/slot-rules`, {
    data: { weekday: target.weekday, startTime: '21:00', durationMinutes: 60, clubCode: 'ROC' },
  });
  expect(later.ok()).toBe(true);

  const linked = await page.request.put(`${base}/api/account/credentials`, {
    data: { username: 'member', password: 'club-password' },
  });
  expect(linked.ok()).toBe(true);

  const iso = target.toISODate() ?? '';
  await page.locator(`[data-date="${iso}"]`).click();
  await page.getByRole('button', { name: 'Me apunto', exact: true }).first().waitFor();
  expect(await page.locator('.joins').getByRole('button', { name: 'Me apunto', exact: true }).count()).toBe(2);
  expect(await page.locator('.squash').getByRole('button', { name: 'Me apunto', exact: true }).count()).toBe(0);
  expect(await page.locator('.court-label span').allTextContents()).toEqual(['Pista 05', 'Pista 04', 'Pista 11', 'Pista 10']);
  const bubble = await page.locator('.bubble').first().boundingBox();
  expect(bubble).toBeTruthy();
  expect(Math.abs((bubble?.width ?? 0) - (bubble?.height ?? 0))).toBeLessThan(2);

  const panel = page.locator('main.panel');
  const slot = page.locator('.slot');
  const layout = page.locator('.slot-layout');
  const before = await centered(panel, layout);
  expect(before.gap).toBeLessThan(8);
  await expectFilled(slot, layout);

  const beforeBoxes = await page.locator('.squash').evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.x, height: box.height };
  }));

  await page.locator('.joins').getByRole('button', { name: 'Me apunto', exact: true }).first().click();
  await page.locator('.joins').getByRole('button', { name: 'Apuntado', exact: true }).waitFor();

  const after = await centered(panel, layout);
  expect(after.gap).toBeLessThan(8);
  await expectFilled(slot, layout);
  const afterBoxes = await page.locator('.squash').evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.x, height: box.height, playing: Boolean(node.querySelector('.time-slider, .bubble.filled')) };
  }));
  afterBoxes.forEach((box, index) => {
    expect(Math.abs(box.x - (beforeBoxes[index]?.x ?? 0))).toBeLessThan(2);
    if (!box.playing) expect(Math.abs(box.height - (beforeBoxes[index]?.height ?? 0))).toBeLessThan(2);
  });
  expect(afterBoxes.filter((box) => box.playing).length).toBe(0);
  expect(await page.locator('.bubble.filled').count()).toBe(0);
  expect(await page.locator('.joins').getByRole('button', { name: 'Apuntado', exact: true }).count()).toBe(1);
  expect(await page.locator('.joins').getByRole('button', { name: 'Me apunto', exact: true }).count()).toBe(1);
  expect(await page.locator('.squash').getByRole('button', { name: 'Apuntado', exact: true }).count()).toBe(0);
  expect(await page.locator('.squash').getByRole('button', { name: 'Me apunto', exact: true }).count()).toBe(0);
  expect(await page.locator('.guest-remove').count()).toBe(0);
  expect(await page.locator('main').textContent()).not.toContain('Obligatorio');
});

test('courts slide sideways on a phone', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    const courts = page.locator('.courts');
    await courts.waitFor();
    const metrics = await courts.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    expect(metrics.scroll).toBeGreaterThan(metrics.client + 40);
    const first = await page.locator('.squash').nth(0).boundingBox();
    const second = await page.locator('.squash').nth(1).boundingBox();
    if (!first || !second) throw new Error('court layout is not visible');
    expect(second.x).toBeGreaterThan(first.x + first.width - 40);
    await page.locator('.squash').nth(3).scrollIntoViewIfNeeded();
    const last = await page.locator('.squash').nth(3).boundingBox();
    const view = page.viewportSize();
    if (!last || !view) throw new Error('court layout is not visible');
    expect(last.x).toBeGreaterThanOrEqual(0);
    expect(last.x + last.width).toBeLessThanOrEqual(view.width + 1);
    expect(await page.locator('.court-label span').nth(3).textContent()).toBe('Pista 10');
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

test('the account page pauses and restores the signed-in member', async () => {
  await page.getByRole('button', { name: 'Cuenta', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar cuenta', exact: true }).click();
  await page.getByText('La cuenta está en pausa').waitFor();
  await page.getByRole('button', { name: 'Tablero', exact: true }).click();
  await page.getByText('La cuenta está en pausa').waitFor();
  await page.getByRole('button', { name: 'Cuenta', exact: true }).click();
  await page.getByRole('button', { name: 'Activar cuenta', exact: true }).click();
  await page.getByText('La cuenta está activa').waitFor();
});

async function expectFilled(slot: ReturnType<Page['locator']>, layout: ReturnType<Page['locator']>) {
  const slotBox = await slot.boundingBox();
  const layoutBox = await layout.boundingBox();
  const left = await page.locator('.squash').nth(0).boundingBox();
  const right = await page.locator('.squash').nth(1).boundingBox();
  if (!slotBox || !layoutBox || !left || !right) throw new Error('court layout is not visible');
  expect(layoutBox.width).toBeGreaterThan(slotBox.width - 48);
  expect(right.x + right.width - left.x).toBeGreaterThan(layoutBox.width - 8);
}

async function centered(panel: ReturnType<Page['locator']>, layout: ReturnType<Page['locator']>) {
  const panelBox = await panel.boundingBox();
  const layoutBox = await layout.boundingBox();
  if (!panelBox || !layoutBox) throw new Error('court layout is not visible');
  const left = layoutBox.x - panelBox.x;
  const right = panelBox.x + panelBox.width - (layoutBox.x + layoutBox.width);
  return { gap: Math.abs(left - right) };
}
