import { useTheme } from '../../lib/theme-store';

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isDark = mode === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: 'none',
        border: '0.5px solid var(--sidebar-border)',
        borderRadius: 6,
        padding: '4px 8px',
        cursor: 'pointer',
        color: 'var(--sidebar-muted)',
        fontSize: 12,
      }}
    >
      <i
        className={isDark ? 'ti ti-sun' : 'ti ti-moon'}
        style={{ fontSize: 14 }}
        aria-hidden
      />
      {isDark ? 'Light' : 'Dark'}
    </button>
  );
}
