alter table public.profiles
  add column if not exists name_font text not null default 'default'
    check (name_font in ('default','serif','mono','rounded','display')),
  add column if not exists name_effect text not null default 'none'
    check (name_effect in ('none','gradient','neon','glow','outline')),
  add column if not exists name_color text not null default '#ffffff'
    check (name_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists name_color_secondary text not null default '#8b5cf6'
    check (name_color_secondary ~ '^#[0-9a-fA-F]{6}$');
