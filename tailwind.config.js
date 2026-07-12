/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'page':           'var(--page-bg)',
        'sidebar':        'var(--sidebar-bg)',
        'card':           'var(--card-bg)',
        'primary':        'var(--primary)',
        'primary-text':   'var(--primary-text)',
        'danger':         'var(--danger)',
        'page-title':     'var(--page-title)',
        'body-text':      'var(--body-text)',
        'muted-text':     'var(--muted-text)',
      },
      backgroundColor: {
        'page':     'var(--page-bg)',
        'sidebar':  'var(--sidebar-bg)',
        'card':     'var(--card-bg)',
        'primary':  'var(--primary)',
        'row-alt':  'var(--row-alt)',
      },
      borderColor: {
        'card':    'var(--card-border)',
        'sidebar': 'var(--sidebar-border)',
      },
      textColor: {
        'page-title': 'var(--page-title)',
        'body':       'var(--body-text)',
        'muted':      'var(--muted-text)',
        'on-primary': 'var(--primary-text)',
      }
    }
  },
  plugins: [],
}
