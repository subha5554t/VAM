/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light "seller workspace" shell
        canvas: '#F6F3EE',
        panel: '#FFFFFF',
        line: '#E7E1D8',
        ink: '#16181D',
        muted: '#6B6F76',
        brand: {
          DEFAULT: '#E40046',
          deep: '#B50038',
          soft: '#FDE7EE',
        },
        // Deep "live call" stage
        stage: {
          DEFAULT: '#0B111C',
          panel: '#131C2B',
          line: '#243149',
          text: '#E9EDF5',
          muted: '#8C97AA',
        },
        ok: '#0E9F6E',
        warn: '#C2740A',
        bad: '#D92D20',
        // Kept for any legacy reference
        snapdeal: {
          red: '#E40046',
          dark: '#1E293B',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(22,24,29,0.04), 0 10px 30px -18px rgba(22,24,29,0.22)',
        lift: '0 20px 50px -24px rgba(22,24,29,0.35)',
        glow: '0 0 70px -12px rgba(228,0,70,0.45)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'slide-up': 'slide-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
