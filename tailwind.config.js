/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ryox: {
          darkest: '#05070d',
          dark: '#0a0f1d',
          card: '#111827',
          surface: '#161f36',
          border: '#1f293d',
          primary: '#00e5ff',
          primaryHover: '#33edff',
          secondary: '#6366f1',
          accent: '#8b5cf6',
          cyan: '#00f2fe',
          emerald: '#10b981',
          danger: '#ef4444',
          warning: '#f59e0b',
          muted: '#64748b',
          text: '#f8fafc',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'glow-primary': '0 0 25px -3px rgba(0, 229, 255, 0.45)',
        'glow-secondary': '0 0 25px -3px rgba(99, 102, 241, 0.4)',
        'glow-danger': '0 0 25px -3px rgba(239, 68, 68, 0.45)',
        'glow-emerald': '0 0 25px -3px rgba(16, 185, 129, 0.45)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
      }
    },
  },
  plugins: [],
}
