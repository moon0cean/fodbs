import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { flowIsReady, type GymBookRequest, type GymFlow, type GymGateway, type GymLogin, type GymSession } from './gateway.js';

type BrowserSession = GymSession & {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export class PlaywrightGymGateway implements GymGateway {
  constructor(private readonly options: { flow: GymFlow; headless: boolean; noSandbox: boolean }) {}

  ready(): boolean {
    return flowIsReady(this.options.flow);
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
    const flow = this.options.flow;
    if (!flowIsReady(flow)) throw new Error('gym_flow_unconfigured');
    const page = browserPage(session);
    await page.goto(flow.cancelUrl(externalRef));
    await page.click(flow.cancelSelector);
    await page.waitForSelector(flow.cancelledSelector);
  }

  async close(session: GymSession): Promise<void> {
    await browserPage(session).context().browser()?.close();
  }
}

function browserPage(session: GymSession): Page {
  if (!('page' in session)) throw new Error('session_has_no_page');
  return (session as BrowserSession).page;
}
