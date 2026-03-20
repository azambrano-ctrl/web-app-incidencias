import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '../../utils/constants';

export function StatusBadge({ status }) {
  return (
    <span className="badge" style={{ backgroundColor: STATUS_COLORS[status] + '22', color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}` }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  return (
    <span className="badge" style={{ backgroundColor: PRIORITY_COLORS[priority] + '22', color: PRIORITY_COLORS[priority], border: `1px solid ${PRIORITY_COLORS[priority]}` }}>
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}
