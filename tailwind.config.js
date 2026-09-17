/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        elevated: 'rgb(var(--c-elevated) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        brand: 'rgb(var(--c-brand) / <alpha-value>)',
        'brand-ink': 'rgb(var(--c-brand-ink) / <alpha-value>)',
        pr: 'rgb(var(--c-pr) / <alpha-value>)',
        up: 'rgb(var(--c-up) / <alpha-value>)',
        down: 'rgb(var(--c-down) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      /* ------------------------------------------------------------------
         One type scale, used by name. No component sets a pixel size itself.
         ------------------------------------------------------------------ */
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        // Page title — the name of the screen. Scales a little with viewport.
        page: ['clamp(1.75rem, 6.2vw, 2rem)', { lineHeight: '1.12', letterSpacing: '-0.022em', fontWeight: '800' }],
        'page-sub': ['0.9375rem', { lineHeight: '1.45' }],
        // Section heading inside a screen.
        section: ['0.8125rem', { lineHeight: '1.15', letterSpacing: '0.07em', fontWeight: '700' }],
        // Title of a card, a routine, an exercise.
        card: ['1.0625rem', { lineHeight: '1.3', letterSpacing: '-0.012em', fontWeight: '650' }],
        'card-sm': ['0.9375rem', { lineHeight: '1.35', fontWeight: '600' }],
        body: ['0.9375rem', { lineHeight: '1.5' }],
        secondary: ['0.84375rem', { lineHeight: '1.45' }],
        caption: ['0.75rem', { lineHeight: '1.35' }],
        // Numbers that carry the story.
        metric: ['1.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
        'metric-lg': ['2.125rem', { lineHeight: '1', letterSpacing: '-0.025em', fontWeight: '700' }],
        hero: ['clamp(2.25rem, 9vw, 3rem)', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '800' }],
        nav: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.01em', fontWeight: '600' }],
      },
      fontWeight: {
        650: '650',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        glow: '0 0 0 1px rgb(var(--c-brand) / 0.28), 0 10px 24px -10px rgb(var(--c-brand) / 0.45)',
      },
      /* Spacing scale used by name across the app: xs sm md lg xl. */
      spacing: {
        xs: '0.375rem',
        sm: '0.625rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2.25rem',
        13: '3.25rem',
        18: '4.5rem',
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        nav: '4.5rem',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'none' } },
        'sheet-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': { '0%': { transform: 'scale(0.9)', opacity: '0.7' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
      },
      animation: {
        'fade-up': 'fade-up 280ms cubic-bezier(0.16,1,0.3,1) both',
        'fade-in': 'fade-in 200ms ease-out both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16,1,0.3,1) both',
        'sheet-up': 'sheet-up 300ms cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}
