import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import IncidentsPage from './pages/IncidentsPage';
import IncidentDetailPage from './pages/IncidentDetailPage';
import UsersPage from './pages/UsersPage';
import ReportsPage from './pages/ReportsPage';
import ConfigPage from './pages/ConfigPage';
import MapPage from './pages/MapPage';
import MaintenancePage from './pages/MaintenancePage';
import OnCallPage from './pages/OnCallPage';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } });

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SocketProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/incidencias" element={<ProtectedRoute><IncidentsPage /></ProtectedRoute>} />
              <Route path="/incidencias/:id" element={<ProtectedRoute><IncidentDetailPage /></ProtectedRoute>} />
              <Route path="/usuarios" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />
              <Route path="/reportes" element={<ProtectedRoute roles={['admin', 'supervisor']}><ReportsPage /></ProtectedRoute>} />
              <Route path="/configuracion" element={<ProtectedRoute roles={['admin']}><ConfigPage /></ProtectedRoute>} />
              <Route path="/mapa" element={<ProtectedRoute roles={['admin', 'supervisor', 'technician']}><MapPage /></ProtectedRoute>} />
              <Route path="/mantenimientos" element={<ProtectedRoute roles={['admin', 'supervisor']}><MaintenancePage /></ProtectedRoute>} />
              <Route path="/guardia" element={<ProtectedRoute roles={['admin', 'supervisor']}><OnCallPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
