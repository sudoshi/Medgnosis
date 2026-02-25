import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          primary: '#0F172A',
          secondary: '#1E293B',
          card: '#1E293B',
          border: '#334155',
          text: {
            primary: '#F8FAFC',
            secondary: '#94A3B8',
          },
        },
        light: {
          primary: '#FFFFFF',
          secondary: '#F8FAFC',
          card: '#F1F5F9',
          border: '#D1D5DB',
          text: {
            primary: '#0F172A',
            secondary: '#6B7280',
          },
        },
        accent: {
          primary: '#2563EB',
          success: '#059669',
          warning: '#D97706',
          error: '#DC2626',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(to bottom right, #0F172A, #1E293B)',
        'gradient-light': 'linear-gradient(to bottom right, #FFFFFF, #F1F5F9)',
      },
      boxShadow: {
        glow: '0 0 15px rgba(37, 99, 235, 0.3)',
        'glow-success': '0 0 15px rgba(5, 150, 105, 0.3)',
        'glow-warning': '0 0 15px rgba(217, 119, 6, 0.3)',
        'glow-error': '0 0 15px rgba(220, 38, 38, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-in': 'slideIn 0.5s ease-in-out',
        'pulse-glow': 'pulseGlow 2s infinite',
        'progress-indeterminate': 'progressIndeterminate 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        progressIndeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
