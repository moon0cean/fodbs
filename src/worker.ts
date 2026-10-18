import { loadConfig, schedulerConfig } from './config.js';
import { AppDatabase } from './db/index.js';
import { dirFlow, fixtureFlow } from './gym/gateway.js';
import { PlaywrightGymGateway } from './gym/playwright.js';
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
    });
    if (gateway.canList()) {
      for (const login of await db.pendingCredentialSync()) {
        const imported = await syncAccountBookings(db, gateway, login);
        await db.markCredentialsSynced(login.userId, new Date());
        log({ msg: 'bookings_synced', userId: login.userId, imported });
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
