import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Shell / chrome
        'shell':        '#1A1A1A',   // asphalt near-black
        'surface':      '#242424',   // slightly lighter panel surface
        'surface-2':    '#2E2E2E',   // raised card / input background
        'border':       '#3A3A3A',   // subtle dividers
        'muted':        '#666666',   // placeholder / secondary text

        // Text
        'primary-text': '#F5F0E8',   // warm off-white
        'secondary-text':'#B0A898',  // concrete grey text

        // Accents
        'accent':       '#F5A623',   // warning amber
        'accent-dark':  '#D4891A',   // amber hover/active
        'danger':       '#C0392B',   // signal red — high severity only
        'danger-light': '#E74C3C',   // lighter red for text-on-dark

        // Legacy (keep for utils/colors.ts compatibility)
        'background':   '#F5F0E8',
        'high-severity':'#C0392B',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'monospace'],
        body:    ['Inter', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        'sm': '4px',
        DEFAULT: '6px',
        'md': '8px',
        'lg': '12px',
      },
      boxShadow: {
        'panel':  '0 4px 24px rgba(0,0,0,0.5)',
        'card':   '0 2px 8px rgba(0,0,0,0.4)',
        'amber':  '0 0 0 2px rgba(245, 166, 35, 0.5)',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
