-- Privacy-first data model for La Previa / Discoteca-app.
-- PostgreSQL/Supabase compatible. This migration stores references to photos,
-- never the binary files themselves. Review with a privacy professional before
-- using it with real people or production data.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 60),
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  password_hash text not null,
  email_ciphertext text,
  phone_ciphertext text,
  adult_verified boolean not null default false,
  adult_verified_at timestamptz,
  adult_verification_source text,
  last_activity_at timestamptz,
  inactive_review_at timestamptz,
  status text not null default 'active' check (status in ('active', 'blocked', 'pending_deletion', 'deleted')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint adult_verification_consistent check (
    (adult_verified = false and adult_verified_at is null)
    or (adult_verified = true and adult_verified_at is not null)
  )
);


create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id),
  purpose text not null check (purpose in (
    'account', 'profile_visibility', 'photo_visibility', 'matching',
    'persistent_profile', 'marketing'
  )),
  policy_version text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  collection_source text not null default 'app',
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_name text not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists event_attendance (
  user_id uuid not null references app_users(id),
  event_id uuid not null references events(id),
  ticket_reference text not null,
  ticket_verified_at timestamptz not null,
  visible_to_attendees boolean not null default false,
  visibility_expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id),
  unique (event_id, ticket_reference)
);

create table if not exists profiles (
  user_id uuid primary key references app_users(id),
  song text,
  plan text,
  arrival_mode text,
  party_role text,
  updated_at timestamptz not null default now()
);

create table if not exists profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id),
  storage_key text not null unique,
  consent_id uuid references consent_records(id),
  photo_kind text not null check (photo_kind in ('profile', 'crew', 'event_temporary')),
  uploaded_at timestamptz not null default now(),
  delete_at timestamptz not null,
  deleted_at timestamptz,
  check (delete_at > uploaded_at)
);

create table if not exists crews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references app_users(id),
  name text not null check (char_length(name) between 2 and 60),
  phrase text check (phrase is null or char_length(phrase) <= 160),
  event_id uuid references events(id),
  photo_id uuid references profile_photos(id),
  delete_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists crew_members (
  crew_id uuid not null references crews(id),
  user_id uuid not null references app_users(id),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (crew_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  sender_user_id uuid not null references app_users(id),
  recipient_user_id uuid references app_users(id),
  crew_id uuid references crews(id),
  body text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now(),
  delete_at timestamptz not null,
  deleted_at timestamptz,
  check ((recipient_user_id is not null) <> (crew_id is not null))
);

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id),
  request_type text not null check (request_type in ('access', 'rectification', 'erasure', 'restriction', 'objection', 'portability')),
  status text not null default 'received' check (status in ('received', 'in_progress', 'completed', 'rejected')),
  received_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '1 month'),
  completed_at timestamptz,
  reason text
);

create table if not exists security_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app_users(id),
  action text not null,
  subject_type text not null,
  subject_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists profile_photos_due_idx on profile_photos(delete_at) where deleted_at is null;
create index if not exists crews_due_idx on crews(delete_at) where deleted_at is null;
create index if not exists messages_due_idx on messages(delete_at) where deleted_at is null;
create index if not exists privacy_requests_due_idx on privacy_requests(due_at) where status in ('received', 'in_progress');

-- The scheduled worker must:
-- 1) hide expired records immediately;
-- 2) delete the object from private storage;
-- 3) delete or anonymise the database row;
-- 4) apply the same deletion policy to backups.
