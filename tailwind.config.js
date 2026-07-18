/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        page: '#0d0d0d',
        surface: '#1a1a19',
        ink: {
          DEFAULT: '#ffffff',
          secondary: '#c3c2b7',
          muted: '#898781',
        },
        line: {
          DEFAULT: '#2c2c2a',
          strong: '#383835',
        },
        status: {
          good: '#0ca30c',
          warning: '#fab219',
          serious: '#ec835a',
          critical: '#d03b3b',
        },
        accent: '#3987e5',
      },
    },
  },
  plugins: [],
}
