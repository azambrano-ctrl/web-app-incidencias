import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser, updateUser, deactivateUser, resetPassword } from '../api/users.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import { ROLE_LABELS } from '../utils/constants';
import { toast } from 'react-hot-toast';

const EMPTY = { name: '', email: '', password: '', role: 'technician', phone: '' };

export default function UsersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [resetId, setResetId] = useState(null);
  const [newPass, setNewPass] = useState('');

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => getUsers() });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const openCreate = () => { setForm(EMPTY); setEditing(null); setShowForm(true); };
  const openEdit = (u) => { setForm({ ...u, password: '' }); setEditing(u); setShowForm(true); };

  const saveMut = useMutation({
    mutationFn: (data) => editing ? updateUser(editing.id, data) : createUser(data),
    onSuccess: () => { toast.success(editing ? 'Usuario actualizado' : 'Usuario creado'); setShowForm(false); qc.invalidateQueries(['users']); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const deactivateMut = useMutation({
    mutationFn: (id) => deactivateUser(id),
    onSuccess: () => { toast.success('Usuario desactivado'); qc.invalidateQueries(['users']); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const resetMut = useMutation({
    mutationFn: () => resetPassword(resetId, newPass),
    onSuccess: () => { toast.success('Contraseña restablecida'); setResetId(null); setNewPass(''); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Gestión de usuarios" />
        <div className="page-body">
          <div className="page-toolbar">
            <div />
            <button className="btn btn-primary" onClick={openCreate}>+ Nuevo usuario</button>
          </div>

          {isLoading ? <div className="loading-center">Cargando...</div> : (
            <div className="table-wrap">
              <table className="incidents-table">
                <thead>
                  <tr>
                    <th>Nombre</th><th>Correo</th><th>Rol</th><th>Teléfono</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td><span className="role-badge">{ROLE_LABELS[u.role]}</span></td>
                      <td>{u.phone || '—'}</td>
                      <td>
                        <span className={`badge ${u.active ? 'badge-green' : 'badge-gray'}`}>
                          {u.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(u)}>Editar</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => { setResetId(u.id); setNewPass(''); }}>Contraseña</button>
                        {u.active === 1 && (
                          <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(`¿Desactivar a ${u.name}?`)) deactivateMut.mutate(u.id); }}>Desactivar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Editar usuario' : 'Nuevo usuario'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); saveMut.mutate(form); }} className="incident-form">
              <div className="form-row two-cols">
                <label>Nombre * <input value={form.name} onChange={e => set('name', e.target.value)} required /></label>
                <label>Correo * <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required /></label>
              </div>
              {!editing && (
                <div className="form-row">
                  <label>Contraseña * <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} /></label>
                </div>
              )}
              <div className="form-row two-cols">
                <label>Rol *
                  <select value={form.role} onChange={e => set('role', e.target.value)}>
                    <option value="technician">Técnico</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <label>Teléfono <input value={form.phone} onChange={e => set('phone', e.target.value)} /></label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetId && (
        <div className="modal-overlay" onClick={() => setResetId(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Restablecer contraseña</h3>
              <button className="modal-close" onClick={() => setResetId(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label>Nueva contraseña
                <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} minLength={6} placeholder="Mínimo 6 caracteres" />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setResetId(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={newPass.length < 6 || resetMut.isPending} onClick={() => resetMut.mutate()}>
                {resetMut.isPending ? 'Guardando...' : 'Cambiar contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
