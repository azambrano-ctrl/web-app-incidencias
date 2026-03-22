import { useState, useEffect, useRef, useCallback } from 'react';
import * as exifr from 'exifr';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SignaturePad from '../components/incidents/SignaturePad';
import {
  getIncident, changeStatus, addComment, assignIncident, updateIncident,
  getIncidents, linkIncident, unlinkIncident,
  getPhotos, getPhoto, uploadPhoto, deletePhoto, deleteIncident,
  geocodeIncident, setIncidentLocation,
} from '../api/incidents.api';
import {
  getIncidentChecklist, createIncidentChecklist, toggleChecklistItem, getTemplates,
} from '../api/checklist.api';
import { getUsers } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { StatusBadge, PriorityBadge } from '../components/incidents/StatusBadge';
import { SLABadge } from '../components/incidents/SLABadge';
import IncidentForm from '../components/incidents/IncidentForm';
import { TYPE_LABELS, STATUS_TRANSITIONS, STATUS_LABELS } from '../utils/constants';
import { downloadIncidentPDF } from '../utils/incidentPdf';
import { toast } from 'react-hot-toast';

export default function IncidentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { socket } = useSocket();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const sigRef = useRef(null);
  const photoInputRef = useRef(null);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const mapPickerRef = useRef(null);
  const mapPickerInstance = useRef(null);
  const mapPickerMarker = useRef(null);
  const [comment, setComment] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [solution, setSolution] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [sigEmpty, setSigEmpty] = useState(true);

  // Parent-child grouping
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [selectedParent, setSelectedParent] = useState('');

  // Photos
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Checklist assign
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const { data: inc, isLoading, refetch } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => getIncident(id),
  });

  const { data: technicians } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => getUsers('technician'),
    enabled: ['admin', 'supervisor'].includes(user?.role),
  });

  // Checklist
  const { data: checklist, refetch: refetchChecklist } = useQuery({
    queryKey: ['checklist', id],
    queryFn: () => getIncidentChecklist(id),
    enabled: !!id,
  });

  // Photos list (metadata only)
  const { data: photos = [], refetch: refetchPhotos } = useQuery({
    queryKey: ['photos', id],
    queryFn: () => getPhotos(id),
    enabled: !!id,
  });

  // Templates for checklist assignment
  const { data: templates = [] } = useQuery({
    queryKey: ['checklist-templates'],
    queryFn: getTemplates,
    enabled: ['admin', 'supervisor'].includes(user?.role),
  });

  // Incidents for parent search
  const { data: allIncidents } = useQuery({
    queryKey: ['incidents', { limit: 200 }],
    queryFn: () => getIncidents({ limit: 200 }),
    enabled: showLinkModal,
  });

  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('join:incident', id);
    const refresh = () => refetch();
    socket.on('incident:status_changed', refresh);
    socket.on('incident:assigned', refresh);
    socket.on('incident:updated', refresh);
    socket.on('incident:comment', ({ comment: c }) => {
      qc.setQueryData(['incident', id], (old) => old ? { ...old, comments: [...(old.comments || []), c] } : old);
    });
    return () => {
      socket.emit('leave:incident', id);
      socket.off('incident:status_changed', refresh);
      socket.off('incident:assigned', refresh);
      socket.off('incident:updated', refresh);
      socket.off('incident:comment');
    };
  }, [socket, id]);

  const statusMut = useMutation({
    mutationFn: () => {
      const signature = (newStatus === 'resolved' && sigRef.current && !sigRef.current.isEmpty())
        ? sigRef.current.toDataURL('image/png')
        : null;
      return changeStatus(id, newStatus, statusComment, solution, signature);
    },
    onSuccess: () => {
      toast.success('Estado actualizado');
      setShowStatusModal(false);
      setStatusComment('');
      setSolution('');
      setNewStatus('');
      setSigEmpty(true);
      sigRef.current?.clear();
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
    onSuccess: () => {
      toast.success('Incidencia actualizada');
      setShowEdit(false);
      refetch();
      qc.invalidateQueries(['incidents']);
    },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const linkMut = useMutation({
    mutationFn: (parentId) => linkIncident(id, parentId),
    onSuccess: () => {
      toast.success('Incidencia agrupada');
      setShowLinkModal(false);
      setSelectedParent('');
      setParentSearch('');
      refetch();
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al agrupar'),
  });

  const unlinkMut = useMutation({
    mutationFn: () => unlinkIncident(id),
    onSuccess: () => { toast.success('Desvinculada del padre'); refetch(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const toggleItemMut = useMutation({
    mutationFn: (index) => toggleChecklistItem(id, index),
    onSuccess: () => refetchChecklist(),
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const assignChecklistMut = useMutation({
    mutationFn: (templateId) => createIncidentChecklist(id, { template_id: templateId }),
    onSuccess: () => {
      toast.success('Checklist asignado');
      setShowChecklistModal(false);
      setSelectedTemplate('');
      refetchChecklist();
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al asignar checklist'),
  });

  const deletePhotoMut = useMutation({
    mutationFn: (photoId) => deletePhoto(id, photoId),
    onSuccess: () => { toast.success('Foto eliminada'); refetchPhotos(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (photos.length >= 5) { toast.error('Máximo 5 fotos por incidencia'); return; }
    setUploadingPhoto(true);
    try {
      // Extraer GPS del EXIF antes de comprimir (canvas borra el EXIF)
      let gpsCoords = null;
      try {
        const gps = await exifr.gps(file);
        if (gps?.latitude && gps?.longitude) gpsCoords = gps;
      } catch { /* sin EXIF, continuar */ }

      const compressed = await compressImage(file, 800);
      await uploadPhoto(id, compressed.data, file.name, file.type);
      toast.success('Foto subida');
      refetchPhotos();

      // Si la foto tiene GPS y la incidencia no tiene ubicación → guardar automáticamente
      if (gpsCoords && !inc?.latitude) {
        await setIncidentLocation(id, gpsCoords.latitude, gpsCoords.longitude);
        refetch();
        toast.success('📍 Ubicación guardada desde la foto');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir foto');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleViewPhoto = async (photoId) => {
    try {
      const photo = await getPhoto(id, photoId);
      setLightboxPhoto(photo);
    } catch {
      toast.error('Error al cargar la foto');
    }
  };

  if (isLoading) return <div className="app-layout"><Sidebar /><main className="main-content"><div className="loading-center">Cargando...</div></main></div>;
  if (!inc) return null;

  const allowedStatuses = STATUS_TRANSITIONS[user?.role] || [];

  // Checklist progress
  const clItems = checklist?.items || [];
  const clTotal = clItems.length;
  const clChecked = clItems.filter(i => i.checked).length;
  const clProgress = clTotal > 0 ? Math.round((clChecked / clTotal) * 100) : 0;

  // Filtered incidents for parent search
  const filteredForParent = (allIncidents?.data || []).filter(inc2 =>
    inc2.id !== parseInt(id) &&
    !inc2.parent_id && // only top-level incidents as parents
    (inc2.ticket_number.toLowerCase().includes(parentSearch.toLowerCase()) ||
     inc2.title.toLowerCase().includes(parentSearch.toLowerCase()))
  );

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title={inc.ticket_number} />
        <div className="page-body">
          <div className="detail-back" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/incidencias')}>← Volver</button>
            <button
              className="btn btn-sm btn-secondary"
              disabled={pdfLoading}
              onClick={() => {
                setPdfLoading(true);
                try { downloadIncidentPDF({ inc, checklist, userName: user?.name }); }
                finally { setTimeout(() => setPdfLoading(false), 800); }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {pdfLoading ? '⏳ Generando...' : '📄 Descargar PDF'}
            </button>
          </div>

          {/* Escalation banner */}
          {inc.escalated && (
            <div style={{
              background: 'linear-gradient(135deg,#fef3c7,#fde68a)',
              border: '1px solid #f59e0b',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#92400e',
              fontWeight: 600,
            }}>
              <span style={{ fontSize: 20 }}>🔺</span>
              <div>
                <div>Incidencia escalada al supervisor</div>
                <div style={{ fontWeight: 400, fontSize: 13 }}>
                  Escalada el {new Date(inc.escalated_at).toLocaleString('es-HN')}
                </div>
              </div>
            </div>
          )}

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
                    {inc.escalated && (
                      <span style={{
                        background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b',
                        borderRadius: 4, padding: '2px 6px', fontSize: 12, fontWeight: 600
                      }}>🔺 Escalada</span>
                    )}
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
                  <div className={`due-date ${new Date(inc.due_at) < new Date() && !['resolved','cancelled'].includes(inc.status) ? 'overdue' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span>⏰ SLA: {new Date(inc.due_at).toLocaleString('es-HN')}</span>
                    <SLABadge dueAt={inc.due_at} status={inc.status} />
                  </div>
                )}
                {inc.client_signature && inc.status === 'resolved' && (
                  <div style={{ marginTop: 16, padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                    <h4 style={{ marginBottom: 8, color: '#166534' }}>✍️ Firma del cliente</h4>
                    <img src={inc.client_signature} alt="Firma del cliente" style={{ maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff' }} />
                  </div>
                )}
              </div>

              {/* ── Incidencia padre / Sub-incidencias ── */}
              {(inc.parent_id || parseInt(inc.children_count) > 0) && (
                <div className="card">
                  {inc.parent_id && (
                    <div style={{ marginBottom: parseInt(inc.children_count) > 0 ? 16 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <h4 style={{ margin: 0 }}>↑ Incidencia padre</h4>
                        {['admin', 'supervisor'].includes(user?.role) && (
                          <button className="btn btn-sm btn-secondary" onClick={() => unlinkMut.mutate()} disabled={unlinkMut.isPending}>
                            Desvincular
                          </button>
                        )}
                      </div>
                      <div
                        style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}
                        onClick={() => navigate(`/incidencias/${inc.parent_id}`)}
                      >
                        <code style={{ fontWeight: 600 }}>{inc.parent_ticket}</code>
                        <span style={{ marginLeft: 8, color: '#64748b' }}>{inc.parent_title}</span>
                      </div>
                    </div>
                  )}
                  {parseInt(inc.children_count) > 0 && (
                    <div>
                      <h4 style={{ marginBottom: 8 }}>🔗 Sub-incidencias ({inc.children_count})</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(inc.children || []).map(child => (
                          <div
                            key={child.id}
                            style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                            onClick={() => navigate(`/incidencias/${child.id}`)}
                          >
                            <code style={{ fontWeight: 600, fontSize: 12 }}>{child.ticket_number}</code>
                            <span style={{ flex: 1, color: '#374151', fontSize: 13 }}>{child.title}</span>
                            <StatusBadge status={child.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Checklist ── */}
              {!checklist && ['admin', 'supervisor'].includes(user?.role) && !['resolved', 'cancelled', 'closed'].includes(inc.status) && (
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0 }}>✅ Checklist de resolución</h3>
                    <button className="btn btn-sm btn-secondary" onClick={() => setShowChecklistModal(true)}>
                      + Asignar checklist
                    </button>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
                    No hay checklist asignado a esta incidencia.
                  </p>
                </div>
              )}
              {checklist && (
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>✅ Checklist de resolución</h3>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{clChecked}/{clTotal} completados</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: '#e2e8f0', borderRadius: 99, height: 8, marginBottom: 16, overflow: 'hidden' }}>
                    <div style={{
                      width: `${clProgress}%`, height: '100%', borderRadius: 99,
                      background: clProgress === 100 ? '#22c55e' : '#6366f1',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {clItems.map((item, idx) => (
                      <label
                        key={idx}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                          padding: '8px 10px', borderRadius: 6,
                          background: item.checked ? '#f0fdf4' : '#fafafa',
                          border: `1px solid ${item.checked ? '#bbf7d0' : '#e2e8f0'}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleItemMut.mutate(idx)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <span style={{
                          flex: 1, fontSize: 14,
                          textDecoration: item.checked ? 'line-through' : 'none',
                          color: item.checked ? '#6b7280' : '#111827'
                        }}>
                          {item.label}
                        </span>
                        {item.checked && item.checked_at && (
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            {new Date(item.checked_at).toLocaleString('es-HN')}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  {clProgress === 100 && (
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, color: '#166534', fontSize: 13, fontWeight: 600 }}>
                      ✅ Checklist completo — puedes resolver la incidencia
                    </div>
                  )}
                </div>
              )}

              {/* Fotos: visibles solo cuando la incidencia ya está resuelta/cerrada (solo lectura) */}
              {['resolved', 'closed'].includes(inc.status) && photos.length > 0 && (
                <div className="card">
                  <h3 style={{ margin: '0 0 12px' }}>📷 Fotos de resolución ({photos.length})</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    {photos.map(photo => (
                      <PhotoThumb
                        key={photo.id}
                        photo={photo}
                        incidentId={id}
                        user={user}
                        onView={() => handleViewPhoto(photo.id)}
                        onDelete={() => {
                          if (confirm('¿Eliminar esta foto?')) deletePhotoMut.mutate(photo.id);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="card">
                <h3>Datos del cliente</h3>
                <div className="client-info">
                  <div><strong>Nombre:</strong> {inc.client_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span><strong>Dirección:</strong> {inc.client_address}</span>
                    {/* Estado de geocodificación */}
                    {inc.latitude && inc.longitude
                      ? <span title={`Coords: ${Number(inc.latitude).toFixed(5)}, ${Number(inc.longitude).toFixed(5)}`}
                          style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>📍 En mapa</span>
                      : <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>📍 Sin ubicación</span>
                    }
                    {/* Botón re-geocodificar automático */}
                    {inc.client_address && (
                      <button
                        className="btn btn-sm btn-secondary"
                        disabled={geocoding}
                        title="Obtener coordenadas desde la dirección"
                        onClick={async () => {
                          setGeocoding(true);
                          try {
                            const r = await geocodeIncident(inc.id);
                            if (r.success) {
                              toast.success('✅ Ubicación encontrada — ya aparece en el mapa');
                              refetch();
                            } else {
                              toast.error(`No se encontraron coords para "${r.address}". Usa "Fijar en mapa".`);
                            }
                          } catch {
                            toast.error('Error al geocodificar');
                          } finally {
                            setGeocoding(false);
                          }
                        }}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        {geocoding ? '⏳' : '🔄'} {geocoding ? 'Buscando...' : 'Ubicar'}
                      </button>
                    )}
                    {/* Botón fijar manualmente en mapa */}
                    {['admin', 'supervisor'].includes(user?.role) && (
                      <button
                        className="btn btn-sm btn-primary"
                        title="Fijar ubicación manualmente en el mapa"
                        onClick={() => setShowMapPicker(true)}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        📍 Fijar en mapa
                      </button>
                    )}
                  </div>
                  {inc.client_phone  && <div><strong>Teléfono:</strong> {inc.client_phone}</div>}
                  {inc.client_phone2 && <div><strong>Teléfono 2:</strong> {inc.client_phone2}</div>}
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
                {['admin', 'supervisor'].includes(user?.role) && !inc.parent_id && !['resolved', 'cancelled', 'closed'].includes(inc.status) && (
                  <button className="btn btn-secondary btn-full" onClick={() => setShowLinkModal(true)}>
                    🔗 Agrupar con...
                  </button>
                )}
                {['admin', 'supervisor'].includes(user?.role) && inc.parent_id && (
                  <button className="btn btn-secondary btn-full" onClick={() => unlinkMut.mutate()} disabled={unlinkMut.isPending}>
                    ✂️ Desvincular del padre
                  </button>
                )}
                {user?.role === 'admin' && (
                  <button
                    className="btn btn-full"
                    style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', marginTop: 8 }}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar ${inc.ticket_number}? Esta acción no se puede deshacer.`)) {
                        deleteIncident(inc.id)
                          .then(() => { toast.success('Incidencia eliminada'); navigate('/incidencias'); qc.invalidateQueries(['incidents']); })
                          .catch(e => toast.error(e.response?.data?.error || 'Error al eliminar'));
                      }
                    }}
                  >
                    🗑 Eliminar incidencia
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
                  {inc.escalated && (
                    <div><span>Escalada</span><span style={{ color: '#d97706', fontWeight: 600 }}>🔺 Sí</span></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Status modal ── */}
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

              {newStatus === 'resolved' && checklist && clChecked < clTotal && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 6, color: '#c2410c', fontSize: 13 }}>
                  ⚠️ El checklist tiene {clTotal - clChecked} ítem{clTotal - clChecked > 1 ? 's' : ''} sin completar.
                  Debes completarlo antes de resolver.
                </div>
              )}

              {newStatus === 'resolved' && (
                <>
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

                  {/* ── Foto de la casa (obligatoria) ── */}
                  <div style={{ marginTop: 16, padding: '12px 14px', background: photos.length === 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${photos.length === 0 ? '#fca5a5' : '#86efac'}`, borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: photos.length > 0 ? 10 : 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: photos.length === 0 ? '#dc2626' : '#166534' }}>
                        📷 Foto de la casa <span style={{ color: '#ef4444' }}>*</span>
                        {photos.length > 0 && <span style={{ color: '#166534', fontWeight: 400, marginLeft: 4 }}>({photos.length}/5) ✓</span>}
                      </span>
                      {photos.length < 5 && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => photoInputRef.current?.click()}
                            disabled={uploadingPhoto}
                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            📷 {uploadingPhoto ? 'Subiendo...' : 'Agregar foto'}
                          </button>
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={handlePhotoUpload}
                          />
                        </>
                      )}
                    </div>
                    {photos.length === 0 && (
                      <p style={{ fontSize: 12, color: '#dc2626', margin: '6px 0 0' }}>
                        Debes tomar al menos una foto de la casa del cliente para resolver.
                      </p>
                    )}
                    {photos.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
                        {photos.map(photo => (
                          <PhotoThumb
                            key={photo.id}
                            photo={photo}
                            incidentId={id}
                            user={user}
                            onView={() => handleViewPhoto(photo.id)}
                            onDelete={() => {
                              if (confirm('¿Eliminar esta foto?')) deletePhotoMut.mutate(photo.id);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>✍️ Firma del cliente <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></span>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => { sigRef.current?.clear(); setSigEmpty(true); }}
                      >Limpiar</button>
                    </div>
                    <div style={{ border: '2px dashed var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff', touchAction: 'none' }}>
                      <SignaturePad
                        ref={sigRef}
                        height={160}
                        onEnd={() => setSigEmpty(false)}
                      />
                    </div>
                    {sigEmpty && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Pide al cliente que firme en el recuadro</p>}
                  </div>
                </>
              )}

              <label style={{ marginTop: 12 }}>Comentario adicional
                <textarea value={statusComment} onChange={e => setStatusComment(e.target.value)} rows={2} placeholder="Observaciones opcionales..." />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => { setShowStatusModal(false); setSolution(''); setNewStatus(''); }}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={
                  !newStatus ||
                  (newStatus === 'resolved' && !solution.trim()) ||
                  (newStatus === 'resolved' && photos.length === 0) ||
                  (newStatus === 'resolved' && checklist && clChecked < clTotal) ||
                  statusMut.isPending
                }
                onClick={() => statusMut.mutate()}
              >
                {statusMut.isPending ? 'Actualizando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {showEdit && (
        <IncidentForm
          initial={inc}
          onSubmit={d => updateMut.mutate(d)}
          onCancel={() => setShowEdit(false)}
          loading={updateMut.isPending}
        />
      )}

      {/* ── Link to parent modal ── */}
      {showLinkModal && (
        <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔗 Agrupar con incidencia padre</h3>
              <button className="modal-close" onClick={() => setShowLinkModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label>Buscar incidencia
                <input
                  value={parentSearch}
                  onChange={e => setParentSearch(e.target.value)}
                  placeholder="Buscar por ticket o título..."
                />
              </label>
              <div style={{ maxHeight: 250, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredForParent.slice(0, 20).map(opt => (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedParent(opt.id)}
                    style={{
                      padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                      border: `2px solid ${selectedParent === opt.id ? '#6366f1' : '#e2e8f0'}`,
                      background: selectedParent === opt.id ? '#eef2ff' : '#fafafa',
                    }}
                  >
                    <code style={{ fontSize: 12, fontWeight: 600 }}>{opt.ticket_number}</code>
                    <span style={{ marginLeft: 8, fontSize: 13 }}>{opt.title}</span>
                    <StatusBadge status={opt.status} />
                  </div>
                ))}
                {filteredForParent.length === 0 && (
                  <p style={{ color: '#94a3b8', fontSize: 13 }}>No se encontraron incidencias</p>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowLinkModal(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={!selectedParent || linkMut.isPending}
                onClick={() => linkMut.mutate(selectedParent)}
              >
                {linkMut.isPending ? 'Agrupando...' : 'Agrupar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign checklist modal ── */}
      {showChecklistModal && (
        <div className="modal-overlay" onClick={() => setShowChecklistModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✅ Asignar checklist</h3>
              <button className="modal-close" onClick={() => setShowChecklistModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {templates.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No hay templates disponibles. Crea uno en Configuración.</p>
              ) : (
                <label>Seleccionar template
                  <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {templates.filter(t => t.active).map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.items?.length || 0} ítems)
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowChecklistModal(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={!selectedTemplate || assignChecklistMut.isPending}
                onClick={() => assignChecklistMut.mutate(selectedTemplate)}
              >
                {assignChecklistMut.isPending ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxPhoto && (
        <div
          className="modal-overlay"
          onClick={() => setLightboxPhoto(null)}
          style={{ zIndex: 1000, background: 'rgba(0,0,0,0.85)' }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxPhoto(null)}
              style={{
                position: 'absolute', top: -36, right: 0, background: 'none',
                border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1
              }}
            >✕</button>
            <img
              src={lightboxPhoto.data}
              alt={lightboxPhoto.filename}
              style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }}
            />
            <div style={{ color: '#fff', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
              {lightboxPhoto.filename}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal selector de ubicación en mapa ── */}
      {showMapPicker && inc && (
        <MapPickerModal
          inc={inc}
          onClose={() => setShowMapPicker(false)}
          saving={savingLocation}
          onSave={async (lat, lng) => {
            setSavingLocation(true);
            try {
              await setIncidentLocation(inc.id, lat, lng);
              toast.success('✅ Ubicación guardada en el mapa');
              refetch();
              setShowMapPicker(false);
            } catch {
              toast.error('Error al guardar ubicación');
            } finally {
              setSavingLocation(false);
            }
          }}
        />
      )}

      <BottomNav />
    </div>
  );
}

/* ── Componente modal de selección de ubicación ──────────────────────────── */
function MapPickerModal({ inc, onClose, onSave, saving }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markerRef    = useRef(null);
  const leafletRef   = useRef(null); // guarda L para usarlo fuera del useEffect

  const [picked, setPicked] = useState(
    inc.latitude && inc.longitude
      ? { lat: parseFloat(inc.latitude), lng: parseFloat(inc.longitude) }
      : null
  );
  const [manualLat, setManualLat] = useState(inc.latitude  ? parseFloat(inc.latitude).toFixed(6)  : '');
  const [manualLng, setManualLng] = useState(inc.longitude ? parseFloat(inc.longitude).toFixed(6) : '');
  const [manualErr, setManualErr] = useState('');

  // Coloca o mueve el marcador usando el mismo divIcon rojo
  const placeMarker = (lat, lng) => {
    const L   = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const pinIcon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:36px;">
          <svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 0C6.27 0 0 6.27 0 14c0 9.625 14 22 14 22S28 23.625 28 14C28 6.27 21.73 0 14 0z"
                  fill="#ef4444" stroke="#fff" stroke-width="2"/>
            <circle cx="14" cy="14" r="6" fill="#fff"/>
          </svg>
        </div>`,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
      });
      markerRef.current = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng();
        setPicked({ lat: p.lat, lng: p.lng });
        setManualLat(p.lat.toFixed(6));
        setManualLng(p.lng.toFixed(6));
      });
    }
    map.setView([lat, lng], map.getZoom() < 15 ? 16 : map.getZoom());
    setPicked({ lat, lng });
  };

  // Aplicar coordenadas escritas manualmente
  const handleManualApply = () => {
    const lat = parseFloat(String(manualLat).replace(',', '.'));
    const lng = parseFloat(String(manualLng).replace(',', '.'));
    if (isNaN(lat) || lat < -90  || lat > 90)  { setManualErr('Latitud inválida  (ej: -2.419400)');  return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { setManualErr('Longitud inválida (ej: -79.343000)'); return; }
    setManualErr('');
    setManualLat(lat.toFixed(6));
    setManualLng(lng.toFixed(6));
    placeMarker(lat, lng);
  };

  // Inicializar Leaflet después de que el modal esté pintado
  useEffect(() => {
    let destroyed = false;

    const timer = setTimeout(() => {
      if (!containerRef.current || destroyed) return;

      Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
        .then(([{ default: L }]) => {
          if (destroyed || mapRef.current) return;

          leafletRef.current = L;

          const initLat = inc.latitude  ? parseFloat(inc.latitude)  : -2.4194;
          const initLng = inc.longitude ? parseFloat(inc.longitude) : -79.3430;

          const map = L.map(containerRef.current, { zoomControl: true })
                       .setView([initLat, initLng], inc.latitude ? 16 : 14);
          mapRef.current = map;

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
          }).addTo(map);

          setTimeout(() => map.invalidateSize(), 100);

          // divIcon: pin HTML puro, sin imágenes → siempre visible en Vite/React
          const pinIcon = L.divIcon({
            className: '',
            html: `<div style="
              width:28px;height:36px;position:relative;cursor:grab;
            ">
              <svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 0C6.27 0 0 6.27 0 14c0 9.625 14 22 14 22S28 23.625 28 14C28 6.27 21.73 0 14 0z"
                      fill="#ef4444" stroke="#fff" stroke-width="2"/>
                <circle cx="14" cy="14" r="6" fill="#fff"/>
              </svg>
            </div>`,
            iconSize: [28, 36],
            iconAnchor: [14, 36],
          });

          const makeMarker = (lat, lng) => {
            const m = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
            m.on('dragend', () => {
              const p = m.getLatLng();
              setPicked({ lat: p.lat, lng: p.lng });
              setManualLat(p.lat.toFixed(6));
              setManualLng(p.lng.toFixed(6));
            });
            return m;
          };

          // Marcador inicial si ya tiene coordenadas
          if (inc.latitude && inc.longitude) {
            markerRef.current = makeMarker(initLat, initLng);
          }

          // Clic en mapa → colocar o mover marcador
          map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            if (markerRef.current) {
              markerRef.current.setLatLng([lat, lng]);
            } else {
              markerRef.current = makeMarker(lat, lng);
            }
            setPicked({ lat, lng });
            setManualLat(lat.toFixed(6));
            setManualLng(lng.toFixed(6));
          });
        })
        .catch(() => {});
    }, 150);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current   = null;
        markerRef.current = null;
        leafletRef.current = null;
      }
    };
  }, []);

  const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(
    (inc.client_address || '') + ', La Troncal, Ecuador'
  )}`;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 660, width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>📍 Fijar ubicación</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <div className="modal-body" style={{ padding: '12px 16px 0' }}>

          {/* Opción A: clic en el mapa */}
          <p style={{ fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 600 }}>
            Opción A — Toca / haz clic en el mapa para colocar el pin:
          </p>
          <div
            ref={containerRef}
            style={{ height: 300, width: '100%', borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          {picked
            ? <p style={{ fontSize: 11, color: '#22c55e', margin: '4px 0 8px', fontFamily: 'monospace', fontWeight: 600 }}>
                📌 {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
              </p>
            : <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 8px' }}>Haz clic en el mapa para fijar el punto</p>
          }

          <hr style={{ margin: '8px 0 12px', borderColor: '#e2e8f0' }} />

          {/* Opción B: pegar coords de Google Maps */}
          <p style={{ fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 600 }}>
            Opción B — Pega coordenadas de{' '}
            <a href={gmapsUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
              Google Maps ↗
            </a>
            <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>
              {' '}(clic derecho en el punto → copiar coordenadas)
            </span>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 4 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 140 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Latitud</span>
              <input value={manualLat} onChange={e => setManualLat(e.target.value)}
                     placeholder="-2.419400" style={{ fontFamily: 'monospace', fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 140 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Longitud</span>
              <input value={manualLng} onChange={e => setManualLng(e.target.value)}
                     placeholder="-79.343000" style={{ fontFamily: 'monospace', fontSize: 13 }} />
            </label>
            <button className="btn btn-secondary" onClick={handleManualApply} style={{ height: 38 }}>
              Aplicar
            </button>
          </div>
          {manualErr && <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px' }}>{manualErr}</p>}
        </div>

        <div className="form-actions" style={{ padding: '12px 16px' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={!picked || saving}
            onClick={() => picked && onSave(picked.lat, picked.lng)}
          >
            {saving ? 'Guardando...' : '💾 Guardar ubicación'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Photo thumbnail component that loads full data on demand
function PhotoThumb({ photo, incidentId, user, onView, onDelete }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    getPhoto(incidentId, photo.id).then(full => setSrc(full.data)).catch(() => {});
  }, [photo.id]);

  const canDelete = ['admin', 'supervisor'].includes(user?.role) || photo.uploaded_by === user?.id;

  return (
    <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: '#f1f5f9', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
      {src ? (
        <img
          src={src}
          alt={photo.filename}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onClick={onView}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
          📷
        </div>
      )}
      {canDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)',
            border: 'none', color: '#fff', borderRadius: 99, width: 22, height: 22,
            fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >✕</button>
      )}
    </div>
  );
}

// Image compression utility
async function compressImage(file, maxWidth) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const data = canvas.toDataURL('image/jpeg', 0.8);
        resolve({ data });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
