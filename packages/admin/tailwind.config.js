/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        millionaire: {
          // Primary navy backgrounds (authentic WWTBAM)
          navy: '#0D1B2A',
          'navy-dark': '#050D18',
          'navy-light': '#1B3A5A',
          // Blue accents (answer boxes)
          blue: '#0052A3',
          'blue-dark': '#003D7A',
          'blue-light': '#1A6BC0',
          // Gold/Orange (highlights, money)
          gold: '#F7941D',
          'gold-dark': '#D67A0D',
          'gold-light': '#FFB81C',
          orange: '#FF6B35',
          // Teal (money ladder highlight)
          teal: '#00B4D8',
          'teal-dark': '#0096B4',
          'teal-light': '#48CAE4',
          // Accent purple (lighting effects)
          purple: '#2D1B69',
          'purple-light': '#3D2B79',
          // Dark backgrounds
          dark: '#0A0A0A',
          'dark-light': '#1A1A2E',
        },
        answer: {
          primary: '#0052A3',
          secondary: '#1A6BC0',
          accent: '#F7941D',
          highlight: '#FFB81C',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'bounce-subtle': 'bounce 2s infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(247, 148, 29, 0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(247, 148, 29, 0.8), 0 0 60px rgba(247, 148, 29, 0.4)' },
        },
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(247, 148, 29, 0.5), 0 0 40px rgba(247, 148, 29, 0.3)',
        'glow-gold-lg': '0 0 30px rgba(247, 148, 29, 0.6), 0 0 60px rgba(247, 148, 29, 0.4)',
        'glow-blue': '0 0 20px rgba(0, 82, 163, 0.5), 0 0 40px rgba(0, 82, 163, 0.3)',
      },
    },
  },
  plugins: [],
}
