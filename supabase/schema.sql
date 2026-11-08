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
  -- Anti-raid: when many people join the same server within a minute, new joins pause.
  if (select count(*) from public.server_members
      where server_id = inv.server_id and joined_at > now() - interval '1 minute') >= 10 then
    raise exception 'many people are joining this server right now. Try again in a minute';
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
  icon_path text not null default '',
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

insert into public.badges (id, name, description, emoji, icon_path, color, position) values
  ('b0000000-0000-4000-8000-000000000001', 'Early member', 'Joined during the first weeks of VuloChat.', '🌱', 'badges/early-member.svg', '#23a55a', 0),
  ('b0000000-0000-4000-8000-000000000002', 'Server builder', 'Set up a server with its own channels.', '🛠️', 'badges/server-builder.svg', '#f0b232', 1),
  ('b0000000-0000-4000-8000-000000000003', 'Beta tester', 'Helped test VuloChat before release.', '🧪', 'badges/beta-tester.svg', '#00a8fc', 2),
  ('b0000000-0000-4000-8000-000000000004', 'Community helper', 'Helps others find their way around.', '🤝', 'badges/community-helper.svg', '#eb459e', 3),
  ('b0000000-0000-4000-8000-000000000005', 'Owner', 'Owns and maintains VuloChat.', '👑', 'badges/owner.svg', '#f0b232', 4)
on conflict (id) do update set icon_path = excluded.icon_path;

insert into public.profile_badges (profile_id, badge_id)
select id, 'b0000000-0000-4000-8000-000000000005'
from public.profiles
where username = 'tvman'
on conflict (profile_id, badge_id) do nothing;

alter table public.profiles add column visible_badge_ids uuid[] not null default '{}'::uuid[];

-- ===== Profile accent color, custom server emojis, and 20 more decorations (added after v1.0.0) =====

-- Banner color for profiles with no banner image. Hex only. Null means the default gradient.
alter table public.profiles
  add column accent_color text check (accent_color ~ '^#[0-9a-fA-F]{6}$');

-- Custom emojis. A server can have up to 50. Its members can use them. Only members with
-- MANAGE_SERVER (512) can add or delete them.
create table public.server_emojis (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  asset_url text not null,
  animated boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);

create or replace function public.server_emoji_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.server_emojis where server_id = new.server_id) >= 50 then
    raise exception 'a server can have up to 50 emojis';
  end if;
  return new;
end;
$$;

create trigger server_emoji_limit
  before insert on public.server_emojis
  for each row execute function public.server_emoji_limit();

alter table public.server_emojis enable row level security;

create policy server_emojis_select on public.server_emojis for select to authenticated
  using (public.is_server_member(server_id));
create policy server_emojis_insert on public.server_emojis for insert to authenticated
  with check (created_by = auth.uid() and public.has_server_permission(server_id, 512));
create policy server_emojis_delete on public.server_emojis for delete to authenticated
  using (public.has_server_permission(server_id, 512));

alter publication supabase_realtime add table public.server_emojis;

-- Emoji images: public like avatars, 512 KB each. Files live under <server_id>/ so the
-- policies can check the server. Uploads and deletes need MANAGE_SERVER.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emojis', 'emojis', true, 10485760, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy emojis_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'emojis');
create policy emojis_upload on storage.objects for insert to authenticated
  with check (
    case when bucket_id = 'emojis'
      then public.has_server_permission(((storage.foldername(name))[1])::uuid, 512)
      else false
    end
  );
create policy emojis_delete on storage.objects for delete to authenticated
  using (
    case when bucket_id = 'emojis'
      then public.has_server_permission(((storage.foldername(name))[1])::uuid, 512)
      else false
    end
  );

-- Custom stickers. Same rules as server emojis: up to 50 per server, 10 MB each, managed with
-- MANAGE_SERVER (512). Members can use them in messages.
create table public.server_stickers (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  asset_url text not null,
  animated boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);

create or replace function public.server_sticker_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.server_stickers where server_id = new.server_id) >= 50 then
    raise exception 'a server can have up to 50 stickers';
  end if;
  return new;
end;
$$;

create trigger server_sticker_limit
  before insert on public.server_stickers
  for each row execute function public.server_sticker_limit();

alter table public.server_stickers enable row level security;

create policy server_stickers_select on public.server_stickers for select to authenticated
  using (public.is_server_member(server_id));
create policy server_stickers_insert on public.server_stickers for insert to authenticated
  with check (created_by = auth.uid() and public.has_server_permission(server_id, 512));
create policy server_stickers_delete on public.server_stickers for delete to authenticated
  using (public.has_server_permission(server_id, 512));

alter publication supabase_realtime add table public.server_stickers;

-- Sticker images: public like emojis, 10 MB each. Files live under <server_id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', true, 10485760, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy stickers_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'stickers');
create policy stickers_upload on storage.objects for insert to authenticated
  with check (
    case when bucket_id = 'stickers'
      then public.has_server_permission(((storage.foldername(name))[1])::uuid, 512)
      else false
    end
  );
create policy stickers_delete on storage.objects for delete to authenticated
  using (
    case when bucket_id = 'stickers'
      then public.has_server_permission(((storage.foldername(name))[1])::uuid, 512)
      else false
    end
  );

-- Twenty more built-in decoration frames, numbered 6 to 25 in public/decorations/.
insert into public.avatar_decorations (id, name, asset_path, animated, position) values
  ('d0000000-0000-4000-8000-000000000006', 'Halo', 'decorations/halo.svg', false, 5),
  ('d0000000-0000-4000-8000-000000000007', 'Pulse', 'decorations/pulse.svg', true, 6),
  ('d0000000-0000-4000-8000-000000000008', 'Orbit trio', 'decorations/orbit-trio.svg', true, 7),
  ('d0000000-0000-4000-8000-000000000009', 'Snowfall', 'decorations/snowfall.svg', true, 8),
  ('d0000000-0000-4000-8000-000000000010', 'Leaf wreath', 'decorations/leaf-wreath.svg', false, 9),
  ('d0000000-0000-4000-8000-000000000011', 'Ember', 'decorations/ember.svg', true, 10),
  ('d0000000-0000-4000-8000-000000000012', 'Heart ring', 'decorations/heart-ring.svg', false, 11),
  ('d0000000-0000-4000-8000-000000000013', 'Pixel border', 'decorations/pixel-border.svg', false, 12),
  ('d0000000-0000-4000-8000-000000000014', 'Neon cycle', 'decorations/neon-cycle.svg', true, 13),
  ('d0000000-0000-4000-8000-000000000015', 'Prism spin', 'decorations/prism-spin.svg', true, 14),
  ('d0000000-0000-4000-8000-000000000016', 'Bubbles', 'decorations/bubbles.svg', true, 15),
  ('d0000000-0000-4000-8000-000000000017', 'Laurel', 'decorations/laurel.svg', false, 16),
  ('d0000000-0000-4000-8000-000000000018', 'Sakura', 'decorations/sakura.svg', false, 17),
  ('d0000000-0000-4000-8000-000000000019', 'Electric', 'decorations/electric.svg', true, 18),
  ('d0000000-0000-4000-8000-000000000020', 'Rainbow ring', 'decorations/rainbow-ring.svg', false, 19),
  ('d0000000-0000-4000-8000-000000000021', 'Glitch', 'decorations/glitch.svg', true, 20),
  ('d0000000-0000-4000-8000-000000000022', 'Dotted ring', 'decorations/dotted-ring.svg', false, 21),
  ('d0000000-0000-4000-8000-000000000023', 'Star crown', 'decorations/star-crown.svg', false, 22),
  ('d0000000-0000-4000-8000-000000000024', 'Ocean wave', 'decorations/wave-ring.svg', true, 23),
  ('d0000000-0000-4000-8000-000000000025', 'Clover', 'decorations/clover.svg', false, 24)
on conflict (id) do nothing;

-- ===== Saved GIFs (added after v1.0.0) =====
-- Favorites per account. Each person sees and manages only their own, up to 200.

create table public.gif_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  gif_id text not null check (char_length(gif_id) between 1 and 64),
  title text not null default 'GIF' check (char_length(title) <= 200),
  preview_url text not null check (preview_url ~ '^https://'),
  full_url text not null check (full_url ~ '^https://'),
  created_at timestamptz not null default now(),
  primary key (user_id, gif_id)
);

create index gif_favorites_recent_idx on public.gif_favorites(user_id, created_at desc);

create or replace function public.gif_favorite_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.gif_favorites where user_id = new.user_id) >= 200 then
    raise exception 'you can save up to 200 favorite GIFs';
  end if;
  return new;
end;
$$;

create trigger gif_favorite_limit
  before insert on public.gif_favorites
  for each row execute function public.gif_favorite_limit();

alter table public.gif_favorites enable row level security;

create policy gif_favorites_select on public.gif_favorites for select to authenticated
  using (user_id = auth.uid());
create policy gif_favorites_insert on public.gif_favorites for insert to authenticated
  with check (user_id = auth.uid());
create policy gif_favorites_delete on public.gif_favorites for delete to authenticated
  using (user_id = auth.uid());

-- ===== Anti-raid, word filter, and forwarding (added after v1.0.0) =====

-- Anti-raid: a person can send at most 8 messages in any 10 seconds.
create or replace function public.messages_rate_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.messages
      where author_id = new.author_id and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'you are sending messages too fast. Wait a few seconds and try again';
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.messages_rate_limit();

-- Blocked words for messages and DMs. Terms are lowercase words or phrases and match whole
-- words only. The project owner manages this list. App users cannot read it.
create table public.blocked_terms (
  term text primary key check (term ~ '^[a-z0-9]+( [a-z0-9]+)*$' and char_length(term) between 2 and 64),
  created_at timestamptz not null default now()
);
alter table public.blocked_terms enable row level security;
-- No policies: app users cannot read or change the list. Only the trigger below reads it.
revoke all on public.blocked_terms from anon, authenticated;

create or replace function public.check_blocked_terms()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  words text := ' ' || trim(regexp_replace(lower(coalesce(new.content, '')), '[^a-z0-9]+', ' ', 'g')) || ' ';
begin
  if exists (select 1 from public.blocked_terms t where position(' ' || t.term || ' ' in words) > 0) then
    raise exception 'that message contains a blocked word';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_blocked_terms() from public, anon, authenticated;

create trigger messages_blocked_terms
  before insert or update of content on public.messages
  for each row execute function public.check_blocked_terms();

create trigger direct_messages_blocked_terms
  before insert or update of content on public.direct_messages
  for each row execute function public.check_blocked_terms();

-- A forwarded message is a copy. This points back to the original so the app can label it.
alter table public.messages
  add column forward_of uuid references public.messages(id) on delete set null;

-- ===== Nameplates, badge unlocks, end dates, and voice-reactive decorations (added after v1.0.0) =====

alter table public.avatar_decorations
  add column required_badge_id uuid references public.badges(id) on delete set null,
  add column available_until timestamptz,
  add column reacts_to_voice boolean not null default false;

create table public.nameplates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  asset_path text not null check (asset_path ~ '^nameplates/[a-z0-9-]+\.(svg|png|webp|gif)$'),
  animated boolean not null default false,
  required_badge_id uuid references public.badges(id) on delete set null,
  available_until timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.nameplates enable row level security;

-- Signed-in users can browse nameplates. There are no insert, update or delete policies,
-- so only the project owner can add or change them.
create policy nameplates_select on public.nameplates
  for select to authenticated using (true);

alter table public.profiles
  add column nameplate_id uuid references public.nameplates(id) on delete set null;
create index profiles_nameplate_idx on public.profiles(nameplate_id);

-- A profile can only equip what it is allowed to use: the item must not have expired, and the
-- profile must hold the required badge. This runs when the item changes, so an item stays equipped
-- if its badge is removed later.
create or replace function public.check_profile_cosmetics()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item_badge uuid;
  item_until timestamptz;
begin
  if new.decoration_id is not null and new.decoration_id is distinct from old.decoration_id then
    select required_badge_id, available_until into item_badge, item_until
      from public.avatar_decorations where id = new.decoration_id;
    if item_until is not null and item_until < now() then
      raise exception 'That decoration is no longer available.';
    end if;
    if item_badge is not null and not exists (
      select 1 from public.profile_badges where profile_id = new.id and badge_id = item_badge
    ) then
      raise exception 'You need a badge to use that decoration.';
    end if;
  end if;

  if new.nameplate_id is not null and new.nameplate_id is distinct from old.nameplate_id then
    select required_badge_id, available_until into item_badge, item_until
      from public.nameplates where id = new.nameplate_id;
    if item_until is not null and item_until < now() then
      raise exception 'That nameplate is no longer available.';
    end if;
    if item_badge is not null and not exists (
      select 1 from public.profile_badges where profile_id = new.id and badge_id = item_badge
    ) then
      raise exception 'You need a badge to use that nameplate.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_check_cosmetics on public.profiles;
create trigger profiles_check_cosmetics
  before update of decoration_id, nameplate_id on public.profiles
  for each row execute function public.check_profile_cosmetics();

-- Beta tester: a profile decoration and a nameplate, both unlocked by the Beta tester badge.
insert into public.avatar_decorations (id, name, asset_path, animated, required_badge_id, position) values
  ('d0000000-0000-4000-8000-000000000101', 'Beta tester', 'decorations/beta-tester.svg', false, 'b0000000-0000-4000-8000-000000000003', 30)
on conflict (id) do nothing;

-- Soundwave pulses while its owner is speaking in a voice channel.
insert into public.avatar_decorations (id, name, asset_path, animated, reacts_to_voice, position) values
  ('d0000000-0000-4000-8000-000000000102', 'Soundwave', 'decorations/soundwave.svg', false, true, 31)
on conflict (id) do nothing;

insert into public.nameplates (id, name, asset_path, animated, required_badge_id, position) values
  ('a0000000-0000-4000-8000-000000000001', 'Harvest Gold', 'nameplates/harvest-gold.svg', false, null, 0),
  ('a0000000-0000-4000-8000-000000000002', 'Maple Leaves', 'nameplates/maple-leaves.svg', false, null, 1),
  ('a0000000-0000-4000-8000-000000000003', 'Acorn Trail', 'nameplates/acorn-trail.svg', false, null, 2),
  ('a0000000-0000-4000-8000-000000000004', 'Cornucopia', 'nameplates/cornucopia.svg', false, null, 3),
  ('a0000000-0000-4000-8000-000000000005', 'Pecan Pie', 'nameplates/pecan-pie.svg', false, null, 4),
  ('a0000000-0000-4000-8000-000000000006', 'Cranberry', 'nameplates/cranberry.svg', false, null, 5),
  ('a0000000-0000-4000-8000-000000000007', 'Turkey Feathers', 'nameplates/turkey-feathers.svg', false, null, 6),
  ('a0000000-0000-4000-8000-000000000008', 'Corn Husk', 'nameplates/corn-husk.svg', false, null, 7),
  ('a0000000-0000-4000-8000-000000000009', 'Autumn Plaid', 'nameplates/autumn-plaid.svg', false, null, 8),
  ('a0000000-0000-4000-8000-000000000010', 'Cozy Knit', 'nameplates/cozy-knit.svg', false, null, 9),
  ('a0000000-0000-4000-8000-000000000011', 'Hot Cocoa', 'nameplates/hot-cocoa.svg', false, null, 10),
  ('a0000000-0000-4000-8000-000000000012', 'Pilgrim Buckle', 'nameplates/pilgrim-buckle.svg', false, null, 11),
  ('a0000000-0000-4000-8000-000000000013', 'Parade Balloons', 'nameplates/parade-balloons.svg', false, null, 12),
  ('a0000000-0000-4000-8000-000000000014', 'Oak Branch', 'nameplates/oak-branch.svg', false, null, 13),
  ('a0000000-0000-4000-8000-000000000015', 'Harvest Moon', 'nameplates/harvest-moon.svg', false, null, 14),
  ('a0000000-0000-4000-8000-000000000016', 'Campfire', 'nameplates/campfire.svg', false, null, 15),
  ('a0000000-0000-4000-8000-000000000017', 'Gingham', 'nameplates/gingham.svg', false, null, 16),
  ('a0000000-0000-4000-8000-000000000018', 'Bare Branches', 'nameplates/bare-branches.svg', false, null, 17),
  ('a0000000-0000-4000-8000-000000000019', 'Grateful Hearts', 'nameplates/grateful-hearts.svg', false, null, 18),
  ('a0000000-0000-4000-8000-000000000020', 'Giving Tree', 'nameplates/giving-tree.svg', false, null, 19),
  ('a0000000-0000-4000-8000-000000000021', 'Beta tester', 'nameplates/beta-tester.svg', false, 'b0000000-0000-4000-8000-000000000003', 100)
on conflict (id) do nothing;

-- Role decorations and accent tint.
-- A role can carry an avatar decoration that members of that server see in the member list.
alter table public.server_roles add column if not exists decoration_id uuid references public.avatar_decorations(id) on delete set null;
-- Tintable decorations are drawn in the owner's accent colour.
alter table public.avatar_decorations add column if not exists tintable boolean not null default false;
update public.avatar_decorations set tintable = true where id in (
  'd0000000-0000-4000-8000-000000000001', -- Violet ring
  'd0000000-0000-4000-8000-000000000002', -- Twin ring
  'd0000000-0000-4000-8000-000000000006', -- Halo
  'd0000000-0000-4000-8000-000000000012', -- Heart ring
  'd0000000-0000-4000-8000-000000000013'  -- Pixel border
);

-- Profile card decorations: artwork drawn across the banner of a profile card.
create table if not exists public.profile_decorations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  asset_path text not null check (asset_path ~ '^profile-decorations/[a-z0-9-]+\.(svg|png|webp|gif)$'),
  animated boolean not null default false,
  required_badge_id uuid references public.badges(id) on delete set null,
  available_until timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profile_decorations enable row level security;

-- Signed-in users can browse profile decorations. There are no insert, update or delete policies,
-- so only the project owner can add or change them.
create policy profile_decorations_select on public.profile_decorations
  for select to authenticated using (true);

alter table public.profiles
  add column if not exists profile_decoration_id uuid references public.profile_decorations(id) on delete set null;
create index if not exists profiles_profile_decoration_idx on public.profiles(profile_decoration_id);

-- Same rules as the other cosmetics: the item must not have ended, and the profile must hold the
-- required badge. This runs when the item changes, so an item stays equipped if its badge is removed later.
create or replace function public.check_profile_cosmetics()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item_badge uuid;
  item_until timestamptz;
begin
  if new.decoration_id is not null and new.decoration_id is distinct from old.decoration_id then
    select required_badge_id, available_until into item_badge, item_until
      from public.avatar_decorations where id = new.decoration_id;
    if item_until is not null and item_until < now() then
      raise exception 'That decoration is no longer available.';
    end if;
    if item_badge is not null and not exists (
      select 1 from public.profile_badges where profile_id = new.id and badge_id = item_badge
    ) then
      raise exception 'You need a badge to use that decoration.';
    end if;
  end if;

  if new.nameplate_id is not null and new.nameplate_id is distinct from old.nameplate_id then
    select required_badge_id, available_until into item_badge, item_until
      from public.nameplates where id = new.nameplate_id;
    if item_until is not null and item_until < now() then
      raise exception 'That nameplate is no longer available.';
    end if;
    if item_badge is not null and not exists (
      select 1 from public.profile_badges where profile_id = new.id and badge_id = item_badge
    ) then
      raise exception 'You need a badge to use that nameplate.';
    end if;
  end if;

  if new.profile_decoration_id is not null and new.profile_decoration_id is distinct from old.profile_decoration_id then
    select required_badge_id, available_until into item_badge, item_until
      from public.profile_decorations where id = new.profile_decoration_id;
    if item_until is not null and item_until < now() then
      raise exception 'That profile decoration is no longer available.';
    end if;
    if item_badge is not null and not exists (
      select 1 from public.profile_badges where profile_id = new.id and badge_id = item_badge
    ) then
      raise exception 'You need a badge to use that profile decoration.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_check_cosmetics on public.profiles;
create trigger profiles_check_cosmetics
  before update of decoration_id, nameplate_id, profile_decoration_id on public.profiles
  for each row execute function public.check_profile_cosmetics();

insert into public.profile_decorations (id, name, asset_path, animated, required_badge_id, position) values
  ('e0000000-0000-4000-8000-000000000001', 'Starfield', 'profile-decorations/starfield.svg', false, null, 0),
  ('e0000000-0000-4000-8000-000000000002', 'Bokeh', 'profile-decorations/bokeh.svg', false, null, 1),
  ('e0000000-0000-4000-8000-000000000003', 'Sakura drift', 'profile-decorations/sakura-drift.svg', false, null, 2),
  ('e0000000-0000-4000-8000-000000000004', 'Aurora veil', 'profile-decorations/aurora-veil.svg', true, null, 3),
  ('e0000000-0000-4000-8000-000000000005', 'Ember glow', 'profile-decorations/ember-glow.svg', false, null, 4),
  ('e0000000-0000-4000-8000-000000000006', 'Circuit', 'profile-decorations/circuit.svg', false, null, 5),
  ('e0000000-0000-4000-8000-000000000007', 'Confetti', 'profile-decorations/confetti.svg', false, null, 6),
  ('e0000000-0000-4000-8000-000000000008', 'Crescent night', 'profile-decorations/crescent-night.svg', false, null, 7),
  ('e0000000-0000-4000-8000-000000000009', 'Beta tester', 'profile-decorations/beta-tester.svg', false, 'b0000000-0000-4000-8000-000000000003', 30)
on conflict (id) do nothing;

-- Reports: messages, direct messages and profiles flagged for review. The project owner reads this table.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('message', 'direct_message', 'profile')),
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  server_id uuid references public.servers(id) on delete set null,
  reason text not null check (reason in ('harassment', 'hate', 'threat', 'sexual', 'spam', 'illegal', 'other')),
  details text check (char_length(details) <= 500),
  content_snapshot text check (char_length(content_snapshot) <= 2000),
  created_at timestamptz not null default now(),
  -- One report per person per item, so repeat clicks do not flood the table.
  unique (reporter_id, target_type, target_id)
);

create index if not exists reports_created_idx on public.reports(created_at desc);

alter table public.reports enable row level security;

-- Anyone signed in can file a report as themselves, and can see the reports they filed.
-- Nobody can edit or delete reports through the app.
create policy reports_insert on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = auth.uid());
