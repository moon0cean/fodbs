import { existsSync } from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { AppDatabase } from './db/index.js';
import { redactInviteUrl } from './domain.js';
import { dirFlow, fixtureFlow, type GymGateway } from './gym/gateway.js';
import { PlaywrightGymGateway } from './gym/playwright.js';
import { registerRoutes } from './http.js';
import { SmtpMailer, UnconfiguredMailer, type Mailer } from './mail.js';
import { hashPassword } from './passwords.js';

export async function buildApp(config: AppConfig, options?: { logger?: boolean; mailer?: Mailer; gateway?: GymGateway }): Promise<{ app: FastifyInstance; db: AppDatabase }> {
  const app = Fastify({
    logger: options?.logger === false
      ? false
      : {
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.body.password',
              'req.body.token',
              'req.body.username',
            ],
            censor: '[redacted]',
          },
          serializers: {
            req(request) {
              return {
                method: request.method,
                url: redactInviteUrl(request.url),
                host: request.host,
                remoteAddress: request.ip,
              };
            },
          },
        },
  });
  const db = await AppDatabase.open(config);

  if (config.bootstrapEmail && config.bootstrapPassword) {
    if (config.bootstrapPassword.length < 10) {
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters');
    }
    const created = await db.bootstrapAdmin(
      config.bootstrapEmail,
      await hashPassword(config.bootstrapPassword),
      config.bootstrapName.slice(0, 40) || 'Admin',
      new Date(),
    );
    if (created && options?.logger !== false) app.log.info({ email: config.bootstrapEmail }, 'bootstrapped admin');
  }

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({ error: 'rate_limited' }),
  });
  const mailer = options?.mailer ?? (config.smtpHost && config.smtpFrom
    ? new SmtpMailer({
        host: config.smtpHost,
        port: config.smtpPort,
        user: config.smtpUser,
        pass: config.smtpPass,
        from: config.smtpFrom,
      })
    : new UnconfiguredMailer());
  const flow = config.gymFlow === 'fixture' ? fixtureFlow(config.gymBaseUrl) : dirFlow(config.gymBaseUrl);
  const gateway = options?.gateway ?? new PlaywrightGymGateway({
    flow,
    headless: config.gymHeadless,
    noSandbox: config.playwrightNoSandbox,
    zone: config.zone,
  });
  registerRoutes(app, db, config, mailer, gateway);

  const webDist = path.resolve('web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) return reply.code(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  return { app, db };
}
