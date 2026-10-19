import { readFileSync, existsSync } from 'node:fs';

export type AppConfig = {
  databaseUrl: string;
  credentialsKey: Buffer;
  port: number;
  cookieSecure: boolean;
  horizonDays: number;
  historyDays: number;
  cancelLeadMinutes: number;
  penaltyGuardMinutes: number;
  maxCourts: number;
  maxPlayersPerCourt: number;
  dirMaxPerDay: number;
  dirMaxSimultaneous: number;
  preLoginMinutes: number;
  tickMs: number;
  zone: string;
  gymBaseUrl: string;
  gymFlow: 'dir' | 'fixture';
  gymHeadless: boolean;
  playwrightNoSandbox: boolean;
  bootstrapEmail: string;
  bootstrapPassword: string;
  bootstrapName: string;
  attemptBackoffMs: number;
  publicUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
};

function loadEnvFile(): void {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

export function loadConfig(): AppConfig {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const key = Buffer.from(process.env.CREDENTIALS_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('CREDENTIALS_KEY must be 32 bytes of base64');
  const gymFlow = process.env.GYM_FLOW ?? 'dir';
  if (gymFlow !== 'dir' && gymFlow !== 'fixture') throw new Error('GYM_FLOW must be dir or fixture');
  return {
    databaseUrl,
    credentialsKey: key,
    port: integer('PORT', 8088),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    horizonDays: integer('HORIZON_DAYS', 7),
    historyDays: integer('HISTORY_DAYS', 7),
    cancelLeadMinutes: integer('CANCEL_LEAD_MINUTES', 180),
    penaltyGuardMinutes: integer('PENALTY_GUARD_MINUTES', 20),
    maxCourts: integer('MAX_COURTS', 4),
    maxPlayersPerCourt: integer('MAX_PLAYERS_PER_COURT', 3),
    dirMaxPerDay: integer('DIR_MAX_PER_DAY', 2),
    dirMaxSimultaneous: integer('DIR_MAX_SIMULTANEOUS', 4),
    preLoginMinutes: integer('PRELOGIN_MINUTES', 2),
    tickMs: integer('TICK_MS', 15_000),
    zone: process.env.TZ_ZONE ?? 'Europe/Madrid',
    gymBaseUrl: process.env.GYM_BASE_URL ?? 'https://pistes.esportiurocafort.com/index.php',
    gymFlow,
    gymHeadless: process.env.GYM_HEADLESS !== 'false',
    playwrightNoSandbox: process.env.PLAYWRIGHT_NO_SANDBOX === 'true',
    bootstrapEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase(),
    bootstrapPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
    bootstrapName: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Admin',
    attemptBackoffMs: integer('ATTEMPT_BACKOFF_MS', 60_000),
    publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: integer('SMTP_PORT', 587),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    smtpFrom: process.env.SMTP_FROM ?? '',
  };
}

export function schedulerConfig(config: AppConfig) {
  return {
    horizonDays: config.horizonDays,
    historyDays: config.historyDays,
    zone: config.zone,
    cancelLeadMinutes: config.cancelLeadMinutes,
    penaltyGuardMinutes: config.penaltyGuardMinutes,
    maxCourts: config.maxCourts,
    maxPlayersPerCourt: config.maxPlayersPerCourt,
    dirMaxPerDay: config.dirMaxPerDay,
    dirMaxSimultaneous: config.dirMaxSimultaneous,
    preLoginMinutes: config.preLoginMinutes,
    attemptBackoffMs: config.attemptBackoffMs,
  };
}
