export function SLABadge({ dueAt, status }) {
  if (!dueAt || ['resolved', 'cancelled', 'closed'].includes(status)) return null;

  const diffMs = new Date(dueAt).getTime() - Date.now();
  const diffH = diffMs / (1000 * 3600);

  let color, bg, label;
  if (diffMs < 0) {
    const over = Math.abs(diffH);
    label = over < 24 ? `Vencida ${Math.round(over)}h` : `Vencida ${Math.round(over / 24)}d`;
    color = '#fff'; bg = '#ef4444';
  } else if (diffH < 1) {
    label = `${Math.round(diffMs / 60000)}min restantes`;
    color = '#fff'; bg = '#f97316';
  } else if (diffH < 4) {
    label = `${Math.round(diffH)}h restantes`;
    color = '#fff'; bg = '#f97316';
  } else {
    label = `${Math.round(diffH)}h restantes`;
    color = '#166534'; bg = '#dcfce7';
  }

  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: bg, color, whiteSpace: 'nowrap', display: 'inline-flex',
      alignItems: 'center', gap: 3,
    }}>
      ⏱ {label}
    </span>
  );
}
