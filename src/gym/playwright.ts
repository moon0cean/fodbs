import { DateTime } from 'luxon';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { flowIsReady, type GymBookRequest, type GymFlow, type GymGateway, type GymListedBooking, type GymLogin, type GymSession } from './gateway.js';
import { endClock, fase2Url, isRocafortUrl, parseListedBooking, remainingBons, type ListedRow } from './rocafort.js';

type BrowserSession = GymSession & {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export class PlaywrightGymGateway implements GymGateway {
  constructor(private readonly options: { flow: GymFlow; headless: boolean; noSandbox: boolean; zone?: string }) {}

  ready(): boolean {
    return isRocafortUrl(this.options.flow.loginUrl) || flowIsReady(this.options.flow);
  }

  canList(): boolean {
    return isRocafortUrl(this.options.flow.loginUrl);
  }

  async listBookings(session: GymSession): Promise<GymListedBooking[]> {
    if (!isRocafortUrl(this.options.flow.loginUrl)) return [];
    const page = browserPage(session);
    await page.goto(`${originOf(this.options.flow.loginUrl)}/ReservesLlista.php`);
    const rows = await page.locator('button[onclick*="ConfirmaEliminaPista"]').evaluateAll((nodes) => nodes.flatMap((node) => {
      const onclick = node.getAttribute('onclick') ?? '';
      const id = onclick.match(/ConfirmaEliminaPista\('([^']+)'/)?.[1];
      const row = node.closest('.row');
      const cols = row ? [...row.querySelectorAll('.LletraNormal')].map((cell) => (cell.textContent ?? '').trim()) : [];
      if (!id || cols.length < 4) return [];
      const listed: ListedRow = { id, court: cols[0] ?? '', date: cols[1] ?? '', start: cols[2] ?? '', end: cols[3] ?? '' };
      return [listed];
    }));
    return rows.flatMap((row) => {
      const parsed = parseListedBooking(row, this.zone());
      return parsed ? [parsed] : [];
    });
  }

  async listBons(session: GymSession): Promise<number | null> {
    if (!isRocafortUrl(this.options.flow.loginUrl)) return null;
    const page = browserPage(session);
    await page.goto(`${originOf(this.options.flow.loginUrl)}/BonsLlista.php`);
    const rows = await page.locator('table').first().locator('tr').evaluateAll((nodes) => nodes.map((node) => (
      [...node.children].map((cell) => (cell.textContent ?? '').trim())
    )));
    if (rows.length === 0) return null;
    const today = DateTime.now().setZone(this.zone()).toISODate();
    if (!today) return null;
    return remainingBons(rows, today);
  }

  async openSession(login: GymLogin): Promise<BrowserSession> {
    const flow = this.options.flow;
    const browser = await chromium.launch({
      headless: this.options.headless,
      args: this.options.noSandbox ? ['--disable-dev-shm-usage', '--no-sandbox'] : ['--disable-dev-shm-usage'],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    try {
      await page.goto(flow.loginUrl);
      await page.fill(flow.usernameSelector, login.username);
      await page.fill(flow.passwordSelector, login.password);
      await page.click(flow.submitSelector);
      if (flow.postLoginSelector) {
        await page.waitForSelector(flow.postLoginSelector);
      } else {
        try {
          await page.waitForFunction((selector) => {
            const node = document.querySelector(selector);
            return !(node instanceof HTMLElement) || node.offsetParent === null;
          }, flow.usernameSelector);
        } catch {
          throw new Error('gym_login_failed');
        }
      }
      if (await page.locator(flow.usernameSelector).isVisible().catch(() => false)) {
        throw new Error('gym_login_failed');
      }
      return { username: login.username, password: login.password, browser, context, page };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  async book(session: GymSession, request: GymBookRequest): Promise<{ externalRef: string }> {
    if (isRocafortUrl(this.options.flow.loginUrl)) return this.bookRocafort(session, request);
    const flow = this.options.flow;
    if (!flowIsReady(flow)) throw new Error('gym_flow_unconfigured');
    const page = browserPage(session);
    await page.goto(flow.bookUrl);
    if (flow.clubSelector) await page.fill(flow.clubSelector, request.clubCode);
    await page.fill(flow.courtSelector, String(request.courtIndex + 1));
    await page.fill(flow.startsSelector, request.startsAt.toISOString());
    await page.fill(flow.durationSelector, String(request.durationMinutes));
    await page.click(flow.bookSelector);
    await page.waitForSelector(flow.refSelector);
    const externalRef = (await page.locator(flow.refSelector).textContent())?.trim();
    if (!externalRef) throw new Error('missing_external_ref');
    return { externalRef };
  }

  async cancel(session: GymSession, externalRef: string): Promise<void> {
    if (isRocafortUrl(this.options.flow.loginUrl)) {
      const page = browserPage(session);
      const origin = originOf(this.options.flow.loginUrl);
      await page.goto(`${origin}/ReservesLlista.php?Operacio=EliminaPista&Comptador=${encodeURIComponent(externalRef)}`);
      const still = await page.locator(`button[onclick*="'${externalRef}'"]`).count();
      if (still > 0) throw new Error('cancel_failed');
      return;
    }
    const flow = this.options.flow;
    if (!flowIsReady(flow)) throw new Error('gym_flow_unconfigured');
    const page = browserPage(session);
    await page.goto(flow.cancelUrl(externalRef));
    await page.click(flow.cancelSelector);
    await page.waitForSelector(flow.cancelledSelector);
  }

  private zone(): string {
    return this.options.zone ?? 'Europe/Madrid';
  }

  private async bookRocafort(session: GymSession, request: GymBookRequest): Promise<{ externalRef: string }> {
    const page = browserPage(session);
    const origin = originOf(this.options.flow.loginUrl);
    const url = fase2Url(origin, request.courtIndex, request.startsAt, this.zone());
    if (!url) throw new Error('court_unavailable');
    const existing = new Set((await this.listBookings(session)).map((booking) => booking.externalRef));
    await page.goto(url);
    const end = page.locator('#HoraFinal');
    if (await end.count() === 0) throw new Error('slot_unavailable');
    const endValue = endClock(request.startsAt, request.durationMinutes, this.zone());
    const offered = await end.locator('option').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value')));
    if (!offered.includes(endValue)) throw new Error('duration_unavailable');
    await end.selectOption(endValue);
    const bo = page.locator('#Bo');
    if (await bo.count() === 0 || !(await bo.isEnabled())) throw new Error('bons_unavailable');
    await bo.check();
    await page.locator('button:visible', { hasText: 'Afegir a les meves reserves' }).click();
    await page.getByText('Reserva finalitzada correctament').waitFor();
    const created = (await this.listBookings(session)).find((booking) => !existing.has(booking.externalRef));
    if (!created) throw new Error('missing_external_ref');
    return { externalRef: created.externalRef };
  }

  async close(session: GymSession): Promise<void> {
    await browserPage(session).context().browser()?.close();
  }
}

function originOf(loginUrl: string): string {
  return new URL(loginUrl).origin;
}

function browserPage(session: GymSession): Page {
  if (!('page' in session)) throw new Error('session_has_no_page');
  return (session as BrowserSession).page;
}
