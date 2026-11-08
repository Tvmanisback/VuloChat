-- Badge icon assets, Owner badge, and per-profile chat badge visibility.
alter table public.badges add column if not exists icon_path text not null default '';
alter table public.profiles add column if not exists visible_badge_ids uuid[] not null default '{}'::uuid[];

insert into public.badges (id, name, description, emoji, icon_path, color, position) values
  ('b0000000-0000-4000-8000-000000000001', 'Early member', 'Joined during the first weeks of VuloChat.', '🌱', 'badges/early-member.svg', '#23a55a', 0),
  ('b0000000-0000-4000-8000-000000000002', 'Server builder', 'Set up a server with its own channels.', '🛠️', 'badges/server-builder.svg', '#f0b232', 1),
  ('b0000000-0000-4000-8000-000000000003', 'Beta tester', 'Helped test VuloChat before release.', '🧪', 'badges/beta-tester.svg', '#00a8fc', 2),
  ('b0000000-0000-4000-8000-000000000004', 'Community helper', 'Helps others find their way around.', '🤝', 'badges/community-helper.svg', '#eb459e', 3),
  ('b0000000-0000-4000-8000-000000000005', 'Owner', 'Owns and maintains VuloChat.', '👑', 'badges/owner.svg', '#f0b232', 4)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  emoji = excluded.emoji,
  icon_path = excluded.icon_path,
  color = excluded.color,
  position = excluded.position;

-- Grant the Owner badge to the repository owner's VuloChat account.
insert into public.profile_badges (profile_id, badge_id)
select id, 'b0000000-0000-4000-8000-000000000005'
from public.profiles
where username = 'tvman'
on conflict (profile_id, badge_id) do nothing;
