const styles = {
  PRESENT: {
    background: 'rgba(4,71,28,0.12)',
    color: 'var(--primary)',
    border: '0.5px solid rgba(4,71,28,0.25)',
  },
  LATE: {
    background: 'rgba(179,92,0,0.12)',
    color: '#b35c00',
    border: '0.5px solid rgba(179,92,0,0.25)',
  },
  ABSENT: {
    background: 'rgba(112,22,30,0.12)',
    color: 'var(--danger)',
    border: '0.5px solid rgba(112,22,30,0.25)',
  },
};

const darkStyles = {
  PRESENT: {
    background: 'rgba(195,216,152,0.15)',
    color: '#c3d898',
    border: '0.5px solid rgba(195,216,152,0.3)',
  },
  LATE: {
    background: 'rgba(255,180,80,0.12)',
    color: '#ffb450',
    border: '0.5px solid rgba(255,180,80,0.25)',
  },
  ABSENT: {
    background: 'rgba(245,192,195,0.12)',
    color: '#f5c0c3',
    border: '0.5px solid rgba(245,192,195,0.25)',
  },
};

const LABELS = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent' };

export function AttendanceBadge({ status }: { status: 'PRESENT' | 'LATE' | 'ABSENT' }) {
  // Read dark mode from the root element class (set by ThemeProvider)
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const s = isDark ? darkStyles[status] : styles[status];

  return (
    <span style={{
      ...s,
      padding: '3px 9px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 500,
      display: 'inline-block',
    }}>
      {LABELS[status]}
    </span>
  );
}
