-- Premade bots become VuloChat's own bots, run on the server:
--  * No owner: nobody can see their token, reset it or delete them.
--  * Always online: the premade-bots edge function runs them (message and member triggers, plus a once-a-minute job).
--  * Decryptor: each premade bot has an E2EE device, so the server can read encrypted messages for it.

-- 1. Platform bots have no owner.
alter table public.bots alter column owner_id drop not null;

-- 2. Anyone signed in can see the platform bots, so they can be added to a server.
create policy "bots platform bots are listed" on public.bots for select using (owner_id is null);

-- 3. Server-only storage. No client role can read these tables.
create schema if not exists premade_private;

create table if not exists premade_private.config (
  key text primary key,
  value text not null
);

create table if not exists premade_private.bot_keys (
  bot_id uuid primary key references public.bots(id) on delete cascade,
  public_key text not null,
  private_key text not null
);

create table if not exists premade_private.announce_state (
  server_id uuid not null,
  bot_id uuid not null references public.bots(id) on delete cascade,
  last_posted_at timestamptz not null default now(),
  primary key (server_id, bot_id)
);

alter table premade_private.config enable row level security;
alter table premade_private.bot_keys enable row level security;
alter table premade_private.announce_state enable row level security;
revoke all on schema premade_private from public, anon, authenticated;
revoke all on all tables in schema premade_private from public, anon, authenticated;

-- The shared secret is made inside the database, so it never appears in this file.
insert into premade_private.config (key, value) values
  ('function_url', 'https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/premade-bots'),
  ('secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- 4. Functions the premade-bots edge function uses (service role only).
create or replace function public.premade_internal_secret()
returns text language sql stable security definer set search_path = public, premade_private
as $$ select value from premade_private.config where key = 'secret' $$;

create or replace function public.premade_bot_keys(p_bot uuid)
returns jsonb language sql stable security definer set search_path = public, premade_private
as $$ select jsonb_build_object('public_key', public_key, 'private_key', private_key) from premade_private.bot_keys where bot_id = p_bot $$;

create or replace function public.premade_store_bot_keys(p_bot uuid, p_public text, p_private text)
returns void language sql security definer set search_path = public, premade_private
as $$
  insert into premade_private.bot_keys (bot_id, public_key, private_key) values (p_bot, p_public, p_private)
  on conflict (bot_id) do update set public_key = excluded.public_key, private_key = excluded.private_key
$$;

-- True once per interval: the first call only starts the clock, so the Announcer waits one interval before its first post.
create or replace function public.premade_announce_due(p_server uuid, p_bot uuid, p_interval_minutes int)
returns boolean language plpgsql security definer set search_path = public, premade_private
as $$
declare
  n int;
begin
  insert into premade_private.announce_state (server_id, bot_id) values (p_server, p_bot) on conflict do nothing;
  update premade_private.announce_state
     set last_posted_at = now()
   where server_id = p_server and bot_id = p_bot
     and last_posted_at <= now() - make_interval(mins => p_interval_minutes);
  get diagnostics n = row_count;
  return n > 0;
end
$$;

revoke execute on function public.premade_internal_secret() from public, anon, authenticated;
revoke execute on function public.premade_bot_keys(uuid) from public, anon, authenticated;
revoke execute on function public.premade_store_bot_keys(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.premade_announce_due(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.premade_internal_secret() to service_role;
grant execute on function public.premade_bot_keys(uuid) to service_role;
grant execute on function public.premade_store_bot_keys(uuid, text, text) to service_role;
grant execute on function public.premade_announce_due(uuid, uuid, int) to service_role;

-- 5. Calls the premade-bots function in the background.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function premade_private.call_runner(payload jsonb)
returns void language plpgsql security definer set search_path = premade_private, public
as $$
begin
  perform net.http_post(
    url := (select value from premade_private.config where key = 'function_url'),
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-premade-secret', (select value from premade_private.config where key = 'secret')
    ),
    timeout_milliseconds := 10000
  );
end
$$;

-- A new message in a server with an Auto-responder (messages from bots are ignored, so bots never answer themselves).
create or replace function premade_private.on_message_insert()
returns trigger language plpgsql security definer set search_path = public, premade_private
as $$
begin
  if exists (
       select 1
       from public.server_bots sb
       join public.bots b on b.id = sb.bot_id
       join public.channels c on c.server_id = sb.server_id
       where c.id = new.channel_id and sb.enabled and b.template_id = 'auto-responder'
     )
     and not exists (select 1 from public.bots b where b.profile_id = new.author_id)
  then
    perform premade_private.call_runner(jsonb_build_object('type', 'message', 'message_id', new.id));
  end if;
  return new;
end
$$;

drop trigger if exists premade_on_message on public.messages;
create trigger premade_on_message
  after insert on public.messages
  for each row execute function premade_private.on_message_insert();

-- A person joins a server with a Welcomer.
create or replace function premade_private.on_member_insert()
returns trigger language plpgsql security definer set search_path = public, premade_private
as $$
begin
  if exists (
       select 1
       from public.server_bots sb
       join public.bots b on b.id = sb.bot_id
       where sb.server_id = new.server_id and sb.enabled and b.template_id = 'welcomer'
     )
     and not exists (select 1 from public.bots b where b.profile_id = new.user_id)
  then
    perform premade_private.call_runner(jsonb_build_object('type', 'member', 'server_id', new.server_id, 'user_id', new.user_id));
  end if;
  return new;
end
$$;

drop trigger if exists premade_on_member on public.server_members;
create trigger premade_on_member
  after insert on public.server_members
  for each row execute function premade_private.on_member_insert();

-- Once a minute: the Announcer checks whether its interval has passed.
do $$ begin perform cron.unschedule('premade-announcer'); exception when others then null; end $$;
select cron.schedule('premade-announcer', '* * * * *', $cron$ select premade_private.call_runner('{"type":"tick"}'::jsonb) $cron$);

-- 6. Bot devices count as E2EE recipients. Bots without a device (custom bots) are still left out.
create or replace function public.e2ee_human_ids(ids uuid[])
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select u.id
  from unnest(ids) as u(id)
  where not exists (select 1 from public.bots b where b.profile_id = u.id)
     or exists (select 1 from public.e2ee_devices d where d.user_id = u.id and d.revoked_at is null);
$$;
revoke execute on function public.e2ee_human_ids(uuid[]) from public, anon;
grant execute on function public.e2ee_human_ids(uuid[]) to authenticated;
