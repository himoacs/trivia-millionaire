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
          purple: '#2D1B69',
          'purple-dark': '#1A0F3E',
          'purple-light': '#3D2B79',
          blue: '#0052A3',
          'blue-dark': '#003D7A',
          'blue-light': '#1A6BC0',
          gold: '#F7941D',
          'gold-dark': '#D67A0D',
          'gold-light': '#FFB81C',
          dark: '#0A0A0A',
          'dark-light': '#1A1A2E',
          orange: '#FF6B35',
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
        'shake': 'shake 0.5s ease-in-out',
        'pop': 'pop 0.3s ease-out',
        'spotlight': 'spotlight 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(247, 148, 29, 0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(247, 148, 29, 0.8), 0 0 60px rgba(247, 148, 29, 0.4)' },
        },
        spotlight: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
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
