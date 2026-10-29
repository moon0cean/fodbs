import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { searchOpenings } from './booking.js';
import type { AppConfig } from './config.js';
import type { AppDatabase, SessionUser } from './db/index.js';
import type { GymGateway } from './gym/gateway.js';
import { inviteMessage, seatRequestMessage, type Mailer } from './mail.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { newSecret, sha256 } from './secrets.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

const loginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

const acceptBody = z.object({
  token: z.string().min(20),
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  displayName: z.string().trim().min(1).max(40),
});

const credentialBody = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

const spot = z.enum(['front_left', 'front_right', 'back']);
const availabilityBody = z.object({ in: z.boolean() });
const seatBody = z.object({ join: z.boolean(), position: spot.optional() });
const guestBody = z.object({ name: z.string().trim().max(40), position: spot });
const activeBody = z.object({ active: z.boolean() });
const preferenceBody = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.union([z.literal(2), z.literal(3)]),
});
const preferredBody = z.object({
  players: z.array(z.object({
    userId: z.string().min(1).nullable(),
    guestName: z.string().max(40).nullable(),
  })).max(4),
});
const searchBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
});
const confirmBody = z.object({
  startsAt: z.string().min(16),
  courtIndex: z.number().int().min(0).max(4),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
});
const schedulerBody = z.object({
  horizonDays: z.number().int().min(1).max(14),
  tickSeconds: z.number().int().min(5).max(3600),
  tryOffset: z.boolean(),
  availabilityEnabled: z.boolean(),
  availabilityAccountId: z.string().min(1).nullable(),
  availabilityIntervalHours: z.number().int().min(1).max(48),
});

const inviteBody = z.object({
  role: z.enum(['admin', 'member']).default('member'),
  email: z.string().trim().email(),
});
const accessBody = z.object({ email: z.string().trim().email() });

const slotBody = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(30).max(180),
  clubCode: z.string().trim().min(1).max(32),
});

export function registerRoutes(app: FastifyInstance, db: AppDatabase, config: AppConfig, mailer: Mailer, gateway: GymGateway): void {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (request) => {
    request.user = null;
    const raw = request.cookies.fodbs_session;
    if (!raw) return;
    request.user = await db.findSession(sha256(raw), new Date());
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.post('/api/access-requests', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parse(accessBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    await db.requestAccess(body.email.toLowerCase(), new Date());
    return reply.code(204).send();
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parse(loginBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    const user = await db.findUserByEmail(body.email.toLowerCase());
    const valid = user ? await verifyPassword(user.passwordHash, body.password) : false;
    if (!user || !valid) return fail(reply, 401, 'invalid_credentials');
    await issueSession(db, user.id, reply, config);
    return publicUser(user);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const raw = request.cookies.fodbs_session;
    if (raw) await db.deleteSession(sha256(raw));
    reply.clearCookie('fodbs_session', cookieOptions(config));
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const account = await db.accountView(user.id, new Date());
    return { ...publicUser(user), hasGymCredentials: account.hasGymCredentials };
  });

  app.post('/api/auth/accept-invite', async (request, reply) => {
    const body = parse(acceptBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    if (body.password.length < 10) return fail(reply, 400, 'weak_password');
    const passwordHash = await hashPassword(body.password);
    const result = await db.acceptInvite({
      tokenHash: sha256(body.token),
      email: body.email.toLowerCase(),
      passwordHash,
      displayName: body.displayName,
      now: new Date(),
    });
    if ('error' in result) return fail(reply, 400, result.error);
    await issueSession(db, result.user.id, reply, config);
    return reply.code(201).send(publicUser(result.user));
  });

  app.get('/api/account', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const account = await db.accountView(user.id, new Date());
    return {
      balance: account.balance,
      hasGymCredentials: account.hasGymCredentials,
      gymUsername: account.gymUsername,
      preferences: account.preferences,
      companions: account.companions,
      preferred: account.preferred,
      active: user.active,
      reservations: account.reservations.map((reservation) => ({
        ...reservation,
        startsAt: reservation.startsAt.toISOString(),
      })),
      bonsRemaining: account.bonsRemaining,
      bonsCheckedAt: account.bonsCheckedAt?.toISOString() ?? null,
      syncedAt: account.syncedAt?.toISOString() ?? null,
    };
  });

  app.post('/api/account/sync', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const accepted = await db.requestSync(user.id);
    if (!accepted) return fail(reply, 400, 'no_credentials');
    return reply.code(202).send({ accepted: true });
  });

  app.patch('/api/account/active', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(activeBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    await db.setOwnActive(user.id, body.active, new Date());
    return { ...publicUser(user), active: body.active };
  });

  app.put('/api/account/credentials', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(credentialBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    await db.saveCredentials(user.id, body.username, body.password, new Date());
    return reply.code(204).send();
  });

  app.put('/api/account/preferences', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(preferenceBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    await db.savePreferences({ ...body, userId: user.id, now: new Date() });
    return reply.code(204).send();
  });

  app.put('/api/account/preferred', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(preferredBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    await db.savePreferred(user.id, body.players);
    return reply.code(204).send();
  });

  app.post('/api/bookings/search', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(searchBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    const startsAt = DateTime.fromISO(`${body.date}T${body.time}`, { zone: config.zone }).toJSDate();
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return fail(reply, 400, 'started');
    const creds = await db.credentials(user.id);
    if (!creds) return fail(reply, 400, 'no_credentials');
    if (!gateway.ready()) return fail(reply, 400, 'gym_flow_unconfigured');
    const session = await gateway.openSession(creds);
    try {
      return await searchOpenings({
        gateway,
        session,
        now: new Date(),
        maxCourts: Math.min(config.maxCourts, 4),
        startsAt,
        durationMinutes: body.durationMinutes,
        clubCode: 'ROC',
      });
    } finally {
      await gateway.close(session);
    }
  });

  app.post('/api/bookings/confirm', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(confirmBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return fail(reply, 400, 'started');
    const creds = await db.credentials(user.id);
    if (!creds) return fail(reply, 400, 'no_credentials');
    const candidates = await db.candidates(startsAt, new Date());
    const mine = candidates.find((candidate) => candidate.userId === user.id);
    if (!mine) return fail(reply, 400, 'no_credentials');
    if (mine.bookingsOnDay >= config.dirMaxPerDay) return fail(reply, 400, 'daily_cap');
    if (mine.simultaneousHeld >= config.dirMaxSimultaneous) return fail(reply, 400, 'simultaneous_cap');
    if (!gateway.ready()) return fail(reply, 400, 'gym_flow_unconfigured');
    const session = await gateway.openSession(creds);
    try {
      const booked = await gateway.book(session, {
        clubCode: 'ROC',
        courtIndex: body.courtIndex,
        startsAt,
        durationMinutes: body.durationMinutes,
      });
      try {
        const error = await db.bookManual({
          userId: user.id,
          courtIndex: body.courtIndex,
          startsAt,
          durationMinutes: body.durationMinutes,
          externalRef: booked.externalRef,
          now: new Date(),
        });
        if (error) {
          await gateway.cancel(session, booked.externalRef).catch(() => undefined);
          return fail(reply, 400, error);
        }
        await db.requestSync(user.id);
      } catch (error) {
        await gateway.cancel(session, booked.externalRef).catch(() => undefined);
        throw error;
      }
      return reply.code(201).send({ externalRef: booked.externalRef });
    } finally {
      await gateway.close(session);
    }
  });

  app.get('/api/dashboard', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(request.query);
    if (!query.success) return fail(reply, 400, 'invalid_body');
    const date = query.data.date ?? DateTime.now().setZone(config.zone).toISODate();
    if (!date) return fail(reply, 400, 'invalid_body');
    const dashboard = await db.dashboard(date, user.id, new Date());
    if ('error' in dashboard && dashboard.error) return fail(reply, 400, dashboard.error);
    return {
      ...dashboard,
      occurrences: dashboard.occurrences.map((occurrence) => ({
        ...occurrence,
        startsAt: occurrence.startsAt.toISOString(),
      })),
    };
  });

  app.post('/api/occurrences/:id/availability', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(availabilityBody, request.body);
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!body || !params.success) return fail(reply, 400, 'invalid_body');
    const error = await db.setAvailability(user.id, params.data.id, body.in, new Date());
    if (error === 'missing') return fail(reply, 404, error);
    if (error) return fail(reply, 400, error);
    return reply.code(204).send();
  });

  app.post('/api/reservations/:id/seats', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(seatBody, request.body);
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!body || !params.success) return fail(reply, 400, 'invalid_body');
    if (body.join && !body.position) return fail(reply, 400, 'invalid_body');
    const error = await db.setSeat(user.id, params.data.id, body.join, body.position ?? null, new Date());
    if (error === 'requested') {
      await notifySeatRequest(mailer, config, db, params.data.id, user.id);
      return reply.code(202).send({ requested: true });
    }
    if (error === 'already_requested') return reply.code(202).send({ requested: true });
    if (error === 'missing') return fail(reply, 404, error);
    if (error) return fail(reply, 400, error);
    return reply.code(204).send();
  });

  app.post('/api/reservations/:id/requests/:requestId/:decision', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const params = z.object({
      id: z.string().min(1),
      requestId: z.string().min(1),
      decision: z.enum(['approve', 'reject']),
    }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const error = await db.decideSeatRequest(
      user.id,
      params.data.id,
      params.data.requestId,
      params.data.decision === 'approve',
      new Date(),
    );
    if (error === 'missing') return fail(reply, 404, error);
    if (error === 'not_owner') return fail(reply, 403, error);
    if (error) return fail(reply, 400, error);
    return reply.code(204).send();
  });

  app.post('/api/reservations/:id/guests', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = parse(guestBody, request.body);
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!body || !params.success) return fail(reply, 400, 'invalid_body');
    const error = await db.addCourtGuest(user.id, params.data.id, body.name, body.position, new Date());
    if (error === 'missing') return fail(reply, 404, error);
    if (error) return fail(reply, 400, error);
    return reply.code(204).send();
  });

  app.delete('/api/reservations/:id/guests/:seatId', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const params = z.object({ id: z.string().min(1), seatId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const error = await db.removeCourtGuest(user.id, params.data.id, params.data.seatId, new Date());
    if (error === 'missing') return fail(reply, 404, error);
    if (error) return fail(reply, 400, error);
    return reply.code(204).send();
  });

  app.delete('/api/reservations/:id/seats/:seatId', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const params = z.object({ id: z.string().min(1), seatId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const error = await db.removeHeldPlayer(user.id, params.data.id, params.data.seatId, new Date());
    if (error === 'missing') return fail(reply, 404, error);
    if (error) return fail(reply, 400, error);
    return reply.code(204).send();
  });

  app.post('/api/reservations/:id/cancel', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const now = new Date();
    const ready = await db.heldForHolderCancel(user.id, params.data.id, now);
    if (typeof ready === 'string') {
      if (ready === 'missing') return fail(reply, 404, ready);
      return fail(reply, 400, ready);
    }
    const claim = await db.claimAttempt(`cancel:${params.data.id}`, 'cancel', now);
    if (claim !== 'claimed') return fail(reply, 400, 'not_held');
    const creds = await db.credentials(user.id);
    if (!creds) {
      await db.finishAttempt(`cancel:${params.data.id}`, 'failed', 'missing_credentials', now);
      return fail(reply, 400, 'no_credentials');
    }
    if (!gateway.ready()) {
      await db.finishAttempt(`cancel:${params.data.id}`, 'failed', 'gym_flow_unconfigured', now);
      return fail(reply, 400, 'gym_flow_unconfigured');
    }
    const session = await gateway.openSession(creds);
    try {
      await gateway.cancel(session, ready.externalRef);
      await db.markCancelled(params.data.id, now);
      await db.finishAttempt(`cancel:${params.data.id}`, 'succeeded', ready.externalRef, now);
      return reply.code(204).send();
    } catch {
      await db.finishAttempt(`cancel:${params.data.id}`, 'failed', 'cancel_failed', now);
      return fail(reply, 400, 'cancel_failed');
    } finally {
      await gateway.close(session);
    }
  });

  app.get('/api/admin/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return { users: await db.listUsers() };
  });

  app.get('/api/admin/users/:id/bookings', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const found = await db.memberBookings(params.data.id, new Date());
    if (!found) return fail(reply, 404, 'missing');
    return found;
  });

  app.patch('/api/admin/users/:id', async (request, reply) => {
    const actor = requireAdmin(request, reply);
    if (!actor) return;
    const body = parse(activeBody, request.body);
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!body || !params.success) return fail(reply, 400, 'invalid_body');
    const result = await db.setUserActive(params.data.id, body.active, actor.id);
    if (result === 'self') return fail(reply, 400, 'self_deactivate');
    if (result === 'missing') return fail(reply, 404, 'missing');
    return reply.code(204).send();
  });

  app.delete('/api/admin/users/:id', async (request, reply) => {
    const actor = requireAdmin(request, reply);
    if (!actor) return;
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const result = await db.removeUser(params.data.id, actor.id);
    if (result === 'missing') return fail(reply, 404, 'missing');
    if (result !== 'ok') return fail(reply, 400, result);
    return reply.code(204).send();
  });

  app.post('/api/admin/invites', async (request, reply) => {
    const actor = requireAdmin(request, reply);
    if (!actor) return;
    const body = parse(inviteBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    const created = await sendInvite(db, mailer, config, request, {
      email: body.email.toLowerCase(),
      role: body.role ?? 'member',
      createdBy: actor.id,
    });
    return reply.code(201).send(created);
  });

  app.post('/api/admin/invites/:id/send', async (request, reply) => {
    const actor = requireAdmin(request, reply);
    if (!actor) return;
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const secret = newSecret();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const rotated = await db.replaceInviteToken(params.data.id, secret.hash, expiresAt);
    if (!rotated) return fail(reply, 400, 'missing');
    const mailed = await deliverInvite(mailer, config, request, rotated.email, secret.raw);
    return { token: secret.raw, email: rotated.email, mailed };
  });

  app.delete('/api/admin/invites/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const result = await db.deleteInvite(params.data.id);
    if (result === 'missing') return fail(reply, 404, 'missing');
    if (result === 'used') return fail(reply, 400, 'used');
    return reply.code(204).send();
  });

  app.get('/api/admin/access-requests', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const requests = await db.listAccessRequests();
    return {
      requests: requests.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    };
  });

  app.post('/api/admin/access-requests/:id/approve', async (request, reply) => {
    const actor = requireAdmin(request, reply);
    if (!actor) return;
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const taken = await db.takeAccessRequest(params.data.id, 'approved', actor.id, new Date());
    if (!taken) return fail(reply, 404, 'missing');
    const created = await sendInvite(db, mailer, config, request, {
      email: taken.email,
      role: 'member',
      createdBy: actor.id,
    });
    return reply.code(201).send(created);
  });

  app.post('/api/admin/access-requests/:id/reject', async (request, reply) => {
    const actor = requireAdmin(request, reply);
    if (!actor) return;
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return fail(reply, 400, 'invalid_body');
    const taken = await db.takeAccessRequest(params.data.id, 'rejected', actor.id, new Date());
    if (!taken) return fail(reply, 404, 'missing');
    return reply.code(204).send();
  });

  app.get('/api/admin/invites', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const invites = await db.listInvites();
    return {
      invites: invites.map((invite) => ({
        ...invite,
        expiresAt: invite.expiresAt.toISOString(),
        usedAt: invite.usedAt?.toISOString() ?? null,
      })),
    };
  });

  app.get('/api/admin/slot-rules', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return { rules: await db.listSlotRules() };
  });

  app.post('/api/admin/slot-rules', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = parse(slotBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    const id = await db.createSlotRule({ ...body, now: new Date() });
    return reply.code(201).send({ id, ...body, active: true });
  });

  app.patch('/api/admin/slot-rules/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = parse(activeBody, request.body);
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!body || !params.success) return fail(reply, 400, 'invalid_body');
    const updated = await db.setSlotRuleActive(params.data.id, body.active);
    if (!updated) return fail(reply, 404, 'missing');
    return reply.code(204).send();
  });

  app.get('/api/admin/scheduler', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const stored = await db.schedulerSettings();
    const users = await db.listUsers();
    return {
      settings: stored ?? {
        horizonDays: config.horizonDays,
        tickSeconds: Math.max(5, Math.round(config.tickMs / 1000)),
        tryOffset: true,
        availabilityEnabled: false,
        availabilityAccountId: null,
        availabilityIntervalHours: 6,
      },
      accounts: users.filter((person) => person.hasGymCredentials).map((person) => ({ id: person.id, displayName: person.displayName })),
    };
  });

  app.put('/api/admin/scheduler', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = parse(schedulerBody, request.body);
    if (!body) return fail(reply, 400, 'invalid_body');
    await db.saveSchedulerSettings(body);
    return reply.code(204).send();
  });
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}

function fail(reply: FastifyReply, status: number, error: string) {
  return reply.code(status).send({ error });
}

function requestOrigin(config: AppConfig, request: FastifyRequest): string {
  if (config.publicUrl) return config.publicUrl;
  const forwarded = request.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0] || request.protocol;
  return `${proto}://${request.headers.host ?? 'localhost'}`;
}

const COURT_NUMBERS = ['04', '05', '10', '11', '12'];

async function notifySeatRequest(
  mailer: Mailer,
  config: AppConfig,
  db: AppDatabase,
  reservationId: string,
  requesterId: string,
): Promise<void> {
  if (!mailer.configured()) return;
  const notice = await db.seatRequestNotice(reservationId, requesterId);
  if (!notice) return;
  const when = DateTime.fromJSDate(notice.startsAt, { zone: config.zone }).setLocale('es').toFormat('cccc d LLLL HH:mm');
  const message = seatRequestMessage(notice.requesterName, when, COURT_NUMBERS[notice.courtIndex] ?? String(notice.courtIndex));
  try {
    await mailer.send({ to: notice.to, ...message });
  } catch {
    // The request stays on the court for the holder to approve.
  }
}

async function deliverInvite(mailer: Mailer, config: AppConfig, request: FastifyRequest, email: string, token: string): Promise<boolean> {
  if (!mailer.configured()) return false;
  await mailer.send({
    to: email,
    subject: 'Invitación a FODBS',
    text: inviteMessage(`${requestOrigin(config, request)}/invite/${token}`),
  });
  return true;
}

async function sendInvite(
  db: AppDatabase,
  mailer: Mailer,
  config: AppConfig,
  request: FastifyRequest,
  input: { email: string; role: 'admin' | 'member'; createdBy: string },
) {
  const secret = newSecret();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.createInvite({
    tokenHash: secret.hash,
    email: input.email,
    role: input.role,
    createdBy: input.createdBy,
    expiresAt,
  });
  const mailed = await deliverInvite(mailer, config, request, input.email, secret.raw);
  return { token: secret.raw, expiresAt: expiresAt.toISOString(), role: input.role, email: input.email, mailed };
}

function requireUser(request: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (!request.user) {
    void fail(reply, 401, 'unauthenticated');
    return null;
  }
  return request.user;
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply): SessionUser | null {
  const user = requireUser(request, reply);
  if (!user) return null;
  if (user.role !== 'admin') {
    void fail(reply, 403, 'forbidden');
    return null;
  }
  return user;
}

function publicUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
  };
}

function cookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  };
}

async function issueSession(db: AppDatabase, userId: string, reply: FastifyReply, config: AppConfig) {
  const secret = newSecret();
  await db.createSession(userId, secret.hash, new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
  reply.setCookie('fodbs_session', secret.raw, cookieOptions(config));
}
