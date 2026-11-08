/** @type {import('tailwindcss').Config} */

// Colors read CSS variables, so a theme can change them at runtime (see src/lib/themes.ts).
// The variables hold "R G B" values, which lets Tailwind's opacity modifiers keep working.
const token = (name) => `rgb(var(--vulo-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Own VuloChat palette: Discord-style dark layers, violet accent by default.
        vulo: {
          rail: token('rail'),
          side: token('side'),
          chat: token('chat'),
          input: token('input'),
          hover: token('hover'),
          active: token('active'),
          line: token('line'),
          muted: token('muted'),
          text: token('text'),
          bright: token('bright'),
          accent: token('accent'),
          accentHover: token('accentHover'),
          green: token('green'),
          yellow: token('yellow'),
          red: token('red'),
          idle: token('idle'),
          dnd: token('dnd'),
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
