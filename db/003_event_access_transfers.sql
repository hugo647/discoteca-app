-- One social access is created for every valid ticket. A ticket provider is
-- still the source of truth for payment and venue entry; this table only
-- controls who can use Jaleo for a particular event.

create table if not exists age_declarations (
  user_id uuid primary key references app_users(id) on delete cascade,
  declared_adult boolean not null default true,
  declared_at timestamptz not null default now(),
  policy_version text not null,
  collection_source text not null default 'registration'
);

create table if not exists event_accesses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  source_provider text not null,
  source_ticket_reference_hash text not null,
  purchased_by_user_id uuid references app_users(id) on delete set null,
  holder_user_id uuid references app_users(id) on delete set null,
  status text not null default 'available' check (status in ('available', 'claimed', 'transfer_pending', 'revoked', 'expired')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, source_provider, source_ticket_reference_hash)
);

create index if not exists event_accesses_holder_idx
  on event_accesses(holder_user_id, event_id)
  where status = 'claimed';

create table if not exists event_access_transfers (
  id uuid primary key default gen_random_uuid(),
  event_access_id uuid not null references event_accesses(id) on delete cascade,
  sender_user_id uuid not null references app_users(id),
  transfer_token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  claimed_by_user_id uuid references app_users(id),
  claimed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status <> 'claimed') or (claimed_by_user_id is not null and claimed_at is not null))
);

create index if not exists event_access_transfers_pending_idx
  on event_access_transfers(event_access_id, expires_at)
  where status = 'pending';

comment on table event_accesses is 'One transferable Jaleo social access per provider ticket, never a payment or venue-entry record.';
comment on table event_access_transfers is 'Single-use, time-limited Jaleo access transfers. Only token hashes are stored.';
