import type { CSSProperties } from 'react';
import type { Profile } from './types';

const FONT_FAMILIES: Record<NonNullable<Profile['name_font']>, string> = {
  default: 'inherit',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SFMono-Regular", Consolas, monospace',
  rounded: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif',
  display: '"Impact", "Arial Black", sans-serif',
};

export function profileNameStyle(profile: Profile | null | undefined): CSSProperties {
  if (!profile) return {};
  const primary = profile.name_color || '#ffffff';
  const secondary = profile.name_color_secondary || '#8b5cf6';
  const style: CSSProperties = {
    fontFamily: FONT_FAMILIES[profile.name_font || 'default'],
    color: primary,
  };
  switch (profile.name_effect || 'none') {
    case 'gradient':
      style.backgroundImage = `linear-gradient(100deg, ${primary}, ${secondary})`;
      style.backgroundClip = 'text';
      style.WebkitBackgroundClip = 'text';
      style.WebkitTextFillColor = 'transparent';
      break;
    case 'neon':
      style.color = primary;
      style.textShadow = `0 0 4px ${primary}, 0 0 10px ${primary}, 0 0 20px ${secondary}`;
      break;
    case 'glow':
      style.color = primary;
      style.textShadow = `0 0 7px ${primary}, 0 0 16px ${secondary}`;
      break;
    case 'outline':
      style.color = primary;
      style.WebkitTextStroke = `1px ${secondary}`;
      break;
  }
  return style;
}
