-- E2EE device public-key directory.
-- Private keys are never stored in Supabase; they remain in each browser's IndexedDB.
create table if not exists public.e2ee_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'Browser',
  public_key text not null,
  algorithm text not null default 'P-256-HKDF-SHA256-AES-256-GCM',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint e2ee_devices_public_key_nonempty check (length(public_key) between 40 and 256)
);

create index if not exists e2ee_devices_user_active_idx
  on public.e2ee_devices(user_id) where revoked_at is null;

alter table public.e2ee_devices enable row level security;

create policy "Users can view active device public keys"
  on public.e2ee_devices for select
  to authenticated
  using (revoked_at is null);

create policy "Users can register their own devices"
  on public.e2ee_devices for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own devices"
  on public.e2ee_devices for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.e2ee_devices to authenticated;
