/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Own VuloChat palette: Discord-style dark layers, violet accent.
        vulo: {
          rail: '#1e1f22',
          side: '#2b2d31',
          chat: '#313338',
          input: '#383a40',
          hover: '#35373c',
          active: '#404249',
          line: '#3f4147',
          muted: '#949ba4',
          text: '#dbdee1',
          bright: '#f2f3f5',
          accent: '#7c5cff',
          accentHover: '#6a48f0',
          green: '#23a55a',
          yellow: '#f0b232',
          red: '#f23f43',
          idle: '#f0b232',
          dnd: '#f23f43',
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
