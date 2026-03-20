export const STATUS_LABELS = {
  open: 'Abierta',
  assigned: 'Asignada',
  in_progress: 'En Progreso',
  resolved: 'Resuelta',
  cancelled: 'Cancelada',
};

export const STATUS_COLORS = {
  open: '#ef4444',
  assigned: '#f97316',
  in_progress: '#3b82f6',
  resolved: '#22c55e',
  cancelled: '#9ca3af',
};

export const PRIORITY_LABELS = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const PRIORITY_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#7c3aed',
};

export const TYPE_LABELS = {
  internet: 'Internet',
  tv: 'TV Cable',
  both: 'Internet + TV',
};

export const ROLE_LABELS = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  technician: 'Técnico',
};

export const STATUS_TRANSITIONS = {
  admin: ['open', 'assigned', 'in_progress', 'resolved', 'cancelled'],
  supervisor: ['open', 'assigned', 'in_progress', 'resolved', 'cancelled'],
  technician: ['in_progress', 'resolved'],
};
