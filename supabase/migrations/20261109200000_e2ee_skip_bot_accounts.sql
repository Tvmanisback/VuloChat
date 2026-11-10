-- Returns only the people from a list of user ids, leaving out bot accounts.
-- Bots are added to servers as members, but they have no E2EE device and read messages through the bot API.
create or replace function public.e2ee_human_ids(ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from unnest(ids) as u(id)
  where not exists (select 1 from public.bots b where b.profile_id = u.id);
$$;

revoke execute on function public.e2ee_human_ids(uuid[]) from public, anon;
grant execute on function public.e2ee_human_ids(uuid[]) to authenticated;
