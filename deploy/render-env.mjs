import { pathToFileURL } from 'node:url';

const REQUIRED = ['CREDENTIALS_KEY', 'POSTGRES_PASSWORD', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD'];

export function renderEnv(input) {
  for (const key of REQUIRED) {
    if (!input[key]) throw new Error(`${key} is required`);
  }
  const mail = Boolean(input.SMTP_USER && input.SMTP_PASS && input.SMTP_FROM);
  const values = {
    DATABASE_URL: `postgres://fodbs:${encodeURIComponent(input.POSTGRES_PASSWORD)}@postgres:5432/fodbs`,
    POSTGRES_USER: 'fodbs',
    POSTGRES_PASSWORD: input.POSTGRES_PASSWORD,
    POSTGRES_DB: 'fodbs',
    CREDENTIALS_KEY: input.CREDENTIALS_KEY,
    BOOTSTRAP_ADMIN_EMAIL: input.BOOTSTRAP_ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD: input.BOOTSTRAP_ADMIN_PASSWORD,
    BOOTSTRAP_ADMIN_NAME: input.BOOTSTRAP_ADMIN_NAME || 'Admin',
    PORT: '8088',
    PUBLIC_URL: 'https://fodbs.yk2.dev',
    SMTP_HOST: mail ? 'smtp.gmail.com' : '',
    SMTP_PORT: '587',
    SMTP_USER: mail ? input.SMTP_USER : '',
    SMTP_PASS: mail ? input.SMTP_PASS : '',
    SMTP_FROM: mail ? input.SMTP_FROM : '',
    COOKIE_SECURE: 'true',
    HORIZON_DAYS: '7',
    HISTORY_DAYS: '7',
    CANCEL_LEAD_MINUTES: '180',
    PENALTY_GUARD_MINUTES: '20',
    MAX_COURTS: '4',
    MAX_PLAYERS_PER_COURT: '3',
    DIR_MAX_PER_DAY: '2',
    DIR_MAX_SIMULTANEOUS: '4',
    PRELOGIN_MINUTES: '2',
    TICK_MS: '15000',
    TZ_ZONE: 'Europe/Madrid',
    GYM_FLOW: 'dir',
    GYM_BASE_URL: 'https://pistes.esportiurocafort.com/index.php',
    GYM_HEADLESS: 'true',
    PLAYWRIGHT_NO_SANDBOX: 'true',
  };
  return Object.entries(values).map(([key, value]) => `${key}=${line(value)}`).join('\n') + '\n';
}

function line(value) {
  if (/[\r\n]/.test(value)) throw new Error('env values cannot contain newlines');
  return value;
}

const isDirect = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);

if (isDirect) {
  process.stdout.write(renderEnv(process.env));
}
