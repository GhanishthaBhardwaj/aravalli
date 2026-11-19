/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        sidebar: 'var(--sidebar)',
        track: 'var(--track)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        subtle: 'var(--subtle)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-fg': 'var(--accent-fg)',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '8px', md: '8px', lg: '10px', xl: '14px' },
      boxShadow: { pop: 'var(--shadow-pop)' },
    },
  },
  plugins: [],
};
