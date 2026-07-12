const styles = {
  PRESENT: { background: '#eaf4d3', color: '#04471c' },
  LATE:    { background: '#fff3e0', color: '#b35c00' },
  ABSENT:  { background: '#fdecea', color: '#8b1a1a' },
};

export function AttendanceBadge({ status }: { status: 'PRESENT' | 'LATE' | 'ABSENT' }) {
  const s = styles[status];
  const labels = { PRESENT: '✓ Present', LATE: '⚠ Late', ABSENT: '✗ Absent' };
  return (
    <span style={{
      ...s,
      padding: '3px 9px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 500,
      display: 'inline-block',
    }}>
      {labels[status]}
    </span>
  );
}
