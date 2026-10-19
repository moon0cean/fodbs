import { describe, expect, it } from 'vitest';
import { renderEnv } from '../deploy/render-env.mjs';

const secrets = {
  CREDENTIALS_KEY: 'a'.repeat(44),
  POSTGRES_PASSWORD: 'db-secret',
  BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
  BOOTSTRAP_ADMIN_PASSWORD: 'long-enough-password',
};

describe('renderEnv', () => {
  it('fills the public site and the court portal without copying them from a secret', () => {
    const env = renderEnv(secrets);
    expect(env).toContain('PUBLIC_URL=https://fodbs.yk2.dev\n');
    expect(env).toContain('COOKIE_SECURE=true\n');
    expect(env).toContain('GYM_BASE_URL=https://pistes.esportiurocafort.com/index.php\n');
    expect(env).toContain('GYM_FLOW=dir\n');
    expect(env).toContain('TZ_ZONE=Europe/Madrid\n');
    expect(env).toContain('DIR_MAX_SIMULTANEOUS=4\n');
    expect(env).toContain('SMTP_HOST=\n');
    expect(env).toContain('BOOTSTRAP_ADMIN_NAME=Admin\n');
  });

  it('turns on Gmail only when the mailbox secret is present', () => {
    const env = renderEnv({
      ...secrets,
      SMTP_USER: 'club@example.com',
      SMTP_PASS: 'app-password',
      SMTP_FROM: 'club@example.com',
    });
    expect(env).toContain('SMTP_HOST=smtp.gmail.com\n');
    expect(env).toContain('SMTP_PORT=587\n');
    expect(env).toContain('SMTP_FROM=club@example.com\n');
  });

  it('refuses to render when a required secret is missing', () => {
    expect(() => renderEnv({ ...secrets, CREDENTIALS_KEY: '' })).toThrow(/CREDENTIALS_KEY/);
  });
});
