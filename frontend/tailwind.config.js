/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme colors
        dark: {
          primary: '#0F172A',    // Slate 900
          secondary: '#1E293B',  // Slate 800
          card: '#1E293B',       // Slate 800
          border: '#334155',     // Slate 700
          text: {
            primary: '#F8FAFC',  // Slate 50
            secondary: '#94A3B8', // Slate 400
          }
        },
        accent: {
          primary: '#2563EB',    // Blue 600
          success: '#059669',    // Emerald 600
          warning: '#D97706',    // Amber 600
          error: '#DC2626',      // Red 600
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(to bottom right, #0F172A, #1E293B)',
      },
      boxShadow: {
        'glow': '0 0 15px rgba(37, 99, 235, 0.3)',
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
  plugins: [
    require('@heroicons/react/24/solid'),
  ],
}
