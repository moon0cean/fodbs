import { boolean, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const invites = pgTable('invites', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  email: text('email'),
  role: text('role').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  usedBy: text('used_by'),
});

export const gymCredentials = pgTable('gym_credentials', {
  userId: text('user_id').primaryKey().references(() => users.id),
  usernameCiphertext: text('username_ciphertext').notNull(),
  usernameNonce: text('username_nonce').notNull(),
  passwordCiphertext: text('password_ciphertext').notNull(),
  passwordNonce: text('password_nonce').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true, mode: 'date' }),
});

export const accessRequests = pgTable('access_requests', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
  resolvedBy: text('resolved_by'),
});

export const slotRules = pgTable('slot_rules', {
  id: text('id').primaryKey(),
  weekday: integer('weekday').notNull(),
  startTime: text('start_time').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  clubCode: text('club_code').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const occurrences = pgTable(
  'occurrences',
  {
    id: text('id').primaryKey(),
    slotRuleId: text('slot_rule_id').references(() => slotRules.id),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    clubCode: text('club_code').notNull(),
    courtsTargeted: integer('courts_targeted'),
    grabbedAt: timestamp('grabbed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [uniqueIndex('occurrences_rule_start_idx').on(table.slotRuleId, table.startsAt)],
);

export const availability = pgTable(
  'availability',
  {
    occurrenceId: text('occurrence_id').notNull().references(() => occurrences.id),
    userId: text('user_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    declined: boolean('declined').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.occurrenceId, table.userId] })],
);

export const playerPreferences = pgTable('player_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id),
  weekdays: text('weekdays').notNull(),
  preferredTime: text('preferred_time').notNull(),
  partySize: integer('party_size').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const reservations = pgTable(
  'reservations',
  {
    id: text('id').primaryKey(),
    occurrenceId: text('occurrence_id').notNull().references(() => occurrences.id),
    courtIndex: integer('court_index').notNull(),
    chargedUserId: text('charged_user_id').notNull().references(() => users.id),
    externalRef: text('external_ref').notNull(),
    status: text('status').notNull(),
    bookedAt: timestamp('booked_at', { withTimezone: true, mode: 'date' }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    hostUserId: text('host_user_id'),
    effective: boolean('effective').notNull().default(false),
  },
  (table) => [uniqueIndex('reservations_occ_court_idx').on(table.occurrenceId, table.courtIndex)],
);

export const seats = pgTable('seats', {
  id: text('id').primaryKey(),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  userId: text('user_id').references(() => users.id),
  guestName: text('guest_name'),
  position: text('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const bookingAttempts = pgTable('booking_attempts', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  detail: text('detail').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
});
