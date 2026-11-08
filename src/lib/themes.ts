// Color themes. A theme is five chosen colors. The rest of the palette is worked out from them,
// so every theme has the same shape. settings.ts writes the result to CSS variables.

export type ThemeName = 'violet' | 'midnight' | 'forest' | 'light' | 'custom';
export type PresetName = Exclude<ThemeName, 'custom'>;

export interface ThemeColors {
  rail: string;
  side: string;
  chat: string;
  accent: string;
  text: string;
}

export type Token =
  | 'rail'
  | 'side'
  | 'chat'
  | 'input'
  | 'hover'
  | 'active'
  | 'line'
  | 'muted'
  | 'text'
  | 'bright'
  | 'accent'
  | 'accentHover';

export const CUSTOM_DEFAULT: ThemeColors = {
  rail: '#1e1f22',
  side: '#2b2d31',
  chat: '#313338',
  accent: '#7c5cff',
  text: '#dbdee1',
};

export const PRESETS: Record<PresetName, { label: string; colors: ThemeColors; bright: string; muted: string }> = {
  violet: {
    label: 'Violet (default)',
    colors: { rail: '#1e1f22', side: '#2b2d31', chat: '#313338', accent: '#7c5cff', text: '#dbdee1' },
    bright: '#f2f3f5',
    muted: '#949ba4',
  },
  midnight: {
    label: 'Midnight',
    colors: { rail: '#0b0d14', side: '#111420', chat: '#161a28', accent: '#5b8cff', text: '#c9d1e6' },
    bright: '#f2f5ff',
    muted: '#7a84a0',
  },
  forest: {
    label: 'Forest',
    colors: { rail: '#101a14', side: '#15241b', chat: '#1a2e22', accent: '#2fb37a', text: '#d3e6da' },
    bright: '#f1faf4',
    muted: '#86a393',
  },
  light: {
    label: 'Light',
    colors: { rail: '#e3e5e8', side: '#f2f3f5', chat: '#ffffff', accent: '#5b45e0', text: '#2e3338' },
    bright: '#060607',
    muted: '#5c6370',
  },
};

const HEX = /^#[0-9a-f]{6}$/i;

function safe(hex: string | undefined, fallback: string): string {
  return hex && HEX.test(hex) ? hex : fallback;
}

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Blends two colors. t = 0 keeps a, t = 1 gives b. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

export function isDark(hex: string): boolean {
  const [r, g, b] = parse(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/** Turns a hex color into the "R G B" form that the CSS variables use. */
export function toTriple(hex: string): string {
  const [r, g, b] = parse(hex);
  return `${r} ${g} ${b}`;
}

function derive(c: ThemeColors, bright: string, muted: string): Record<Token, string> {
  return {
    rail: c.rail,
    side: c.side,
    chat: c.chat,
    input: mix(c.chat, c.text, 0.06),
    hover: mix(c.chat, c.text, 0.04),
    active: mix(c.chat, c.text, 0.1),
    line: mix(c.chat, c.text, 0.1),
    muted,
    text: c.text,
    bright,
    accent: c.accent,
    accentHover: mix(c.accent, '#000000', 0.12),
  };
}

/** Full palette for the chosen theme. Invalid colors fall back to the defaults. */
export function resolvePalette(name: ThemeName, custom: ThemeColors): Record<Token, string> {
  if (name === 'custom') {
    const c: ThemeColors = {
      rail: safe(custom.rail, CUSTOM_DEFAULT.rail),
      side: safe(custom.side, CUSTOM_DEFAULT.side),
      chat: safe(custom.chat, CUSTOM_DEFAULT.chat),
      accent: safe(custom.accent, CUSTOM_DEFAULT.accent),
      text: safe(custom.text, CUSTOM_DEFAULT.text),
    };
    return derive(c, mix(c.text, isDark(c.chat) ? '#ffffff' : '#000000', 0.35), mix(c.text, c.chat, 0.4));
  }
  const p = PRESETS[name as PresetName] ?? PRESETS.violet;
  return derive(p.colors, p.bright, p.muted);
}
