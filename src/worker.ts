import { recordBons } from './bons.js';
import { loadConfig, schedulerConfig } from './config.js';
import { AppDatabase } from './db/index.js';
import { dirFlow, fixtureFlow } from './gym/gateway.js';
import { PlaywrightGymGateway } from './gym/playwright.js';
import { missedBookingMessage, SmtpMailer, UnconfiguredMailer, type Mailer } from './mail.js';
import { runSchedulerTick, SessionPool } from './scheduler.js';
import { syncAccountBookings } from './sync.js';

const config = loadConfig();
const db = await AppDatabase.open(config);
const flow = config.gymFlow === 'fixture' ? fixtureFlow(config.gymBaseUrl) : dirFlow(config.gymBaseUrl);
const gateway = new PlaywrightGymGateway({
  flow,
  headless: config.gymHeadless,
  noSandbox: config.playwrightNoSandbox,
  zone: config.zone,
});
const sessions = new SessionPool(gateway);
const mailer: Mailer = config.smtpHost && config.smtpFrom
  ? new SmtpMailer({
      host: config.smtpHost,
      port: config.smtpPort,
      user: config.smtpUser,
      pass: config.smtpPass,
      from: config.smtpFrom,
    })
  : new UnconfiguredMailer();
let running = false;
let stopped = false;

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...event }));
}

async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    await runSchedulerTick({
      now: new Date(),
      store: db,
      gateway,
      sessions,
      config: schedulerConfig(config),
      log,
      notifyMiss: async ({ when, emails }) => {
        if (!mailer.configured()) throw new Error('mail_unconfigured');
        const message = missedBookingMessage(when);
        for (const email of emails) await mailer.send({ to: email, ...message });
      },
    });
    if (gateway.canList()) {
      for (const login of await db.pendingCredentialSync()) {
        const synced = await syncAccountBookings(db, gateway, login);
        const now = new Date();
        if (synced.bons !== null) {
          const contact = await db.bonsContact(login.userId);
          if (contact) {
            let notice = contact.notice;
            try {
              notice = await recordBons({ remaining: synced.bons, previous: contact.notice, email: contact.email, mailer });
            } catch (error) {
              log({ msg: 'bons_mail_failed', userId: login.userId, detail: error instanceof Error ? error.message : 'error' });
            }
            await db.saveBons(login.userId, synced.bons, notice, now);
          }
        }
        await db.markCredentialsSynced(login.userId, now);
        log({ msg: 'bookings_synced', userId: login.userId, imported: synced.imported, bons: synced.bons });
      }
    }
  } catch (error) {
    log({ msg: 'tick_failed', detail: error instanceof Error ? error.message : 'error' });
  } finally {
    running = false;
  }
}

await tick();
const timer = setInterval(() => {
  void tick();
}, config.tickMs);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopped = true;
    clearInterval(timer);
    void sessions.closeAll().then(() => db.close()).then(() => process.exit(0));
  });
}
