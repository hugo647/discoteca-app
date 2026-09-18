-- Registration fields for databases that already applied 001.
-- New installations get these columns from 001 directly.

alter table app_users add column if not exists username text;
alter table app_users add column if not exists password_hash text;

create unique index if not exists app_users_username_idx
  on app_users(username)
  where deleted_at is null and username is not null;

comment on column app_users.username is 'Lowercase public login identifier; never an email by default.';
comment on column app_users.password_hash is 'scrypt password hash with per-user salt; never store plaintext passwords.';
