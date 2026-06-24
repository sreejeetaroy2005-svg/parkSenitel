import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Shell / chrome
        'shell':        '#0F0F12',   // deep near-black
        'surface':      '#16161A',   // panel surface
        'surface-2':    '#1E1E24',   // raised card / input
        'surface-3':    '#252530',   // hover elevated card
        'border':       '#2A2A35',   // subtle dividers
        'border-light': '#353545',   // slightly more visible border

        // Text
        'muted':         '#55556A',   // placeholder / tertiary
        'primary-text':  '#EEEEF5',   // near-white
        'secondary-text':'#9090A8',   // concrete grey

        // Accents
        'accent':       '#F5A623',   // amber
        'accent-dark':  '#D4891A',   // amber hover
        'accent-glow':  'rgba(245,166,35,0.15)',

        // Severity — traffic light
        'critical':     '#EF4444',   // red
        'critical-bg':  'rgba(239,68,68,0.12)',
        'high':         '#F97316',   // orange
        'high-bg':      'rgba(249,115,22,0.12)',
        'moderate':     '#EAB308',   // yellow
        'moderate-bg':  'rgba(234,179,8,0.12)',
        'normal':       '#22C55E',   // green
        'normal-bg':    'rgba(34,197,94,0.12)',

        // Legacy compat
        'danger':       '#EF4444',
        'danger-light': '#F87171',
        'background':   '#EEEEF5',
        'high-severity':'#EF4444',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'monospace'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        'sm':  '4px',
        DEFAULT:'6px',
        'md':  '8px',
        'lg':  '12px',
        'xl':  '16px',
        '2xl': '20px',
      },
      boxShadow: {
        'panel':   '0 8px 32px rgba(0,0,0,0.6)',
        'card':    '0 2px 12px rgba(0,0,0,0.4)',
        'card-hover': '0 4px 20px rgba(0,0,0,0.5)',
        'amber':   '0 0 0 2px rgba(245,166,35,0.4)',
        'glow-red':'0 0 20px rgba(239,68,68,0.2)',
        'glow-amber':'0 0 20px rgba(245,166,35,0.15)',
        'inset':   'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-glass': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
