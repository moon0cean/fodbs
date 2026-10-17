import postgres from 'postgres';
import type { AppConfig } from '../src/config.js';

export const adminEmail = 'admin@example.com';
export const adminPassword = 'local-admin-pass';

export function databaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required');
  return url;
}

export function testConfig(url: string): AppConfig {
  return {
    databaseUrl: url,
    credentialsKey: Buffer.from('c2MilsdQfNFJz1R8zco7783rXHoFo44qhLLo56Bw5qo=', 'base64'),
    port: 0,
    cookieSecure: false,
    horizonDays: 7,
    historyDays: 7,
    cancelLeadMinutes: 180,
    penaltyGuardMinutes: 20,
    maxCourts: 4,
    maxPlayersPerCourt: 3,
    dirMaxPerDay: 2,
    dirMaxSimultaneous: 3,
    preLoginMinutes: 2,
    tickMs: 60_000,
    zone: 'Europe/Madrid',
    gymBaseUrl: 'https://example.test/login',
    gymFlow: 'fixture',
    gymHeadless: true,
    playwrightNoSandbox: true,
    bootstrapEmail: adminEmail,
    bootstrapPassword: adminPassword,
    bootstrapName: 'Admin',
    attemptBackoffMs: 60_000,
  };
}

export async function resetDatabase(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  await sql.unsafe('drop schema if exists public cascade; create schema public;');
  await sql.end();
}

export function sessionCookie(headers: { 'set-cookie'?: string | string[] | undefined }): Record<string, string> {
  const raw = headers['set-cookie'];
  const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const line = lines.find((item) => item.startsWith('fodbs_session='));
  if (!line) throw new Error('missing session cookie');
  return { fodbs_session: decodeURIComponent(line.slice('fodbs_session='.length).split(';')[0] ?? '') };
}
