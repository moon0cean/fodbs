export const schemaSql = `
create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  role text not null check (role in ('admin', 'member')),
  active boolean not null default true,
  created_at timestamptz not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id),
  expires_at timestamptz not null
);

create table if not exists invites (
  id text primary key,
  token_hash text not null unique,
  email text,
  role text not null check (role in ('admin', 'member')),
  created_by text not null references users(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by text
);

create table if not exists gym_credentials (
  user_id text primary key references users(id),
  username_ciphertext text not null,
  username_nonce text not null,
  password_ciphertext text not null,
  password_nonce text not null,
  updated_at timestamptz not null
);

create table if not exists slot_rules (
  id text primary key,
  weekday integer not null check (weekday between 1 and 7),
  start_time text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  club_code text not null,
  active boolean not null default true,
  created_at timestamptz not null
);

create table if not exists occurrences (
  id text primary key,
  slot_rule_id text not null references slot_rules(id),
  starts_at timestamptz not null,
  duration_minutes integer not null,
  club_code text not null,
  courts_targeted integer,
  grabbed_at timestamptz,
  unique (slot_rule_id, starts_at)
);

create table if not exists availability (
  occurrence_id text not null references occurrences(id),
  user_id text not null references users(id),
  created_at timestamptz not null,
  primary key (occurrence_id, user_id)
);

create table if not exists reservations (
  id text primary key,
  occurrence_id text not null references occurrences(id),
  court_index integer not null check (court_index between 0 and 3),
  charged_user_id text not null references users(id),
  external_ref text not null,
  status text not null check (status in ('held', 'cancelled', 'played')),
  booked_at timestamptz not null,
  cancelled_at timestamptz,
  unique (occurrence_id, court_index)
);

create table if not exists seats (
  reservation_id text not null references reservations(id),
  user_id text not null references users(id),
  created_at timestamptz not null,
  primary key (reservation_id, user_id)
);

alter table availability add column if not exists declined boolean not null default false;
alter table reservations add column if not exists starts_at timestamptz;
update reservations r set starts_at = o.starts_at from occurrences o where r.occurrence_id = o.id and r.starts_at is null;
alter table reservations add column if not exists host_user_id text;
alter table reservations add column if not exists effective boolean not null default false;

create table if not exists player_preferences (
  user_id text primary key references users(id),
  weekdays text not null,
  preferred_time text not null,
  party_size integer not null check (party_size in (2, 3)),
  updated_at timestamptz not null
);

alter table seats add column if not exists guest_name text;
alter table seats add column if not exists position text;
alter table seats add column if not exists id text;

do $$
begin
  if exists (
    select 1 from information_schema.key_column_usage
    where table_name = 'seats' and constraint_name = 'seats_pkey' and column_name = 'user_id'
  ) then
    alter table seats drop constraint seats_pkey;
    alter table seats alter column user_id drop not null;
    update seats set id = md5(reservation_id || user_id) where id is null;
    update seats set position = 'front_left' where position is null;
    alter table seats alter column id set not null;
    alter table seats alter column position set not null;
    alter table seats add primary key (id);
  end if;
end $$;

create unique index if not exists seats_reservation_position_idx on seats (reservation_id, position);
create unique index if not exists seats_reservation_user_idx on seats (reservation_id, user_id) where user_id is not null;

alter table gym_credentials add column if not exists synced_at timestamptz;
alter table gym_credentials add column if not exists bons_remaining integer;
alter table gym_credentials add column if not exists bons_checked_at timestamptz;
alter table gym_credentials add column if not exists bons_notice text not null default 'ok';
alter table occurrences alter column slot_rule_id drop not null;
create unique index if not exists reservations_external_ref_idx on reservations (external_ref);

create table if not exists access_requests (
  id text primary key,
  email text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by text
);
create unique index if not exists access_requests_pending_email_idx on access_requests (email) where status = 'pending';

create table if not exists seat_requests (
  id text primary key,
  reservation_id text not null references reservations(id),
  user_id text not null references users(id),
  position text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null,
  resolved_at timestamptz
);
create unique index if not exists seat_requests_pending_idx on seat_requests (reservation_id, user_id) where status = 'pending';

create table if not exists booking_attempts (
  idempotency_key text primary key,
  kind text not null check (kind in ('grab', 'cancel')),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  detail text not null default '',
  updated_at timestamptz not null
);
`;
