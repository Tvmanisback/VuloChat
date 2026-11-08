-- ============================================================================
-- VuloChat v1.0.0 database schema
--
-- Run once in a new Supabase project (SQL Editor, or `supabase db push`).
-- This file matches the live database used by the apps.
--
-- Permission bits (server_roles.permissions, bigint). Mirrored in src/lib/permissions.ts:
--   1    VIEW_CHANNEL        2     SEND_MESSAGES      4     MANAGE_CHANNELS
--   8    MANAGE_ROLES        16    MANAGE_MESSAGES    32    KICK_MEMBERS
--   64   CONNECT_VOICE       128   SPEAK              256   ADMINISTRATOR
--   512  MANAGE_SERVER       1024  CREATE_INVITE
-- ============================================================================

create extension if not exists pgcrypto;

-- ===== Enums =====

create type public.user_status as enum ('online', 'idle', 'dnd', 'offline');
create type public.channel_type as enum ('category', 'text', 'voice');
create type public.friend_status as enum ('pending', 'accepted');

-- ===== Tables =====

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{2,32}$'),
  display_name text check (char_length(display_name) <= 32),
  avatar_url text,
  about text check (char_length(about) <= 190),
  status public.user_status not null default 'offline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  icon_url text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.server_roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  color text not null default '#99aab5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  permissions bigint not null default 0,
  position int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index server_roles_one_default on public.server_roles(server_id) where is_default;

create table public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text check (char_length(nickname) <= 32),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table public.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.server_roles(id) on delete cascade,
  primary key (server_id, user_id, role_id),
  foreign key (server_id, user_id) references public.server_members(server_id, user_id) on delete cascade
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  parent_id uuid references public.channels(id) on delete set null,
  type public.channel_type not null,
  name text not null check (char_length(name) between 1 and 100),
  topic text check (char_length(topic) <= 1024),
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (parent_id is null or type <> 'category')
);
create index channels_server_idx on public.channels(server_id, position);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 4000),
  attachments jsonb not null default '[]'::jsonb,
  embeds jsonb not null default '[]'::jsonb,
  reply_to uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  check (char_length(content) > 0 or jsonb_array_length(attachments) > 0)
);
create index messages_channel_created_idx on public.messages(channel_id, created_at desc);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 4000),
  attachments jsonb not null default '[]'::jsonb,
  embeds jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  read_at timestamptz,
  check (sender_id <> recipient_id),
  check (char_length(content) > 0 or jsonb_array_length(attachments) > 0)
);
create index dm_sender_idx on public.direct_messages(sender_id, recipient_id, created_at desc);
create index dm_recipient_idx on public.direct_messages(recipient_id, sender_id, created_at desc);

create table public.friends (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friend_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.invites (
  code text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  server_id uuid not null references public.servers(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.voice_states (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  server_id uuid not null references public.servers(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  self_mute boolean not null default false,
  self_deafen boolean not null default false,
  joined_at timestamptz not null default now()
);

-- ===== Helper functions used by RLS policies =====

create or replace function public.is_server_member(p_server uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server and user_id = auth.uid()
  );
$$;

create or replace function public.channel_server_id(p_channel uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select server_id from public.channels where id = p_channel;
$$;

create or replace function public.has_server_permission(p_server uuid, p_perm bigint)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v bigint := 0;
begin
  if auth.uid() is null or not public.is_server_member(p_server) then
    return false;
  end if;
  if exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    return true;
  end if;
  select coalesce(bit_or(r.permissions), 0) into v
  from public.server_roles r
  where r.server_id = p_server
    and (
      r.is_default
      or r.id in (
        select mr.role_id from public.member_roles mr
        where mr.server_id = p_server and mr.user_id = auth.uid()
      )
    );
  if (v & 256) = 256 then
    return true;
  end if;
  return (v & p_perm) = p_perm;
end;
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friends
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

-- ===== Triggers =====

-- Creates a profile row for each new auth user. Uses the chosen username when free.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text;
begin
  uname := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  uname := regexp_replace(uname, '[^a-z0-9_.]', '', 'g');
  if char_length(uname) < 2 then
    uname := 'user';
  end if;
  uname := left(uname, 26);
  if exists (select 1 from public.profiles where username = uname) then
    uname := uname || substr(md5(new.id::text), 1, 4);
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, coalesce(new.raw_user_meta_data->>'display_name', uname));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.messages_check_channel()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.channels where id = new.channel_id and type = 'text') then
    raise exception 'messages can only be posted in text channels';
  end if;
  return new;
end;
$$;

create trigger messages_check_channel
  before insert on public.messages
  for each row execute function public.messages_check_channel();

create or replace function public.friends_no_reverse()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.friends
    where requester_id = new.addressee_id and addressee_id = new.requester_id
  ) then
    raise exception 'a friend request already exists between these users';
  end if;
  return new;
end;
$$;

create trigger friends_no_reverse
  before insert on public.friends
  for each row execute function public.friends_no_reverse();

-- ===== RPC: create a server with default roles and channels =====

create or replace function public.create_server(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  admin_role uuid;
  cat uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.servers (name, owner_id) values (p_name, uid) returning id into sid;
  insert into public.server_members (server_id, user_id) values (sid, uid);

  -- @everyone: VIEW_CHANNEL | SEND_MESSAGES | CONNECT_VOICE | SPEAK | CREATE_INVITE = 1219
  insert into public.server_roles (server_id, name, permissions, position, is_default)
  values (sid, '@everyone', 1219, 0, true);

  insert into public.server_roles (server_id, name, color, permissions, position)
  values (sid, 'Admin', '#f0b232', 256, 1)
  returning id into admin_role;

  insert into public.member_roles (server_id, user_id, role_id) values (sid, uid, admin_role);

  insert into public.channels (server_id, type, name, position)
  values (sid, 'category', 'Text Channels', 0) returning id into cat;
  insert into public.channels (server_id, parent_id, type, name, position)
  values (sid, cat, 'text', 'general', 0);

  insert into public.channels (server_id, type, name, position)
  values (sid, 'category', 'Voice Channels', 1) returning id into cat;
  insert into public.channels (server_id, parent_id, type, name, position)
  values (sid, cat, 'voice', 'General', 0);

  return sid;
end;
$$;

-- ===== RPC: join a server with an invite code =====

create or replace function public.join_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv public.invites;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into inv from public.invites where code = p_code;
  if not found then
    raise exception 'invalid invite';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'invite has expired';
  end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then
    raise exception 'invite has been used up';
  end if;
  if exists (select 1 from public.server_members where server_id = inv.server_id and user_id = uid) then
    return inv.server_id;
  end if;
  insert into public.server_members (server_id, user_id) values (inv.server_id, uid);
  update public.invites set uses = uses + 1 where code = p_code;
  return inv.server_id;
end;
$$;

-- Function privileges: no anonymous access to anything; signed-in users may call the RPCs.
revoke execute on function public.create_server(text) from anon, public;
revoke execute on function public.join_invite(text) from anon, public;
grant execute on function public.create_server(text) to authenticated;
grant execute on function public.join_invite(text) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_server_member(uuid) from public, anon;
revoke execute on function public.channel_server_id(uuid) from public, anon;
revoke execute on function public.has_server_permission(uuid, bigint) from public, anon;
revoke execute on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.is_server_member(uuid) to authenticated;
grant execute on function public.channel_server_id(uuid) to authenticated;
grant execute on function public.has_server_permission(uuid, bigint) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- ===== Row Level Security =====

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.server_roles enable row level security;
alter table public.server_members enable row level security;
alter table public.member_roles enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.direct_messages enable row level security;
alter table public.friends enable row level security;
alter table public.invites enable row level security;
alter table public.voice_states enable row level security;

-- profiles: any signed-in user can read; users edit only their own row
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- servers
create policy servers_select on public.servers for select to authenticated
  using (public.is_server_member(id));
create policy servers_update on public.servers for update to authenticated
  using (public.has_server_permission(id, 512)) with check (public.has_server_permission(id, 512));
create policy servers_delete on public.servers for delete to authenticated
  using (owner_id = auth.uid());

-- server_roles
create policy server_roles_select on public.server_roles for select to authenticated
  using (public.is_server_member(server_id));
create policy server_roles_insert on public.server_roles for insert to authenticated
  with check (public.has_server_permission(server_id, 8) and is_default = false);
create policy server_roles_update on public.server_roles for update to authenticated
  using (public.has_server_permission(server_id, 8)) with check (public.has_server_permission(server_id, 8));
create policy server_roles_delete on public.server_roles for delete to authenticated
  using (public.has_server_permission(server_id, 8) and is_default = false);

-- server_members: read by members; leave yourself; kick needs KICK_MEMBERS; edit own nickname
create policy server_members_select on public.server_members for select to authenticated
  using (public.is_server_member(server_id));
create policy server_members_update_self on public.server_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy server_members_delete on public.server_members for delete to authenticated
  using (user_id = auth.uid() or public.has_server_permission(server_id, 32));

-- member_roles
create policy member_roles_select on public.member_roles for select to authenticated
  using (public.is_server_member(server_id));
create policy member_roles_insert on public.member_roles for insert to authenticated
  with check (public.has_server_permission(server_id, 8));
create policy member_roles_delete on public.member_roles for delete to authenticated
  using (public.has_server_permission(server_id, 8));

-- channels
create policy channels_select on public.channels for select to authenticated
  using (public.is_server_member(server_id));
create policy channels_insert on public.channels for insert to authenticated
  with check (public.has_server_permission(server_id, 4));
create policy channels_update on public.channels for update to authenticated
  using (public.has_server_permission(server_id, 4)) with check (public.has_server_permission(server_id, 4));
create policy channels_delete on public.channels for delete to authenticated
  using (public.has_server_permission(server_id, 4));

-- messages
create policy messages_select on public.messages for select to authenticated
  using (public.is_server_member(public.channel_server_id(channel_id)));
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.has_server_permission(public.channel_server_id(channel_id), 2));
create policy messages_update on public.messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated
  using (author_id = auth.uid() or public.has_server_permission(public.channel_server_id(channel_id), 16));

-- direct messages: only between accepted friends
create policy dm_select on public.direct_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy dm_insert on public.direct_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.are_friends(sender_id, recipient_id));
create policy dm_update on public.direct_messages for update to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid())
  with check (sender_id = auth.uid() or recipient_id = auth.uid());
create policy dm_delete on public.direct_messages for delete to authenticated
  using (sender_id = auth.uid());

-- friends
create policy friends_select on public.friends for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy friends_insert on public.friends for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy friends_update on public.friends for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy friends_delete on public.friends for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- invites
create policy invites_select on public.invites for select to authenticated
  using (public.is_server_member(server_id));
create policy invites_insert on public.invites for insert to authenticated
  with check (created_by = auth.uid() and public.has_server_permission(server_id, 1024));
create policy invites_delete on public.invites for delete to authenticated
  using (created_by = auth.uid() or public.has_server_permission(server_id, 512));

-- voice_states: members see who is in voice; you manage only your own row
create policy voice_states_select on public.voice_states for select to authenticated
  using (public.is_server_member(server_id));
create policy voice_states_insert on public.voice_states for insert to authenticated
  with check (user_id = auth.uid() and public.has_server_permission(server_id, 64));
create policy voice_states_update on public.voice_states for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy voice_states_delete on public.voice_states for delete to authenticated
  using (user_id = auth.uid());

-- ===== Realtime =====

alter publication supabase_realtime add table
  public.messages,
  public.direct_messages,
  public.channels,
  public.server_members,
  public.server_roles,
  public.member_roles,
  public.profiles,
  public.friends,
  public.voice_states;

-- Full row images let DELETE events be filtered by server_id or channel_id.
alter table public.messages replica identity full;
alter table public.direct_messages replica identity full;
alter table public.channels replica identity full;
alter table public.server_roles replica identity full;
alter table public.member_roles replica identity full;
alter table public.server_members replica identity full;
alter table public.voice_states replica identity full;
alter table public.friends replica identity full;
alter table public.profiles replica identity full;

-- ===== Storage: private attachments, public avatars =====

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false), ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
create policy attachments_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');
create policy avatars_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== Avatar decorations (added after v1.0.0) =====
-- Original frames users can place around their avatar. Files live in public/decorations/.

create table public.avatar_decorations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  asset_path text not null check (asset_path ~ '^decorations/[a-z0-9-]+\.(svg|png|webp|gif)$'),
  animated boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.avatar_decorations enable row level security;

-- Signed-in users can browse the catalog. There are no insert, update or delete
-- policies, so users cannot add or change decorations; only the project owner can.
create policy avatar_decorations_select on public.avatar_decorations
  for select to authenticated using (true);

alter table public.profiles
  add column decoration_id uuid references public.avatar_decorations(id) on delete set null;
create index profiles_decoration_idx on public.profiles(decoration_id);

insert into public.avatar_decorations (id, name, asset_path, animated, position) values
  ('d0000000-0000-4000-8000-000000000001', 'Violet ring', 'decorations/ring-violet.svg', false, 0),
  ('d0000000-0000-4000-8000-000000000002', 'Twin ring', 'decorations/twin-ring.svg', false, 1),
  ('d0000000-0000-4000-8000-000000000003', 'Aurora', 'decorations/aurora.svg', true, 2),
  ('d0000000-0000-4000-8000-000000000004', 'Stardust', 'decorations/stardust.svg', true, 3),
  ('d0000000-0000-4000-8000-000000000005', 'Comet', 'decorations/comet.svg', true, 4)
on conflict (id) do nothing;

-- ===== Profile banners, animated flags, custom status, and badges (added after v1.0.0) =====

alter table public.profiles
  add column banner_url text,
  add column animated_avatar boolean not null default false,
  add column animated_banner boolean not null default false,
  add column custom_status text check (char_length(custom_status) <= 128);

-- Badge catalog. Signed-in users can read it. Nobody can write it from the app.
create table public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  description text check (char_length(description) <= 160),
  emoji text not null check (char_length(emoji) between 1 and 8),
  color text not null default '#7c5cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Badges granted to profiles. Only the project owner can grant or revoke them.
create table public.profile_badges (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (profile_id, badge_id)
);
create index profile_badges_badge_idx on public.profile_badges(badge_id);

alter table public.badges enable row level security;
alter table public.profile_badges enable row level security;

create policy badges_select on public.badges for select to authenticated using (true);
create policy profile_badges_select on public.profile_badges for select to authenticated using (true);

insert into public.badges (id, name, description, emoji, color, position) values
  ('b0000000-0000-4000-8000-000000000001', 'Early member', 'Joined during the first weeks of VuloChat.', '🌱', '#23a55a', 0),
  ('b0000000-0000-4000-8000-000000000002', 'Server builder', 'Set up a server with its own channels.', '🛠️', '#f0b232', 1),
  ('b0000000-0000-4000-8000-000000000003', 'Beta tester', 'Helped test VuloChat before release.', '🧪', '#00a8fc', 2),
  ('b0000000-0000-4000-8000-000000000004', 'Community helper', 'Helps others find their way around.', '🤝', '#eb459e', 3)
on conflict (id) do nothing;
