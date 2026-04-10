// Tailwind CSS configuration for Claude Code Visual Manager
// Design tokens extracted from Stitch design exports (Phase 9)
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand
        'primary': '#933df5',
        'primary-light': '#a855f7',

        // Backgrounds
        'background-dark': '#000000',
        'surface': '#0a0a0a',
        'surface-default': '#111111',
        'surface-lighter': '#141414',
        'surface-hover': '#1a1a1a',
        'terminal-bg': '#000000',

        // Borders
        'border-color': '#1a1a1a',
        'border-default': '#222222',
        'border-hover': '#444444',

        // Text
        'text-main': '#EAEAEA',
        'text-muted': '#888888',
        'text-dim': '#666666',
        'text-dimmer': '#444444',

        // Semantic
        'success': '#10B981',
        'success-light': '#22c55e',
        'error': '#E33A3A',
        'warning': '#ffaa44',
        'accent': '#3291FF',

        // Code syntax highlighting (GitHub dark theme from Stitch)
        'code-purple': '#d2a8ff',
        'code-green': '#7ee787',
        'code-red': '#ff7b72',
        'code-blue': '#79c0ff',
        'code-string': '#a5d6ff',
        'code-text': '#c9d1d9',
      },
      fontFamily: {
        'sans': ['Inter', 'Geist', 'system-ui', 'sans-serif'],
        'mono': ['"JetBrains Mono"', 'ui-monospace', '"Cascadia Code"', '"Fira Code"', 'monospace'],
        'display': ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'sm': '2px',
        'DEFAULT': '4px',
        'md': '4px',
        'lg': '8px',
        'xl': '12px',
        'full': '9999px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
