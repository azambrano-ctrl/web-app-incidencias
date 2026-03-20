import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getIncident, changeStatus, addComment, assignIncident, updateIncident } from '../api/incidents.api';
import { getUsers } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { StatusBadge, PriorityBadge } from '../components/incidents/StatusBadge';
import IncidentForm from '../components/incidents/IncidentForm';
import { TYPE_LABELS, STATUS_TRANSITIONS, STATUS_LABELS } from '../utils/constants';
import { toast } from 'react-hot-toast';

export default function IncidentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { socket } = useSocket();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [comment, setComment] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [solution, setSolution] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);

  const { data: inc, isLoading, refetch } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => getIncident(id),
  });

  const { data: technicians } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => getUsers('technician'),
    enabled: ['admin', 'supervisor'].includes(user?.role),
  });

  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('join:incident', id);
    const refresh = () => refetch();
    socket.on('incident:status_changed', refresh);
    socket.on('incident:assigned', refresh);
    socket.on('incident:comment', ({ comment: c }) => {
      qc.setQueryData(['incident', id], (old) => old ? { ...old, comments: [...(old.comments || []), c] } : old);
    });
    return () => {
      socket.emit('leave:incident', id);
      socket.off('incident:status_changed', refresh);
      socket.off('incident:assigned', refresh);
      socket.off('incident:comment');
    };
  }, [socket, id]);

  const statusMut = useMutation({
    mutationFn: () => changeStatus(id, newStatus, statusComment, solution),
    onSuccess: () => {
      toast.success('Estado actualizado');
      setShowStatusModal(false);
      setStatusComment('');
      setSolution('');
      setNewStatus('');
      refetch();
    },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const commentMut = useMutation({
    mutationFn: () => addComment(id, comment),
    onSuccess: () => { toast.success('Comentario agregado'); setComment(''); refetch(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: (data) => updateIncident(id, data),
    onSuccess: () => { toast.success('Incidencia actualizada'); setShowEdit(false); refetch(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  if (isLoading) return <div className="app-layout"><Sidebar /><main className="main-content"><div className="loading-center">Cargando...</div></main></div>;
  if (!inc) return null;

  const allowedStatuses = STATUS_TRANSITIONS[user?.role] || [];

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title={inc.ticket_number} />
        <div className="page-body">
          <div className="detail-back">
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/incidencias')}>← Volver</button>
          </div>

          <div className="detail-grid">
            <div className="detail-main">
              <div className="card">
                <div className="detail-header">
                  <div>
                    <h2>{inc.title}</h2>
                    <p className="detail-meta">
                      {TYPE_LABELS[inc.type]} · Creada por {inc.created_name} · {new Date(inc.created_at).toLocaleString('es-HN')}
                    </p>
                  </div>
                  <div className="detail-badges">
                    <StatusBadge status={inc.status} />
                    <PriorityBadge priority={inc.priority} />
                  </div>
                </div>
                <div className="detail-description">
                  <h4>Descripción</h4>
                  <p>{inc.description}</p>
                </div>
                {inc.solution && (
                  <div className="solution-box">
                    <h4>✅ Solución aplicada</h4>
                    <p>{inc.solution}</p>
                  </div>
                )}
                {inc.due_at && (
                  <div className={`due-date ${new Date(inc.due_at) < new Date() ? 'overdue' : ''}`}>
                    ⏰ Fecha límite: {new Date(inc.due_at).toLocaleString('es-HN')}
                    {new Date(inc.due_at) < new Date() && <span className="overdue-tag"> VENCIDA</span>}
                  </div>
                )}
              </div>

              <div className="card">
                <h3>Datos del cliente</h3>
                <div className="client-info">
                  <div><strong>Nombre:</strong> {inc.client_name}</div>
                  <div><strong>Dirección:</strong> {inc.client_address}</div>
                  {inc.client_phone && <div><strong>Teléfono:</strong> {inc.client_phone}</div>}
                </div>
              </div>

              <div className="card">
                <h3>Historial de estados</h3>
                <div className="timeline">
                  {inc.history?.length === 0 && <p className="empty-msg">Sin cambios de estado</p>}
                  {inc.history?.map(h => (
                    <div key={h.id} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <span className="timeline-user">{h.user_name}</span>
                        <span className="timeline-action">
                          {h.old_status ? `${STATUS_LABELS[h.old_status]} → ` : ''}{STATUS_LABELS[h.new_status]}
                        </span>
                        {h.comment && <p className="timeline-comment">{h.comment}</p>}
                        <span className="timeline-time">{new Date(h.created_at).toLocaleString('es-HN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3>Comentarios ({inc.comments?.length || 0})</h3>
                <div className="comments-list">
                  {inc.comments?.map(c => (
                    <div key={c.id} className="comment-item">
                      <div className="comment-header">
                        <strong>{c.user_name}</strong>
                        <span className="comment-role">{c.user_role}</span>
                        <span className="comment-time">{new Date(c.created_at).toLocaleString('es-HN')}</span>
                      </div>
                      <p>{c.body}</p>
                    </div>
                  ))}
                </div>
                <div className="comment-form">
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Escribe un comentario..."
                    rows={2}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={!comment.trim() || commentMut.isPending}
                    onClick={() => commentMut.mutate()}
                  >
                    {commentMut.isPending ? 'Enviando...' : 'Comentar'}
                  </button>
                </div>
              </div>
            </div>

            <div className="detail-sidebar">
              <div className="card">
                <h4>Acciones</h4>
                {allowedStatuses.length > 0 && inc.status !== 'cancelled' && (
                  <button className="btn btn-primary btn-full" onClick={() => setShowStatusModal(true)}>
                    Cambiar estado
                  </button>
                )}
                {['admin', 'supervisor'].includes(user?.role) && (
                  <button className="btn btn-secondary btn-full" onClick={() => setShowEdit(true)}>
                    Editar incidencia
                  </button>
                )}
              </div>

              <div className="card">
                <h4>Técnico asignado</h4>
                {inc.assigned_name ? (
                  <div className="technician-info">
                    <div className="tech-avatar">{inc.assigned_name[0]}</div>
                    <div>
                      <div>{inc.assigned_name}</div>
                      <div className="tech-email">{inc.assigned_email}</div>
                      {inc.assigned_phone && <div>{inc.assigned_phone}</div>}
                    </div>
                  </div>
                ) : (
                  <p className="unassigned">Sin técnico asignado</p>
                )}
              </div>

              <div className="card">
                <h4>Detalles</h4>
                <div className="details-list">
                  <div><span>Servicio</span><span>{TYPE_LABELS[inc.type]}</span></div>
                  <div><span>Prioridad</span><PriorityBadge priority={inc.priority} /></div>
                  <div><span>Estado</span><StatusBadge status={inc.status} /></div>
                  {inc.resolved_at && <div><span>Resuelta</span><span>{new Date(inc.resolved_at).toLocaleDateString('es-HN')}</span></div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showStatusModal && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cambiar estado</h3>
              <button className="modal-close" onClick={() => setShowStatusModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label>Nuevo estado
                <select value={newStatus} onChange={e => { setNewStatus(e.target.value); setSolution(''); }}>
                  <option value="">Seleccionar...</option>
                  {allowedStatuses.filter(s => s !== inc.status).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </label>

              {newStatus === 'resolved' && (
                <label style={{ marginTop: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    ✅ Solución aplicada <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                  </span>
                  <textarea
                    value={solution}
                    onChange={e => setSolution(e.target.value)}
                    rows={4}
                    required
                    placeholder="Describe qué se hizo para resolver el problema: equipo cambiado, cable reparado, configuración aplicada, etc."
                    style={{ borderColor: !solution.trim() ? '#fca5a5' : undefined }}
                  />
                </label>
              )}

              <label style={{ marginTop: 12 }}>Comentario adicional
                <textarea value={statusComment} onChange={e => setStatusComment(e.target.value)} rows={2} placeholder="Observaciones opcionales..." />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => { setShowStatusModal(false); setSolution(''); setNewStatus(''); }}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={!newStatus || (newStatus === 'resolved' && !solution.trim()) || statusMut.isPending}
                onClick={() => statusMut.mutate()}
              >
                {statusMut.isPending ? 'Actualizando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <IncidentForm
          initial={inc}
          onSubmit={d => updateMut.mutate(d)}
          onCancel={() => setShowEdit(false)}
          loading={updateMut.isPending}
        />
      )}
      <BottomNav />
    </div>
  );
}
